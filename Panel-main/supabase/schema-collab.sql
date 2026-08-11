-- ============================================================================
-- Skelety · Collaboratori (workspace + ruoli + permessi + inviti)
--
-- Trasforma il modello da "personale" (ogni utente vede solo i suoi dati) a
-- "workspace condiviso": più utenti collaborano sugli stessi dati con ruoli e
-- permessi per sezione.
--
-- PARTE 1 (ADDITIVA, sicura): tabelle nuove + funzioni + RLS. NON tocca le 5
--          tabelle dati esistenti, quindi l'app attuale continua a funzionare.
-- PARTE 2 (IL "FLIP"): migra le 5 tabelle dati a workspace_id. Va applicata
--          INSIEME al deploy dell'app aggiornata (vedi in fondo, commentata).
-- ============================================================================

-- ---------- PARTE 1 · fondamenta (additiva) ----------

do $$ begin
  create type public.member_role as enum ('owner','admin','editor','contributor','viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invite_status as enum ('pending','accepted','revoked');
exception when duplicate_object then null; end $$;

create table if not exists public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'Il mio spazio',
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         public.member_role not null default 'viewer',
  -- override puntuali per sezione, es. {"assets":"edit","appointments":"view"}
  overrides    jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.invitations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email        text not null,
  role         public.member_role not null default 'viewer',
  overrides    jsonb not null default '{}',
  status       public.invite_status not null default 'pending',
  invited_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists members_user_idx on public.workspace_members (user_id);
create index if not exists invites_email_idx on public.invitations (lower(email));
-- un solo invito per email per workspace (case-insensitive)
create unique index if not exists invites_ws_email_uidx on public.invitations (workspace_id, lower(email));

-- ---------- Funzioni helper (permessi) ----------
-- Sezioni valide: 'clients','assets','notes','tasks','appointments'

-- permesso di default per ruolo su una sezione ('edit' | 'view' | 'none')
create or replace function public.role_perm(r public.member_role, section text)
returns text language sql immutable as $$
  select case
    when r in ('owner','admin','editor') then 'edit'
    when r = 'contributor' then case when section in ('notes','tasks','appointments') then 'edit' else 'view' end
    else 'view'
  end;
$$;

-- permesso effettivo dell'utente corrente su una sezione (override poi ruolo)
create or replace function public.perm(ws uuid, section text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(m.overrides->>section, ''),
    public.role_perm(m.role, section)
  )
  from public.workspace_members m
  where m.workspace_id = ws and m.user_id = auth.uid();
$$;

create or replace function public.is_member(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_edit(ws uuid, section text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.perm(ws, section) = 'edit';
$$;

create or replace function public.is_admin(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid() and m.role in ('owner','admin')
  );
$$;

-- Alla creazione di un workspace, il creatore diventa 'owner' tra i membri
create or replace function public.add_owner_membership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_ws_owner on public.workspaces;
create trigger trg_ws_owner after insert on public.workspaces
  for each row execute function public.add_owner_membership();

-- ---------- RLS sulle tabelle nuove ----------
alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;
alter table public.invitations       enable row level security;

-- workspaces: i membri leggono; gli admin aggiornano; il proprietario elimina
drop policy if exists ws_select on public.workspaces;
create policy ws_select on public.workspaces for select using (public.is_member(id));
drop policy if exists ws_insert on public.workspaces;
create policy ws_insert on public.workspaces for insert with check (owner_id = auth.uid());
drop policy if exists ws_update on public.workspaces;
create policy ws_update on public.workspaces for update using (public.is_admin(id)) with check (public.is_admin(id));
drop policy if exists ws_delete on public.workspaces;
create policy ws_delete on public.workspaces for delete using (owner_id = auth.uid());

-- members: i membri vedono i membri; gli admin gestiscono i non-owner;
-- ognuno può togliersi da solo (leave)
drop policy if exists m_select on public.workspace_members;
create policy m_select on public.workspace_members for select using (public.is_member(workspace_id));
drop policy if exists m_insert on public.workspace_members;
create policy m_insert on public.workspace_members for insert
  with check (public.is_admin(workspace_id) and role <> 'owner');
drop policy if exists m_update on public.workspace_members;
create policy m_update on public.workspace_members for update
  using (public.is_admin(workspace_id) and role <> 'owner')
  with check (public.is_admin(workspace_id) and role <> 'owner');
drop policy if exists m_delete on public.workspace_members;
create policy m_delete on public.workspace_members for delete
  using ((public.is_admin(workspace_id) and role <> 'owner') or user_id = auth.uid());

-- invitations: solo gli admin del workspace
drop policy if exists inv_all on public.invitations;
create policy inv_all on public.invitations for all
  using (public.is_admin(workspace_id)) with check (public.is_admin(workspace_id));

-- ============================================================================
-- PARTE 2 · IL "FLIP" delle 5 tabelle dati (applicare col deploy dell'app)
-- Aggiunge workspace_id e sposta la RLS da user_id a membership+permesso.
-- Lasciata commentata: la applichiamo insieme all'app aggiornata.
-- ============================================================================
-- alter table public.clients      add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
-- alter table public.assets       add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
-- alter table public.notes        add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
-- alter table public.tasks        add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
-- alter table public.appointments add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
--
-- -- Esempio (clients): sostituire la policy "own rows" con membership+permesso
-- -- drop policy "own rows" on public.clients;
-- -- create policy clients_read  on public.clients for select using (public.is_member(workspace_id));
-- -- create policy clients_write on public.clients for all
-- --   using (public.can_edit(workspace_id,'clients')) with check (public.can_edit(workspace_id,'clients'));
-- -- (ripetere per assets/notes/tasks/appointments con la rispettiva sezione)
