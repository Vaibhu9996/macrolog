// Step 2 of Google sign-in: Google redirects here with a one-time code.
// We exchange it for the user's identity and set a signed session cookie.
import { sign, sessionCookie, readState, clearStateCookie, baseUrl } from '../../lib/session.js';

export default async function handler(req, res) {
  const base = baseUrl(req);
  const secure = base.startsWith('https');
  const url = new URL(req.url, base);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const fail = (reason) => {
    res.setHeader('Set-Cookie', clearStateCookie(secure));
    res.statusCode = 302;
    res.setHeader('Location', `/?auth_error=${encodeURIComponent(reason)}`);
    res.end();
  };

  if (!code) return fail('no_code');
  if (!state || state !== readState(req)) return fail('bad_state');

  try {
    // Exchange the code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${base}/api/auth/callback`,
        grant_type: 'authorization_code',
      }),
    });
    const tok = await tokenRes.json();
    if (!tokenRes.ok || !tok.access_token) return fail('token_exchange_failed');

    // Ask Google who this is
    const uiRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    const u = await uiRes.json();
    if (!uiRes.ok || !u.sub || !u.email) return fail('userinfo_failed');
    if (u.email_verified === false) return fail('email_unverified');

    // Optional access list: ALLOWED_EMAILS="a@x.com, b@y.com"
    const allowed = (process.env.ALLOWED_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (allowed.length && !allowed.includes(u.email.toLowerCase())) return fail('not_allowed');

    const token = sign({ sub: u.sub, email: u.email, name: u.name || '', picture: u.picture || '' });
    res.setHeader('Set-Cookie', [sessionCookie(token, secure), clearStateCookie(secure)]);
    res.statusCode = 302;
    res.setHeader('Location', '/');
    res.end();
  } catch (e) {
    return fail('server_error');
  }
}
