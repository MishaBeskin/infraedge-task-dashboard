-- Stack — Phase 3: sprints. Paste into the Supabase SQL editor AFTER 0001..0006.
-- Team-scoped sprints: a team can plan work in named, time-boxed sprints. A
-- task's sprint_id is optional (NULL = backlog). At most one 'active' sprint
-- per team, enforced by a partial unique index — the client sequences the
-- swap (flip the old active sprint to 'planned', then activate the new one)
-- so it never trips this constraint.

create table if not exists public.sprints (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams (id) on delete cascade,
  name       text not null,
  starts_on  date,
  ends_on    date,
  status     text not null default 'planned' check (status in ('planned', 'active', 'completed')),
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.tasks add column if not exists sprint_id uuid references public.sprints (id) on delete set null;

-- The sprint selector / panel list by team, ordered by position.
create index if not exists sprints_team_position_idx on public.sprints (team_id, position);

create unique index if not exists one_active_sprint_per_team
  on public.sprints (team_id)
  where status = 'active';

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.sprints enable row level security;

drop policy if exists "sprints: select team" on public.sprints;
create policy "sprints: select team" on public.sprints for select using (public.is_team_member(team_id));
drop policy if exists "sprints: insert team" on public.sprints;
create policy "sprints: insert team" on public.sprints for insert with check (public.is_team_member(team_id));
drop policy if exists "sprints: update team" on public.sprints;
create policy "sprints: update team" on public.sprints for update using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
drop policy if exists "sprints: delete team" on public.sprints;
create policy "sprints: delete team" on public.sprints for delete using (public.is_team_member(team_id));
