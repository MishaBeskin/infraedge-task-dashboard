-- Stack — Phase 3 fix: atomic sprint activation. Paste into the Supabase SQL
-- editor AFTER 0001..0007.
--
-- SprintService.setActiveSprint previously sequenced two client-side UPDATEs
-- (flip the old active sprint to 'planned', then flip the target to 'active')
-- to satisfy the `one_active_sprint_per_team` partial unique index. If the
-- first write succeeded and the second failed, the client had no way to tell
-- local state apart from actual DB state (old sprint 'planned', nothing
-- active) without a re-fetch — and two members racing to activate different
-- sprints concurrently could interleave the same way server-side. Moving both
-- flips into one SECURITY DEFINER transaction closes both gaps, mirroring
-- create_team / accept_invitation / invite_to_team in 0004_teams.sql.
create or replace function public.set_active_sprint(p_team_id uuid, p_sprint_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_team_member(p_team_id) then
    raise exception 'not_team_member';
  end if;

  if not exists (
    select 1 from public.sprints where id = p_sprint_id and team_id = p_team_id
  ) then
    raise exception 'sprint_not_found';
  end if;

  update public.sprints
    set status = 'planned'
    where team_id = p_team_id
      and status = 'active'
      and id <> p_sprint_id;

  update public.sprints
    set status = 'active'
    where id = p_sprint_id;
end;
$$;
