# MacroLog — web app + database

A vegetarian / eggetarian macro & calorie tracker. Same app we built before, now backed by a real database so your data **syncs across devices** and survives clearing your browser. Includes the calorie ring, macro bars, the calorie‑deficit bar with daily/weekly kg estimates, the ~70‑item food database, favorites, next‑meal suggestions, editable targets with Mifflin‑St Jeor recalculation, the end‑of‑day Summary, and a lightweight passcode lock.

## How it's built

```
index.html      → the whole app (static page, no build step)
api/kv.js        → one Vercel serverless function (read/write your data)
package.json     → declares the @neondatabase/serverless dependency
```

The frontend keeps everything in a small in‑memory cache that loads once from `/api/kv` and writes changes back to Postgres. If the network is down it falls back to a copy saved on the device, so the app still opens.

---

## Deploy it (about 10 minutes, all free tiers)

You'll need a free **GitHub** account and a free **Vercel** account. Pick one of the two paths below.

### Path A — GitHub + Vercel dashboard (recommended; auto‑deploys on every change)

1. **Put the code on GitHub.** Go to github.com → **New repository** → name it `macrolog` → create. On the next screen click **uploading an existing file**, then drag in everything from this `macrolog-app` folder (you can drag the folder itself in Chrome — it keeps the `api/` subfolder). Commit.
2. **Import to Vercel.** Go to vercel.com → **Add New… → Project** → import your `macrolog` repo → **Deploy**. No build settings to change — Vercel serves `index.html` and turns `api/kv.js` into a function automatically.
3. **Add the database.** Open your new project → **Storage** tab → **Create Database** → choose **Neon (Postgres)** → connect it to this project. Vercel injects the `DATABASE_URL` connection string for you. (The table is created automatically the first time the app saves anything — no migrations to run.)
4. **Set a passcode (recommended).** Project → **Settings → Environment Variables** → add `APP_PASSCODE` = whatever you choose. Without this the app is open to anyone with the link.
5. **Redeploy** so the new variables take effect: **Deployments** tab → the latest one → **⋯ → Redeploy**.
6. **Open your URL** (`your‑project.vercel.app`), enter your passcode, and you're tracking. On iPhone, open it in **Safari → Share → Add to Home Screen** to get the full‑screen app icon.

### Path B — Vercel CLI (fastest, no GitHub)

```bash
npm i -g vercel
cd macrolog-app
vercel            # follow the prompts to create + deploy the project
```

Then do **steps 3–5 above** in the Vercel dashboard (add the Neon database, set `APP_PASSCODE`), and run `vercel --prod` to push the final version.

---

## Your data

- Lives in **Postgres (Neon)** in a single table `app_state`, keyed per user. One row per day plus your targets, maintenance value, and favorites.
- **Synced**: open the same URL on your phone and laptop and you'll see the same data.
- **Backup / inspection**: in the Vercel Storage tab, click **Open in Neon** to browse or export the table.
- **Offline**: if the database can't be reached, the app uses the last copy saved on that device and resumes syncing when it's back. (For that reason it works best online; changes made while fully offline may not sync.)

## Changing things

- **Passcode** — update the `APP_PASSCODE` env var in Vercel and redeploy.
- **Targets / maintenance** — edit them in the app under the **Targets** tab; they save to the database like everything else.
- **Multi‑user later** — `api/kv.js` stores everything under a single user key (`'me'`). To support separate accounts, replace that with a real per‑user id once you add proper sign‑in.

## Local development (optional)

```bash
npm install
# put your Neon connection string in a .env file as DATABASE_URL=...
npx vercel dev          # runs the static page + the function locally
```
