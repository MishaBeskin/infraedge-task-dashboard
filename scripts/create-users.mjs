/**
 * Fallback for supabase/seed.sql when a direct INSERT into auth.users doesn't
 * work on your Supabase version. Creates the two demo users through the
 * officially-supported Auth Admin API.
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_URL = "https://<ref>.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY = "<service_role key from Project Settings > API>"
 *   node scripts/create-users.mjs
 *
 * The service_role key bypasses RLS — never ship it in the app or commit it.
 * After this runs, execute only the "tasks (from db.json)" block of
 * supabase/seed.sql (the user ids there are hard-coded; replace them with the
 * ids this script prints, or just recreate the tasks however you like).
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const users = [
  { email: 'alice@example.com', password: 'alice123', name: 'Alice Johnson' },
  { email: 'bob@example.com', password: 'bob123', name: 'Bob Smith' },
];

for (const u of users) {
  const { data, error } = await admin.auth.admin.createUser({
    email: u.email,
    password: u.password,
    email_confirm: true,
    user_metadata: { name: u.name },
  });
  console.log(
    error ? `x ${u.email}: ${error.message}` : `ok ${u.email} -> ${data.user.id}`
  );
}
