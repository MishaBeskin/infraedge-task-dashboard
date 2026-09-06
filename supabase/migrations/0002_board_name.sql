-- Stack — add a per-user custom board name.
-- Paste into the Supabase SQL editor after 0001_init.sql.
alter table public.profiles
  add column if not exists board_name text;

-- Backfill a profiles row for any pre-existing auth user that lacks one
-- (seed users created before the handle_new_user trigger existed).
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;
