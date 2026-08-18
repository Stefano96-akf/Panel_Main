-- ============================================================================
-- Skelety · Gruppi/cartelle a 2 livelli per gli Elementi (sezione "clients")
--
-- ADDITIVA e retro-compatibile: l'app precedente ignora sia la tabella `groups`
-- sia `clients.group_id`. Il sync rispecchia `panel_groups` → tabella `groups`
-- col permesso della sezione Elementi (`clients`). Nessun FK su parent_id /
-- group_id: la sincronizzazione snapshot è eventualmente-consistente e l'app
-- normalizza in lettura (un id di gruppo mancante = "senza gruppo").
-- (Applicata come migration `skelety_groups_for_clients`.)
-- ============================================================================

create table if not exists public.groups (
  id           text primary key,               -- id generato dal client
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null default auth.uid(),
  name         text not null default '',
  parent_id    text,                            -- gruppo padre (null = top). Nessun FK.
  created_at   timestamptz not null default now()
);
create index if not exists groups_ws_idx on public.groups(workspace_id);

alter table public.groups enable row level security;
drop policy if exists groups_read on public.groups;
create policy groups_read on public.groups for select
  using (public.is_member(workspace_id));
drop policy if exists groups_write on public.groups;
create policy groups_write on public.groups for all
  using (public.can_edit(workspace_id, 'clients'))
  with check (public.can_edit(workspace_id, 'clients'));

-- Riferimento al gruppo/sotto-gruppo sull'elemento (nessun FK: tollerante)
alter table public.clients add column if not exists group_id text;
create index if not exists clients_group_idx on public.clients(group_id);
