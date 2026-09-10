// Stack — team invite email (Phase 2 Pass B, Option C).
//
// Invoked by TeamService.inviteByEmail() as `send-team-invite`. Runs with the
// caller's JWT, so the `invite_to_team` RPC's `is_team_owner` check and all RLS
// still apply. Creates the invitation, then emails a /invite/<token> link via
// the SendGrid HTTP API.
//
// Always answers HTTP 200 with `{ ok, error?, token? }` — the outcome is in the
// body, never the status — so the client reads `data` and not the transport.
//   { ok: true, token }                     invite created + emailed
//   { ok: false, error: 'no_account' | ... }  RPC rejected it (nothing created)
//   { ok: false, error: 'email_failed', token } invite row exists, mail bounced
//
// Secrets (supabase secrets set …):
//   SENDGRID_API_KEY   — SendGrid key with "Mail Send"
//   SENDGRID_FROM_EMAIL (optional) — verified sender, defaults below
//   SENDGRID_FROM_NAME  (optional)
//   SITE_URL            — origin for the link, e.g. https://stack.vercel.app
// SUPABASE_URL / SUPABASE_ANON_KEY are injected automatically.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY') ?? '';
const FROM_EMAIL = Deno.env.get('SENDGRID_FROM_EMAIL') ?? 'mishabeskin29@gmail.com';
const FROM_NAME = Deno.env.get('SENDGRID_FROM_NAME') ?? 'Task Dashboard';
const SITE_URL = (Deno.env.get('SITE_URL') ?? 'http://localhost:4200').replace(/\/$/, '');

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' });

  try {
    const { teamId, email, role } = await req.json().catch(() => ({}));
    if (!teamId || !email) return json({ ok: false, error: 'bad_request' });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return json({ ok: false, error: 'unauthorized' });

    // Owner check + no_account / already_member / already_invited live in the RPC.
    const { data: token, error: rpcErr } = await supabase.rpc('invite_to_team', {
      p_team_id: teamId,
      p_email: email,
      p_role: role ?? 'member',
    });
    if (rpcErr) return json({ ok: false, error: mapPgError(rpcErr.message) });

    const [{ data: team }, { data: profile }] = await Promise.all([
      supabase.from('teams').select('name').eq('id', teamId).single(),
      supabase.from('profiles').select('name').eq('id', user.id).single(),
    ]);

    const inviter = (profile?.name || user.email || 'A teammate').trim();
    const teamName = (team?.name || 'a team').trim();
    const link = `${SITE_URL}/invite/${token}`;

    if (!SENDGRID_API_KEY) {
      console.error('SENDGRID_API_KEY not set');
      return json({ ok: false, error: 'email_failed', token });
    }

    const sg = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: `${inviter} invited you to "${teamName}"`,
        content: [
          {
            type: 'text/plain',
            value:
              `${inviter} invited you to join "${teamName}".\n\n` +
              `Accept the invitation:\n${link}\n\n` +
              `This link expires in 7 days.`,
          },
          { type: 'text/html', value: htmlBody(inviter, teamName, link) },
        ],
      }),
    });

    if (!sg.ok) {
      console.error('SendGrid', sg.status, await sg.text());
      return json({ ok: false, error: 'email_failed', token });
    }

    return json({ ok: true, token });
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: 'internal' });
  }
});

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function mapPgError(msg: string): string {
  for (const code of ['not_owner', 'no_account', 'already_member', 'already_invited']) {
    if (msg.includes(code)) return code;
  }
  return 'invite_failed';
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

function htmlBody(inviter: string, team: string, link: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#FAF8F4;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a">
    <div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e8e4dc;border-radius:10px;padding:28px">
      <p style="font-size:15px;line-height:1.5;margin:0 0 20px">
        <strong>${escapeHtml(inviter)}</strong> invited you to join
        <strong>${escapeHtml(team)}</strong> on Stack.
      </p>
      <p style="margin:0 0 20px">
        <a href="${link}"
           style="display:inline-block;padding:11px 20px;background:#E05A20;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">
          Accept invitation
        </a>
      </p>
      <p style="font-size:13px;color:#888780;margin:0 0 6px">Or paste this link into your browser:</p>
      <p style="font-size:13px;color:#888780;word-break:break-all;margin:0 0 20px">${link}</p>
      <p style="font-size:12px;color:#888780;margin:0">This invitation expires in 7 days.</p>
    </div>
  </body>
</html>`;
}
