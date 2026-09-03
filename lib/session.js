// Shared auth helpers used by every serverless function.
// Sessions are stateless: a JSON payload signed with HMAC-SHA256 using SESSION_SECRET.
import crypto from 'node:crypto';

const COOKIE = 'ml_session';
const STATE_COOKIE = 'ml_oauth_state';
const THIRTY_DAYS = 60 * 60 * 24 * 30;

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Buffer.from(s, 'base64'); };

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('SESSION_SECRET is missing or too short (use a random string of 32+ characters).');
  return s;
}

/** Create a signed session token for a user payload. */
export function sign(payload, ttlSec = THIRTY_DAYS) {
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + ttlSec }));
  const sig = b64url(crypto.createHmac('sha256', secret()).update(body).digest());
  return `${body}.${sig}`;
}

/** Verify a token; returns the payload or null. */
export function verify(token) {
  if (!token || typeof token !== 'string') return null;
  const i = token.lastIndexOf('.');
  if (i < 0) return null;
  const body = token.slice(0, i), sig = token.slice(i + 1);
  let expect;
  try { expect = b64url(crypto.createHmac('sha256', secret()).update(body).digest()); } catch { return null; }
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(fromB64url(body).toString('utf8'));
    if (!p.exp || p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch { return null; }
}

export function parseCookies(req) {
  const out = {};
  const h = (req.headers && req.headers.cookie) || '';
  h.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
    }
  });
  return out;
}

/** Read and verify the current session from the request cookie. */
export function getSession(req) {
  return verify(parseCookies(req)[COOKIE]);
}

/** Stable per-user key for the database. Google's `sub` never changes even if the email does. */
export function userKey(session) {
  return 'g:' + session.sub;
}

const flags = (secure) => `Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;

export function sessionCookie(token, secure = true, maxAge = THIRTY_DAYS) {
  return `${COOKIE}=${token}; ${flags(secure)}; Max-Age=${maxAge}`;
}
export function clearSessionCookie(secure = true) {
  return `${COOKIE}=; ${flags(secure)}; Max-Age=0`;
}
export function stateCookie(state, secure = true) {
  return `${STATE_COOKIE}=${state}; ${flags(secure)}; Max-Age=600`;
}
export function clearStateCookie(secure = true) {
  return `${STATE_COOKIE}=; ${flags(secure)}; Max-Age=0`;
}
export function readState(req) {
  return parseCookies(req)[STATE_COOKIE] || null;
}

/** Public origin of this deployment, e.g. https://macrolog.vercel.app */
export function baseUrl(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return `${proto}://${host}`;
}

export function randomToken(bytes = 24) {
  return b64url(crypto.randomBytes(bytes));
}
