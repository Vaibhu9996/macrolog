# MacroLog

A vegetarian / eggetarian macro & calorie tracker you can share with friends. Google sign-in, per-user cloud storage, ~200-item Indian + restaurant food database (South Indian breakfasts, chutneys, Harvest Salad Co, Maiz, high-protein dishes), AI photo estimates, the calorie-deficit bar with daily/weekly kg projections, weekly trends, an end-of-day review, and editable targets.

## How it's built

```
index.html          → the whole app (static page, no build step)
api/kv.js            → read/write the signed-in user's data (Postgres)
api/analyze.js       → photo → nutrition estimate (Claude vision)
api/auth/login.js    → start Google sign-in
api/auth/callback.js → finish Google sign-in, set session cookie
api/auth/logout.js   → sign out
api/auth/me.js       → who am I
lib/session.js       → signed-cookie sessions shared by the functions
```

Each user's data lives under their own key in one Postgres table. Sessions are HMAC-signed cookies (no session table needed).

---

## Deploy (about 15 minutes, all free tiers)

### 1. Get the code on GitHub and Vercel
- github.com → **New repository** → **uploading an existing file** → drag this whole folder in → commit.
- vercel.com → **Add New… → Project** → import the repo → **Deploy**. No build settings to change.
- Note your URL, e.g. `https://macrolog.vercel.app`.

### 2. Add the database
Project → **Storage** → **Create Database** → **Neon (Postgres)** → connect to this project. Vercel injects `DATABASE_URL` automatically. Tables create themselves on first use.

### 3. Create a Google sign-in client (about 5 min)
1. Go to **console.cloud.google.com** → create a project (any name).
2. **APIs & Services → OAuth consent screen** → *External* → fill in app name + your email → Save. Then click **Publish app** so anyone can sign in (the basic email/profile scopes don't need Google's review). If you leave it in *Testing*, only people you add as "test users" can sign in.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** → *Web application*.
   - **Authorized redirect URI:** `https://YOUR-APP.vercel.app/api/auth/callback` (use your real URL).
4. Copy the **Client ID** and **Client secret**.

### 4. Set environment variables
Project → **Settings → Environment Variables**. Add:

| Variable | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | from step 3 |
| `GOOGLE_CLIENT_SECRET` | from step 3 |
| `SESSION_SECRET` | any long random string (32+ chars). On a Mac: `openssl rand -hex 32` |
| `OWNER_EMAIL` | **your** Google email — carries your existing data over on first sign-in |
| `ANTHROPIC_API_KEY` | for photo estimates — from console.anthropic.com (see below) |
| `ALLOWED_EMAILS` | *optional* — comma-separated list; if set, only these addresses can sign in |
| `ANALYZE_MODEL` | *optional* — defaults to `claude-sonnet-5` |

Then **Deployments → latest → ⋯ → Redeploy** so the variables take effect. (The old `APP_PASSCODE` is no longer used and can be deleted.)

### 5. Open it and sign in
Visit your URL → **Continue with Google**. On iPhone: Safari → **Share → Add to Home Screen** for the full-screen app.

Share the same URL with anyone you want to use it — they sign in with their own Google account and get their own private log.

---

## Photo estimates
In **Add → Photo**, take or choose a picture. It's sent to Claude's vision model, which returns a name, portion, calories and macros that pre-fill the form. Add a hint ("2 idlis with coconut chutney") to sharpen it, and **edit every value before saving**. A photo can't see hidden oil or exact portions, so treat it as a strong starting point, not a measurement. Each analysis costs a fraction of a rupee on your Anthropic account.

## Your data & access
- Stored in Postgres (Neon), one row per key per user. Browse it via **Storage → Open in Neon**.
- Signing in with **`OWNER_EMAIL`** for the first time copies everything logged under the old passcode version into your account. Set it *before* your first sign-in.
- **`ALLOWED_EMAILS`** empty → anyone with a Google account can use the app. Set it to lock it down.
- Sessions last 30 days; **Sign out** is on the Targets tab.
- Works best online. If the server can't be reached the app shows the last copy saved on that device.

## Common snags
- **"redirect_uri_mismatch"** from Google → the redirect URI in Google Cloud must exactly equal `https://YOUR-APP.vercel.app/api/auth/callback`.
- **"Access blocked / app not verified"** → publish the OAuth consent screen (step 3.2) or add the person as a test user.
- **Photo tab says not set up** → `ANTHROPIC_API_KEY` is missing; add it and redeploy.
- **Signed in but no history** → `OWNER_EMAIL` didn't match the Google account you used (case-insensitive, but must be the same address).

## Local development (optional)
```bash
npm install
# .env with DATABASE_URL, SESSION_SECRET, GOOGLE_CLIENT_ID/SECRET, ANTHROPIC_API_KEY
# add http://localhost:3000/api/auth/callback as a second redirect URI in Google Cloud
npx vercel dev
```
