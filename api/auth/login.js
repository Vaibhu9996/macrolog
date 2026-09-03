// Step 1 of Google sign-in: send the user to Google's consent screen.
import { randomToken, stateCookie, baseUrl } from '../../lib/session.js';

export default function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Google sign-in is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your Vercel project settings, then redeploy.');
    return;
  }
  const base = baseUrl(req);
  const secure = base.startsWith('https');
  const state = randomToken(16); // CSRF protection: must round-trip through Google unchanged
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${base}/api/auth/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  res.setHeader('Set-Cookie', stateCookie(state, secure));
  res.statusCode = 302;
  res.setHeader('Location', `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  res.end();
}
