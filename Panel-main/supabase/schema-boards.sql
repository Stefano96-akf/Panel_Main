-- ============================================================================
-- Skelety · Bacheche Kanban multiple con accesso ristretto per-bacheca
--
-- Fondamenta (tabelle boards / board_members, funzioni is_board_member/board_ws,
-- trigger limite-3 e auto-membership del creatore, RLS) sono già applicate dalla
-- migration `skelety_boards_foundation`. Questo file documenta il "FLIP" dei task
-- verso il modello per-bacheca, in DUE parti per non rompere l'app live.
--
-- PARTE A (ADDITIVA, retro-compatibile): si applica PRIMA del deploy dell'app.
--   - board_id sui task è NULLABLE → l'app vecchia continua a scrivere senza.
--   - cols diventa un ARRAY ordinato [{id,label}] (le colonne dinamiche hanno
--     bisogno dell'ordine; jsonb-oggetto non preserva l'ordine delle chiavi).
--   - board_members_emails(): elenco email dei membri di una bacheca.
-- PARTE B (IL FLIP): si applica DOPO il deploy dell'app aggiornata.
--   - board_id NOT NULL + RLS dei task da workspace-based a per-bacheca.
-- ============================================================================

-- ---------- PARTE A · additiva (pre-deploy) ----------

-- Colonne come array ordinato (boards è vuota → cambio di default sicuro).
alter table public.boards alter column cols set default
  '[{"id":"todo","label":"Da fare"},{"id":"doing","label":"In corso"},{"id":"done","label":"Completato"}]'::jsonb;

-- board_id sui task: NULLABLE in questa fase (l'app vecchia inserisce senza).
alter table public.tasks add column if not exists board_id uuid
  references public.boards(id) on delete cascade;
create index if not exists tasks_board_idx on public.tasks (board_id);

-- Email dei membri di una bacheca (join con auth.users, non leggibile lato
-- client; ristretto ai soli membri della bacheca richiesta).
create or replace function public.board_members_emails(b uuid)
returns table (user_id uuid, email text)
language sql stable security definer set search_path = public as $$
  select m.user_id, u.email
  from public.board_members m
  join auth.users u on u.id = m.user_id
  where m.board_id = b and public.is_board_member(b)
  order by m.created_at;
$$;
revoke execute on function public.board_members_emails(uuid) from public, anon;
grant  execute on function public.board_members_emails(uuid) to authenticated;

-- ---------- PARTE B · il flip (post-deploy) ----------

-- Backfill di sicurezza: eventuali task senza bacheca → prima bacheca del loro
-- workspace (nel nostro caso i task sono ~0, quindi è un no-op difensivo).
-- update public.tasks t set board_id = (
--   select b.id from public.boards b
--   where b.workspace_id = t.workspace_id order by b.created_at limit 1
-- ) where t.board_id is null;

-- alter table public.tasks alter column board_id set not null;

-- RLS: da "membro del workspace" a "membro della bacheca" (+ permesso tasks).
-- drop policy if exists tasks_read on public.tasks;
-- create policy tasks_read on public.tasks for select
--   using (public.is_board_member(board_id));
-- drop policy if exists tasks_write on public.tasks;
-- create policy tasks_write on public.tasks for all
--   using (public.is_board_member(board_id) and public.can_edit(workspace_id, 'tasks'))
--   with check (public.is_board_member(board_id) and public.can_edit(workspace_id, 'tasks'));
