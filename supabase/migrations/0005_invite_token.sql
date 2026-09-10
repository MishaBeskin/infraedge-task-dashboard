-- Stack — Phase 2 Pass B follow-up: make `invite_to_team` hand back the new
-- invitation token so the `send-team-invite` Edge Function can build the
-- /invite/<token> link for the email. Paste into the Supabase SQL editor AFTER
-- 0001..0004. Idempotent (create or replace).
--
-- Behaviour is otherwise unchanged: still owner-only, still rejects unknown
-- addresses (`no_account`), existing members (`already_member`) and duplicate
-- pending invites (`already_invited`).

-- `create or replace` can't change a function's return type (void -> text),
-- so drop the old signature first. Safe to re-run.
drop function if exists public.invite_to_team(uuid, text, text);

create function public.invite_to_team(p_team_id uuid, p_email text, p_role text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
  tok    text;
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
  values (p_team_id, lower(p_email), coalesce(p_role, 'member'), auth.uid())
  returning token into tok;

  return tok;
end;
$$;
