-- Stack — fix: every new signup needs a personal team. Paste into the
-- Supabase SQL editor AFTER 0001..0008.
--
-- 0004_teams.sql backfilled a personal team for every user that existed *at
-- that moment*, but `handle_new_user()` (the trigger that fires on every new
-- auth.users row — password, magic link, or Google) was never updated to
-- also create one. Anyone who signed up after 0004 ran ends up with zero rows
-- in `team_members`, so `activeTeamId` resolves to null on the client and
-- `tasks: insert team`'s RLS check (`is_team_member(team_id)`) rejects the
-- insert — a 403 on the very first "create task". Google OAuth exposes this
-- fastest since it lands on /board with a live session immediately (no
-- email-confirmation step in between), but the gap affects every signup path.
--
-- Fix: extend the trigger to also create a personal team + owner membership,
-- as one SECURITY DEFINER unit (mirrors create_team in 0004_teams.sql —
-- inserting `teams` then `team_members` as two client calls doesn't work
-- under RLS: the owner row that would let a `teams` SELECT succeed doesn't
-- exist yet after the first insert). Then backfill anyone already stuck
-- without a team since 0004 ran.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.teams;
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

  -- Defensive (not expected on a genuine signup): skip if this id somehow
  -- already belongs to a team, so re-running this trigger logic is idempotent.
  if not exists (select 1 from public.team_members where user_id = new.id) then
    insert into public.teams (name, created_by) values ('Board', new.id) returning * into t;
    insert into public.team_members (team_id, user_id, role) values (t.id, new.id, 'owner');
  end if;

  return new;
end;
$$;

-- ── Backfill: anyone who signed up between 0004 and this migration ─────────
insert into public.teams (id, name, created_by)
select gen_random_uuid(), 'Board', u.id
from auth.users u
where not exists (select 1 from public.team_members tm where tm.user_id = u.id);

insert into public.team_members (team_id, user_id, role)
select t.id, t.created_by, 'owner'
from public.teams t
where not exists (
  select 1 from public.team_members tm where tm.team_id = t.id and tm.user_id = t.created_by
);
