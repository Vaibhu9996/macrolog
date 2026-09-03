import { clearSessionCookie, baseUrl } from '../../lib/session.js';

export default function handler(req, res) {
  const secure = baseUrl(req).startsWith('https');
  res.setHeader('Set-Cookie', clearSessionCookie(secure));
  res.statusCode = 302;
  res.setHeader('Location', '/');
  res.end();
}
