-- Stack — restrict who may change a task's assignee. Paste into the Supabase SQL
-- editor AFTER 0001..0005. Idempotent.
--
-- Rule: a team OWNER may set / change / clear `tasks.assignee_id` freely. A plain
-- MEMBER may only move it between NULL and their own uid (self-assign, or
-- unassign themselves) — they can never assign, reassign or unassign anyone
-- else. The `tasks: update team` / `insert team` RLS policies still gate row
-- access; this trigger adds the column-level check RLS can't express (it needs
-- OLD vs NEW).
--
-- Note: the `unassign_removed_member` trigger (0004) nulls a departing member's
-- assignments. That path is fine here — the owner removing someone is
-- `is_team_owner`, and a member leaving only ever clears their own uid.

create or replace function public.enforce_assignee_permission()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.assignee_id is not null
       and new.assignee_id <> auth.uid()
       and not public.is_team_owner(new.team_id) then
      raise exception 'assignee_forbidden';
    end if;
    return new;
  end if;

  -- UPDATE: only act when assignee_id actually changes.
  if new.assignee_id is distinct from old.assignee_id then
    if not public.is_team_owner(new.team_id)
       and not (
         coalesce(old.assignee_id, auth.uid()) = auth.uid()
         and coalesce(new.assignee_id, auth.uid()) = auth.uid()
       ) then
      raise exception 'assignee_forbidden';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_enforce_assignee on public.tasks;
create trigger tasks_enforce_assignee
  before insert or update on public.tasks
  for each row execute function public.enforce_assignee_permission();
