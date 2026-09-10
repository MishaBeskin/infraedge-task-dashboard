# send-team-invite

Edge Function that emails a team invitation link via the SendGrid HTTP API.
Called by `TeamService.inviteByEmail()`.

## One-time setup

### 1. Run the migration

Paste `supabase/migrations/0005_invite_token.sql` into the Supabase SQL editor
(after `0001`–`0004`). It makes `invite_to_team` return the new invite token.

### 2. SendGrid API key

Create a key with **Mail Send** permission:
SendGrid → Settings → API Keys → Create API Key → Restricted Access → Mail Send.

You can reuse the key already configured for Supabase Auth SMTP **only if you
saved its value** — Supabase doesn't let you read it back. A separate key is
recommended so it can be revoked without breaking auth email.

The `from:` address must be a **verified sender** in SendGrid (Single Sender
Verification or domain authentication). Deliverability from a `gmail.com` sender
is poor (DMARC) — use a domain sender in production.

### 3. Deploy

**CLI:**

```bash
npm i -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase functions deploy send-team-invite
supabase secrets set \
  SENDGRID_API_KEY=SG.xxxxx \
  SITE_URL=https://your-app.vercel.app \
  SENDGRID_FROM_EMAIL=invites@yourdomain.com \
  SENDGRID_FROM_NAME="Stack"
```

**Dashboard (no CLI):** Edge Functions → Deploy a new function → name it
`send-team-invite`, paste `index.ts`. Then Project Settings → Edge Functions →
Secrets, add the four vars above.

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected automatically — do not set them.

## Secrets

| name | required | notes |
|------|----------|-------|
| `SENDGRID_API_KEY` | yes | key with Mail Send |
| `SITE_URL` | yes | origin for the link, no trailing slash |
| `SENDGRID_FROM_EMAIL` | no | verified sender; defaults to the committed address |
| `SENDGRID_FROM_NAME` | no | display name |

## Response contract

Always HTTP 200. Body: `{ ok: boolean, error?: string, token?: string }`.

| body | meaning |
|------|---------|
| `{ ok: true, token }` | invitation created and emailed |
| `{ ok: false, error: 'no_account' \| 'already_member' \| 'already_invited' \| 'not_owner' }` | RPC rejected it, nothing created |
| `{ ok: false, error: 'email_failed', token }` | invitation row exists, email bounced — client falls back to the copy-link UI |
| `{ ok: false, error: 'unauthorized' \| 'bad_request' \| 'internal' }` | request problem |
