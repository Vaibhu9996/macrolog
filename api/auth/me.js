import { getSession } from '../../lib/session.js';

export default function handler(req, res) {
  const s = getSession(req);
  res.setHeader('Content-Type', 'application/json');
  if (!s) { res.statusCode = 401; res.end(JSON.stringify({ error: 'unauthorized' })); return; }
  res.statusCode = 200;
  res.end(JSON.stringify({ user: { email: s.email, name: s.name, picture: s.picture } }));
}
