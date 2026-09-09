-- Stack — Phase 2: team boards. Paste into the Supabase SQL editor AFTER
-- 0001..0003. Turns the single-user board into a team-scoped shared board:
-- one team == one board, team name == board name (replaces profiles.board_name).
--
-- MANUAL VERIFICATION after running:
--   1. select count(*) from tasks_backup;            -- remember this number
--   2. select count(*) from tasks;                   -- must match (1)
--   3. select count(*) from tasks where team_id is null;   -- must be 0
--   4. select count(*) from team_members;            -- >= number of auth users
--   5. Sign in as each seed user, confirm their cards still show.
--   6. Only then:  drop table public.tasks_backup;

-- ── Checkpoint ──────────────────────────────────────────────────────────────
-- Re-running this migration refreshes the backup (drop-then-create) rather than
-- silently keeping a stale one from a previous run.
drop table if exists public.tasks_backup;
create table public.tasks_backup as select * from public.tasks;

-- ── Tables ─────────────────────────────────────────────────────────────────
create table if not exists public.teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'Board',
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id    uuid not null references public.teams (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.team_invitations (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  email       text,
  token       text not null unique default encode(gen_random_bytes(16), 'hex'),
  role        text not null default 'member' check (role in ('owner', 'member')),
  invited_by  uuid not null default auth.uid(),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id)
);

alter table public.tasks add column if not exists team_id uuid references public.teams (id) on delete cascade;
alter table public.tasks add column if not exists assignee_id uuid references auth.users (id) on delete set null;

-- The board query filters by team_id and orders by position — composite index.
-- The old per-user index is vestigial now that RLS is team-scoped.
drop index if exists public.tasks_user_status_position_idx;
create index if not exists tasks_team_position_idx on public.tasks (team_id, position);

-- One active link invite (email is null) per team — a fresh link replaces the
-- old one. The service deletes the prior open-link row before inserting a new
-- one; this index is the backstop.
create unique index if not exists one_open_link_invite_per_team
  on public.team_invitations (team_id)
  where email is null and accepted_at is null;

-- ── Helper functions (SECURITY DEFINER breaks RLS recursion) ────────────────
create or replace function public.is_team_member(t uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from team_members
    where team_id = t and user_id = auth.uid()
  );
$$;

create or replace function public.is_team_owner(t uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from team_members
    where team_id = t and user_id = auth.uid() and role = 'owner'
  );
$$;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.teams            enable row level security;
alter table public.team_members     enable row level security;
alter table public.team_invitations enable row level security;

-- teams
drop policy if exists "teams: select member"  on public.teams;
create policy "teams: select member"  on public.teams for select using (public.is_team_member(id));
drop policy if exists "teams: insert own"     on public.teams;
create policy "teams: insert own"     on public.teams for insert with check (created_by = auth.uid());
drop policy if exists "teams: update owner"   on public.teams;
create policy "teams: update owner"   on public.teams for update using (public.is_team_owner(id)) with check (public.is_team_owner(id));
drop policy if exists "teams: delete owner"   on public.teams;
create policy "teams: delete owner"   on public.teams for delete using (public.is_team_owner(id));

-- team_members
drop policy if exists "team_members: select member" on public.team_members;
create policy "team_members: select member" on public.team_members for select using (public.is_team_member(team_id));
drop policy if exists "team_members: insert owner"  on public.team_members;
create policy "team_members: insert owner"  on public.team_members for insert with check (public.is_team_owner(team_id));
drop policy if exists "team_members: delete owner or self" on public.team_members;
create policy "team_members: delete owner or self" on public.team_members for delete
  using (public.is_team_owner(team_id) or user_id = auth.uid());

-- team_invitations
drop policy if exists "team_invitations: select member or invitee" on public.team_invitations;
create policy "team_invitations: select member or invitee" on public.team_invitations for select
  using (public.is_team_member(team_id) or email = (auth.jwt() ->> 'email'));
drop policy if exists "team_invitations: insert owner" on public.team_invitations;
create policy "team_invitations: insert owner" on public.team_invitations for insert with check (public.is_team_owner(team_id));
drop policy if exists "team_invitations: delete owner" on public.team_invitations;
create policy "team_invitations: delete owner" on public.team_invitations for delete using (public.is_team_owner(team_id));

-- profiles: let teammates read each other's row (for the member list). The
-- subquery hits team_members, whose SELECT policy routes through the
-- SECURITY DEFINER is_team_member() — that function reads team_members with RLS
-- bypassed, so there is no policy-evaluates-policy recursion here.
drop policy if exists "profiles: select teammate" on public.profiles;
create policy "profiles: select teammate" on public.profiles for select
  using (exists (
    select 1
    from public.team_members me
    join public.team_members them on me.team_id = them.team_id
    where me.user_id = auth.uid() and them.user_id = public.profiles.id
  ));

-- tasks — drop the four per-user policies, replace with team-membership gates.
drop policy if exists "tasks: select own" on public.tasks;
drop policy if exists "tasks: insert own" on public.tasks;
drop policy if exists "tasks: update own" on public.tasks;
drop policy if exists "tasks: delete own" on public.tasks;
drop policy if exists "tasks: select team" on public.tasks;
drop policy if exists "tasks: insert team" on public.tasks;
drop policy if exists "tasks: update team" on public.tasks;
drop policy if exists "tasks: delete team" on public.tasks;

create policy "tasks: select team" on public.tasks for select using (public.is_team_member(team_id));
create policy "tasks: insert team" on public.tasks for insert
  with check (public.is_team_member(team_id) and user_id = auth.uid());
create policy "tasks: update team" on public.tasks for update using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
create policy "tasks: delete team" on public.tasks for delete using (public.is_team_member(team_id));

-- ── Triggers ───────────────────────────────────────────────────────────────
-- When a member is removed (or leaves), null out any tasks assigned to them so
-- the board never shows an assignee who's no longer on the team.
create or replace function public.unassign_removed_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update tasks set assignee_id = null
  where team_id = old.team_id and assignee_id = old.user_id;
  return old;
end;
$$;

drop trigger if exists team_member_removed on public.team_members;
create trigger team_member_removed
  after delete on public.team_members
  for each row execute function public.unassign_removed_member();

-- ── RPCs (SECURITY DEFINER) ────────────────────────────────────────────────
-- Bootstrap a team. Under RLS the client can't insert a `teams` row and then a
-- `team_members` owner row (the RETURNING select is gated by is_team_member, and
-- the members insert needs an owner that doesn't exist yet). This RPC does both
-- atomically as the definer.
create or replace function public.create_team(p_name text)
returns public.teams
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.teams;
begin
  insert into public.teams (name, created_by)
    values (coalesce(nullif(btrim(p_name), ''), 'Board'), auth.uid())
    returning * into t;
  insert into public.team_members (team_id, user_id, role)
    values (t.id, auth.uid(), 'owner');
  return t;
end;
$$;

-- Accept an invitation by token. Idempotent: an already-member caller still
-- gets the team_id back. Email invites are bound to their addressee and marked
-- accepted; link invites stay open until they expire so the shared link keeps
-- working.
create or replace function public.accept_invitation(tok text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv team_invitations%rowtype;
begin
  select * into inv from team_invitations where token = tok;
  if not found then
    raise exception 'invitation_not_found';
  end if;
  if inv.accepted_at is not null then
    raise exception 'invitation_used';
  end if;
  if inv.expires_at < now() then
    raise exception 'invitation_expired';
  end if;
  if inv.email is not null and lower(inv.email) <> lower(auth.jwt() ->> 'email') then
    raise exception 'invitation_wrong_account';
  end if;

  insert into team_members (team_id, user_id, role)
  values (inv.team_id, auth.uid(), inv.role)
  on conflict (team_id, user_id) do nothing;

  if inv.email is not null then
    update team_invitations
      set accepted_at = now(), accepted_by = auth.uid()
      where id = inv.id;
  end if;

  return inv.team_id;
end;
$$;

-- Owner-only email invite. Resolves the address against auth.users (readable
-- here because SECURITY DEFINER), rejects unknown addresses, existing members
-- and duplicate pending invites, then writes the invitation row.
create or replace function public.invite_to_team(p_team_id uuid, p_email text, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  if not public.is_team_owner(p_team_id) then
    raise exception 'not_owner';
  end if;

  select id into target from auth.users where lower(email) = lower(p_email) limit 1;
  if target is null then
    raise exception 'no_account';
  end if;

  if exists (select 1 from team_members where team_id = p_team_id and user_id = target) then
    raise exception 'already_member';
  end if;

  if exists (
    select 1 from team_invitations
    where team_id = p_team_id
      and lower(email) = lower(p_email)
      and accepted_at is null
      and expires_at > now()
  ) then
    raise exception 'already_invited';
  end if;

  insert into team_invitations (team_id, email, role, invited_by)
  values (p_team_id, lower(p_email), coalesce(p_role, 'member'), auth.uid());
end;
$$;

-- Owner-only team deletion. Cascades to tasks / members / invitations. Refuses
-- to strand the caller with zero teams.
create or replace function public.delete_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_team_owner(p_team_id) then
    raise exception 'not_owner';
  end if;
  if (select count(*) from team_members where user_id = auth.uid()) <= 1 then
    raise exception 'last_team';
  end if;
  delete from teams where id = p_team_id;
end;
$$;

-- Leave a team. Refuses to strand the caller with zero teams.
create or replace function public.leave_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from team_members where user_id = auth.uid()) <= 1 then
    raise exception 'last_team';
  end if;
  delete from team_members where team_id = p_team_id and user_id = auth.uid();
end;
$$;

-- ── Data migration ─────────────────────────────────────────────────────────
-- One team per existing profile, named from the old board_name (default 'Board').
insert into teams (id, name, created_by)
select gen_random_uuid(), coalesce(nullif(p.board_name, ''), 'Board'), p.id
from profiles p
where not exists (select 1 from team_members tm where tm.user_id = p.id);

-- Safety net for any auth user without a profiles row.
insert into teams (id, name, created_by)
select gen_random_uuid(), 'Board', u.id
from auth.users u
where not exists (select 1 from team_members tm where tm.user_id = u.id)
  and not exists (select 1 from profiles p where p.id = u.id);

-- Creator becomes owner of their team.
insert into team_members (team_id, user_id, role)
select t.id, t.created_by, 'owner' from teams t
where not exists (
  select 1 from team_members tm where tm.team_id = t.id and tm.user_id = t.created_by
);

-- Attach every existing task to its owner's team.
update tasks set team_id = tm.team_id
from team_members tm
where tasks.user_id = tm.user_id and tasks.team_id is null;

alter table tasks alter column team_id set not null;
