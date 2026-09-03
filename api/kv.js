import { neon } from '@neondatabase/serverless';
import { getSession, userKey } from '../lib/session.js';

// Vercel's Neon integration injects DATABASE_URL automatically.
const CONN =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING;

let ready = false;
async function ensureSchema(sql) {
  if (ready) return;
  await sql`
    CREATE TABLE IF NOT EXISTS app_state (
      user_key   text        NOT NULL,
      k          text        NOT NULL,
      v          jsonb       NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_key, k)
    )`;
  ready = true;
}

// One-time: when the app owner first signs in with Google, carry over the data that was
// saved under the old single-user ('me') setup so nothing is lost.
async function migrateLegacyIfOwner(sql, session, USER) {
  const owner = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  if (!owner || (session.email || '').toLowerCase() !== owner) return false;
  const legacy = await sql`SELECT k, v FROM app_state WHERE user_key = 'me'`;
  if (!legacy.length) return false;
  for (const r of legacy) {
    await sql`
      INSERT INTO app_state (user_key, k, v)
      VALUES (${USER}, ${r.k}, ${JSON.stringify(r.v)}::jsonb)
      ON CONFLICT (user_key, k) DO NOTHING`;
  }
  return true;
}

export default async function handler(req, res) {
  const session = getSession(req);
  if (!session) { res.status(401).json({ error: 'unauthorized' }); return; }

  if (!CONN) {
    res.status(500).json({ error: 'no_database', message: 'No database connection string found. Add a Postgres database in the Vercel Storage tab, then redeploy.' });
    return;
  }

  const sql = neon(CONN);
  const USER = userKey(session);
  const user = { email: session.email, name: session.name, picture: session.picture };

  try {
    await ensureSchema(sql);

    if (req.method === 'GET') {
      let rows = await sql`SELECT k, v FROM app_state WHERE user_key = ${USER}`;
      if (rows.length === 0 && (await migrateLegacyIfOwner(sql, session, USER))) {
        rows = await sql`SELECT k, v FROM app_state WHERE user_key = ${USER}`;
      }
      const data = {};
      for (const row of rows) data[row.k] = row.v;
      res.status(200).json({ data, user });
      return;
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      body = body || {};
      const entries = body.entries || (body.key !== undefined ? { [body.key]: body.value } : null);
      if (!entries) { res.status(400).json({ error: 'bad_request' }); return; }
      for (const [k, v] of Object.entries(entries)) {
        await sql`
          INSERT INTO app_state (user_key, k, v)
          VALUES (${USER}, ${k}, ${JSON.stringify(v)}::jsonb)
          ON CONFLICT (user_key, k)
          DO UPDATE SET v = EXCLUDED.v, updated_at = now()`;
      }
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'DELETE') {
      const k = (req.query && req.query.key) || (req.body && req.body.key);
      if (k) await sql`DELETE FROM app_state WHERE user_key = ${USER} AND k = ${k}`;
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: String((e && e.message) || e) });
  }
}
