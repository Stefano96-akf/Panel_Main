-- ============================================================================
-- Skelety · Link d'invito condivisibile per workspace
--
-- Chi apre il link (`/app.html?join=<token>`) entra nello spazio con l'account
-- che preferisce (qualsiasi email), col ruolo scelto dall'admin — a differenza
-- dell'invito via email, che è legato a un indirizzo specifico.
--
-- Il token è un SEGRETO: sta in una tabella dedicata con RLS admin-only, NON su
-- `workspaces` (che i membri possono leggere via ws_select = is_member). L'ingresso
-- avviene tramite la funzione SECURITY DEFINER `join_workspace_by_token`, che
-- risolve il token bypassando la RLS e aggiunge il chiamante come membro.
-- (Applicata come migration `workspace_join_links`.)
-- ============================================================================

create table if not exists public.workspace_join_links (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  token        uuid not null default gen_random_uuid(),
  role         public.member_role not null default 'viewer',
  created_at   timestamptz not null default now(),
  constraint jl_role_not_owner check (role <> 'owner')   -- il link non può conferire 'owner'
);

create unique index if not exists workspace_join_links_token_uidx
  on public.workspace_join_links(token);

alter table public.workspace_join_links enable row level security;

-- Solo gli admin del workspace leggono/gestiscono il link (e quindi il token).
drop policy if exists jl_admin on public.workspace_join_links;
create policy jl_admin on public.workspace_join_links
  for all to authenticated
  using (public.is_admin(workspace_id))
  with check (public.is_admin(workspace_id));

grant select, insert, update, delete on public.workspace_join_links to authenticated;
revoke all on public.workspace_join_links from anon;   -- nessun accesso anonimo al segreto

-- Entra in un workspace tramite token (qualsiasi utente autenticato).
create or replace function public.join_workspace_by_token(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare wid uuid; wrole public.member_role;
begin
  if p_token is null then return null; end if;
  select workspace_id, role into wid, wrole
  from public.workspace_join_links where token = p_token;
  if wid is null then return null; end if;
  insert into public.workspace_members (workspace_id, user_id, role, overrides)
  values (wid, auth.uid(), wrole, '{}'::jsonb)
  on conflict (workspace_id, user_id) do nothing;
  return wid;
end $$;

revoke all on function public.join_workspace_by_token(uuid) from public, anon;
grant execute on function public.join_workspace_by_token(uuid) to authenticated;
