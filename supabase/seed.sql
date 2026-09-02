-- Stack — seed data. Migrates the two demo users + their tasks from the old
-- db.json into Supabase Auth. Run ONCE, after 0001_init.sql.
--
-- After running you can sign in with:
--   alice@example.com / alice123
--   bob@example.com   / bob123
--
-- Re-running is safe: every insert is guarded by a NOT EXISTS check.
--
-- If the auth.users INSERT fails on your Supabase version (the internal schema
-- occasionally gains a NOT NULL column without a default), use the fallback
-- script instead: scripts/create-users.mjs — then re-run just the tasks block.

create extension if not exists pgcrypto;

do $$
declare
  alice_id uuid := 'a0000000-0000-4000-8000-000000000001';
  bob_id   uuid := 'b0000000-0000-4000-8000-000000000002';
begin
  ------------------------------------------------------------------ Alice
  if not exists (select 1 from auth.users where id = alice_id) then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', alice_id, 'authenticated', 'authenticated',
      'alice@example.com', crypt('alice123', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Alice Johnson"}'::jsonb,
      '', '', '', ''
    );
    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), alice_id, alice_id::text,
      jsonb_build_object('sub', alice_id::text, 'email', 'alice@example.com', 'email_verified', true),
      'email', now(), now(), now()
    );
  end if;

  ------------------------------------------------------------------ Bob
  if not exists (select 1 from auth.users where id = bob_id) then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', bob_id, 'authenticated', 'authenticated',
      'bob@example.com', crypt('bob123', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Bob Smith"}'::jsonb,
      '', '', '', ''
    );
    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), bob_id, bob_id::text,
      jsonb_build_object('sub', bob_id::text, 'email', 'bob@example.com', 'email_verified', true),
      'email', now(), now(), now()
    );
  end if;

  ------------------------------------------------------------------ profiles
  -- the on_auth_user_created trigger already inserted these; upsert the names
  -- in case the seed runs against rows created some other way.
  insert into public.profiles (id, name)
  values (alice_id, 'Alice Johnson'), (bob_id, 'Bob Smith')
  on conflict (id) do update set name = excluded.name;

  ------------------------------------------------------------------ tasks (from db.json)
  if not exists (select 1 from public.tasks where user_id in (alice_id, bob_id)) then
    insert into public.tasks (user_id, title, status, priority, position) values
      (alice_id, 'Redesign the onboarding flow',               'in-progress', 'high',   1),
      (alice_id, 'Fix date picker bug in Safari',              'todo',        'high',   2),
      (alice_id, 'Write unit tests for AuthService',           'done',        'medium', 3),
      (alice_id, 'Update third-party dependencies',            'done',        'low',    4),
      (alice_id, 'Set up CI pipeline',                         'in-progress', 'medium', 5),
      (bob_id,   'Migrate dashboard to standalone components', 'todo',        'high',   1),
      (bob_id,   'Review pull requests',                       'done',        'medium', 2);
  end if;
end $$;
