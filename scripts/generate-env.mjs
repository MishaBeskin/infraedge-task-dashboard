// Writes src/environments/environment.prod.ts from environment variables at
// build time so each deploy can supply its own Supabase project without a commit.
//
//   SUPABASE_URL       — https://<ref>.supabase.co
//   SUPABASE_ANON_KEY  — publishable / anon key (public; RLS protects the data)
//
// If BOTH are set, the file is regenerated. If either is missing, the committed
// file is left untouched so `ng build` on a fresh clone still works with the
// checked-in fallback.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;

const target = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../src/environments/environment.prod.ts',
);

if (!url || !key) {
  console.log(
    '[generate-env] SUPABASE_URL / SUPABASE_ANON_KEY not both set — ' +
      'keeping committed src/environments/environment.prod.ts',
  );
  process.exit(0);
}

const contents = `export const environment = {
  production: true,
  // Generated at build time by scripts/generate-env.mjs from the
  // SUPABASE_URL / SUPABASE_ANON_KEY environment variables.
  supabaseUrl: '${url}',
  supabaseAnonKey: '${key}',
};
`;

writeFileSync(target, contents);
console.log(`[generate-env] wrote src/environments/environment.prod.ts (supabaseUrl=${url})`);
