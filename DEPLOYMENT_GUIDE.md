# HHD Inventory: Deployment Guide

Stack: **React (Vercel)** -> **Google Apps Script web app** (login, rules) -> **Supabase Postgres** (data).
Deploying from your laptop with the Vercel CLI, no GitHub needed.

> Team setup with GitHub and automatic Vercel deploys: see `GITHUB_VERCEL_COLLABORATION_GUIDE.md`.

## Package contents

```
hhd-inventory/
  DEPLOYMENT_GUIDE.md        this file
  supabase/schema.sql        tables + status_log + row level security
  apps-script/Code.gs        backend (paste into Apps Script)
  frontend/
    src/App.jsx              the whole UI
    src/index.css            Tailwind import
    vite.config.js           Vite + React + Tailwind plugin
    .env.example             VITE_API_URL sample
```

Order matters: **Supabase -> Apps Script -> Vercel -> first login**.

---

## 0. Prerequisites

| Need | Check |
|---|---|
| Node.js 18+ | `node -v` |
| npm | `npm -v` |
| Supabase account | supabase.com |
| Google account | for Apps Script |
| Vercel account | vercel.com |

---

## 1. Supabase (database)

1. supabase.com > **New project**. Pick a region near your users and set a database password (save it).
2. Wait until the project is ready, then open **SQL Editor > New query**.
3. Open `supabase/schema.sql`, paste everything, click **Run**. Expect "Success".
   - Already running v3 with data? The script is safe to re-run; it only adds `status_log` and keeps existing tables.
4. **Table Editor**: confirm 5 tables exist: `sites`, `users`, `devices`, `tickets`, `status_log`.
5. **Project Settings > API**. Copy:
   - **Project URL** (looks like `https://xxxx.supabase.co`)
   - **service_role** key (click Reveal). Server-side only.

> **Rotate the old key.** The earlier `Code.gs` contained a service_role key in plain text and it was shared in chat. If you are reusing that project: Project Settings > API > JWT settings / API keys > generate a new service_role key, and use only the new one below.

---

## 2. Google Apps Script (backend)

1. Go to script.google.com > **New project** (or open your existing HHD project). Name it "HHD Inventory API".
2. Delete the default code in `Code.gs`, paste the whole of `apps-script/Code.gs`.
3. At the top, check `SUPABASE_URL` matches your Project URL from step 1.5.
4. Left sidebar > **Project Settings** (gear) > **Script Properties** > **Add script property**:
   - Property: `SUPABASE_KEY`
   - Value: the service_role key
   - **Save script properties**.
5. **First install only** (empty `users` table): in the editor choose function `seedAdmin` in the dropdown > **Run** > authorize when asked (Advanced > Go to project > Allow).
   - Creates user `admin` / password `ChangeMe-12345`.
   - After your first login, change this password in Admin > Users, then delete the `seedAdmin` function.
   - Existing deployment with users? Skip this step.
6. **Deploy > New deployment** > gear icon > **Web app**:
   - Description: v3.1
   - Execute as: **Me**
   - Who has access: **Anyone**
   - **Deploy**, authorize if asked, copy the **Web app URL** ending in `/exec`.
7. Quick test: open `<exec URL>?token=x` in a browser. You should see `{"ok":false,"error":"auth"}`. That means the backend is alive.

**Updating later:** Deploy > **Manage deployments** > pencil icon > Version: **New version** > Deploy. The URL stays the same. (Using "New deployment" again would give a new URL.)

---

## 3. Frontend (local project)

```bash
npm create vite@latest hhd -- --template react
cd hhd
npm i lucide-react tailwindcss @tailwindcss/vite
```

When asked about rolldown/experimental options, choose the defaults. Then:

1. Replace `hhd/vite.config.js` with `frontend/vite.config.js`.
2. Replace `hhd/src/index.css` with `frontend/src/index.css` (one line).
3. Replace `hhd/src/App.jsx` with `frontend/src/App.jsx`.
4. Delete `hhd/src/App.css` and remove `import './App.css'` if present in `App.jsx` (the provided file has none).
5. Check `hhd/src/main.jsx` has `import './index.css'` and renders `<App />` (the Vite template already does).
6. Create `hhd/.env.local` (copy `.env.example`) with your real `/exec` URL.
7. Test locally:
   ```bash
   npm run dev
   ```
   Open the printed URL (usually http://localhost:5173), sign in as `admin`.
8. Check the production build works:
   ```bash
   npm run build
   ```

---

## 4. Deploy to Vercel from your laptop

```bash
npm i -g vercel
vercel login          # opens browser, approve
vercel link           # inside the hhd folder
```

`vercel link` prompts:
- Set up and deploy? **Y** (or link only, either is fine)
- Which scope? your account
- Link to existing project? **N**
- Project name: `hhd-inventory`
- Directory: `./`
- Framework should auto-detect as **Vite** (build `npm run build`, output `dist`). Accept.

Add the backend URL, then deploy:

```bash
vercel env add VITE_API_URL production      # paste the /exec URL, Enter
vercel env add VITE_API_URL preview         # optional
vercel --prod
```

The CLI prints a production URL such as `https://hhd-inventory.vercel.app`. Open it.

> `VITE_API_URL` is baked in at build time. After changing it you must run `vercel --prod` again.

**Redeploy after code changes:** `vercel --prod`
**Change the backend URL for everyone:**
```bash
vercel env rm VITE_API_URL production
vercel env add VITE_API_URL production
vercel --prod
```
**View logs of a failed build:** `vercel logs <deployment-url>` or Vercel dashboard > Deployments.

---

## 5. First-run checklist

1. Open the Vercel URL. Login screen shows only username and password (no server URL field).
2. Sign in as `admin`. Tabs visible: Dashboard Matrix, Pending Receipts, Batch Dispatch & Issue, Master Inventory, Ticket Audit Trail, Status Log, **Config**, **Admin**.
3. **Admin > Users**: change the admin password (Edit admin, type a new password of 10+ characters, Save).
4. **Admin > Add a site**: create your sites.
5. **Admin > CSV Import**: upload devices (`Serial,Make,Model,Status,Location`, or `Site,HHD Make,HHD Model,status,Quantity`).
6. **Admin > Users**: create site users. Site = `Site A` or `Site A, Site B`; `*` = all sites.
7. Sign in as a normal user in another browser/incognito. Confirm:
   - No Config or Admin tab.
   - Master Inventory shows a status dropdown only for devices at that user's sites.
   - Changing a status asks for confirmation, then shows up in **Status Log** with old status, new status, time and "Name (username)".
   - Batch Dispatch tab shows "Devices at {your site}" under the forms.
   - Dashboard has Status and Location filters, and column headers sort on click.

---

## 6. Feature behaviour reference

| Feature | Where | Rules |
|---|---|---|
| Dashboard filters | Dashboard Matrix | Make, Model, Status, Location dropdowns; "Clear filters" link |
| Column sorting | Dashboard Matrix | Click a header: ascending, click again: descending |
| Status change | Master Inventory and Dispatch site list | Needs access to device's site; In-Transit devices and the In-Transit status are blocked (tickets handle those) |
| Status log | Status Log tab | Admin sees all; others see only their sites; latest 1000 entries |
| Site device list | Batch Dispatch & Issue | Devices at the currently selected site |
| Config | Admin only | Override URL is per browser; shared URL is `VITE_API_URL` |

---

## 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "Backend is not configured" on login | `VITE_API_URL` missing at build time. Add it, run `vercel --prod` |
| Login says failed to fetch / CORS | Apps Script access not **Anyone**, or wrong URL (must end `/exec`, not `/dev`) |
| `Unexpected token <` / HTML instead of JSON | Not authorized or wrong deployment; redeploy as Web app, Execute as Me |
| Invalid username or password | Run `seedAdmin` (empty users table) or reset a user from Admin |
| Too many failed attempts | Wait 15 minutes (lockout is per username) |
| `relation "status_log" does not exist` | Re-run `supabase/schema.sql` |
| Status Log empty after a change | Backend not redeployed as **New version** |
| Dashboard stops at 1000 devices | Supabase returns max 1000 rows per request by default; raise it in Project Settings > API > Max rows or ask for pagination support |
| Supabase calls fail after days idle | Free projects pause; open the Supabase dashboard and click Restore |
| Config tab URL change ignored for others | It is stored per browser; change `VITE_API_URL` on Vercel instead |

---

## 8. Security notes

- The service_role key lives only in Apps Script Script Properties. Never put it in `App.jsx`, `.env`, or Vercel.
- Row level security is on for all tables with no policies, so the public anon key can read nothing.
- Session tokens are signed (HMAC) and expire after 8 hours; passwords are salted and hashed.
- Do not commit or share the `.vercel` folder or `.env.local`.
- Status log "Changed by" stores the user's name and username. If usernames are emails, that is your email record.
