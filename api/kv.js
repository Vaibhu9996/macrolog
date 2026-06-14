import { neon } from '@neondatabase/serverless';

// Vercel's Neon integration injects DATABASE_URL automatically.
// We fall back to a couple of other common names just in case.
const CONN =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING;

// Single-user app: everything is stored under one key. The optional
// APP_PASSCODE env var gates access. (Swap USER for a per-account id
// later if you ever want true multi-user.)
const USER = 'me';

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

export default async function handler(req, res) {
  // ---- lightweight passcode gate ----
  const need = process.env.APP_PASSCODE;
  if (need) {
    const got = req.headers['x-passcode'];
    if (got !== need) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
  }

  if (!CONN) {
    res.status(500).json({
      error: 'no_database',
      message: 'No database connection string found. Add a Postgres database in the Vercel Storage tab, then redeploy.',
    });
    return;
  }

  const sql = neon(CONN);

  try {
    await ensureSchema(sql);

    // ---- read everything for this user ----
    if (req.method === 'GET') {
      const rows = await sql`SELECT k, v FROM app_state WHERE user_key = ${USER}`;
      const data = {};
      for (const row of rows) data[row.k] = row.v;
      res.status(200).json({ data });
      return;
    }

    // ---- upsert one key, or a batch of { entries: { k: v, ... } } ----
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = {}; }
      }
      body = body || {};
      const entries =
        body.entries ||
        (body.key !== undefined ? { [body.key]: body.value } : null);

      if (!entries) {
        res.status(400).json({ error: 'bad_request' });
        return;
      }

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

    // ---- delete one key ----
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
