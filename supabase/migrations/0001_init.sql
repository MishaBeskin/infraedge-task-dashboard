-- Stack — initial schema for the Supabase migration.
-- Paste this into the Supabase SQL editor (or apply with the Supabase CLI),
-- then run supabase/seed.sql once to import the two demo users + their tasks.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- profiles: one row per auth user, created automatically on sign-up.
-- Holds the display name so the app never has to read auth.users directly.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null default '',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles: select own" on public.profiles;
create policy "profiles: select own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ─────────────────────────────────────────────────────────────────────────────
-- tasks: user_id defaults to auth.uid() so the client never sends it, and RLS
-- guarantees a user only ever sees or touches their own rows.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null,
  description text,
  status      text not null default 'todo'   check (status   in ('todo', 'in-progress', 'done')),
  priority    text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists tasks_user_status_position_idx
  on public.tasks (user_id, status, position);

alter table public.tasks enable row level security;

drop policy if exists "tasks: select own" on public.tasks;
create policy "tasks: select own" on public.tasks for select using (auth.uid() = user_id);

drop policy if exists "tasks: insert own" on public.tasks;
create policy "tasks: insert own" on public.tasks for insert with check (auth.uid() = user_id);

drop policy if exists "tasks: update own" on public.tasks;
create policy "tasks: update own" on public.tasks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "tasks: delete own" on public.tasks;
create policy "tasks: delete own" on public.tasks for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- keep updated_at fresh on every UPDATE
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- create a profile row whenever a new auth user is created (password, magic
-- link or Google). Name falls back: metadata.name -> metadata.full_name -> local
-- part of the email.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      split_part(coalesce(new.email, 'user'), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
