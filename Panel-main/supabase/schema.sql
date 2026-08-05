-- ============================================================================
-- PanLink · Schema Supabase (Postgres)
-- Da eseguire una volta nell'SQL Editor del progetto Supabase.
--
-- Modello: le 5 "tabelle" oggi in localStorage diventano tabelle Postgres.
-- - La PRIMARY KEY è `text` = l'id generato dal client (Utils.generateId),
--   così la sincronizzazione snapshot (upsert per id) è semplice e senza
--   rimappature.
-- - `user_id` collega ogni riga all'utente autenticato; il default `auth.uid()`
--   la popola in automatico all'insert.
-- - La Row Level Security (RLS) è ciò che protegge davvero i dati: ogni utente
--   vede/modifica SOLO le proprie righe. La `anon key` nel client è pubblica
--   per design.
-- ============================================================================

-- gen non necessario (id dal client), ma utile se in futuro servisse gen_random_uuid()
create extension if not exists "pgcrypto";

-- ---------- TABELLE ----------
create table if not exists public.assets (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  description text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists public.clients (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome        text not null,
  link        text not null,
  asset_ids   text[] not null default '{}',
  created_at  timestamptz not null default now()
);

create table if not exists public.notes (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.tasks (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text        text not null,
  status      text not null default 'todo' check (status in ('todo','doing','done')),
  completed   boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.appointments (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date        date,
  description text not null,
  type        text not null default 'remote' check (type in ('remote','onsite')),
  completed   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------- INDICI (query filtrate per utente) ----------
create index if not exists assets_user_idx       on public.assets (user_id);
create index if not exists clients_user_idx       on public.clients (user_id);
create index if not exists notes_user_idx         on public.notes (user_id);
create index if not exists tasks_user_idx         on public.tasks (user_id);
create index if not exists appointments_user_idx  on public.appointments (user_id);

-- ---------- ROW LEVEL SECURITY ----------
alter table public.assets       enable row level security;
alter table public.clients      enable row level security;
alter table public.notes        enable row level security;
alter table public.tasks        enable row level security;
alter table public.appointments enable row level security;

-- Una policy "own rows" per tabella: l'utente opera solo sulle proprie righe.
-- (drop+create per rendere lo script ri-eseguibile senza errori)
drop policy if exists "own rows" on public.assets;
create policy "own rows" on public.assets       for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows" on public.clients;
create policy "own rows" on public.clients      for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows" on public.notes;
create policy "own rows" on public.notes        for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows" on public.tasks;
create policy "own rows" on public.tasks        for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows" on public.appointments;
create policy "own rows" on public.appointments for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
