# HHD Inventory: GitHub + Vercel Collaboration Guide

A beginner-friendly guide to putting the HHD Inventory & Ticketing project on GitHub, deploying it from GitHub to Vercel, and working safely with teammates through branches and Pull Requests.

**Who this is for:** anyone who has never used Git before. Every command is copy-paste.

---

## 0. The big picture

The project has three parts. Only one of them deploys from GitHub automatically.

| Part | Where it runs | Folder in repo | How it deploys |
|---|---|---|---|
| Web app (React + Vite + Tailwind) | Vercel | `frontend/` | **Automatic** on every push to GitHub |
| Backend (login, rules) | Google Apps Script | `apps-script/Code.gs` | **Manual**: paste into Apps Script, then Deploy > New version |
| Database | Supabase (PostgreSQL) | `supabase/schema.sql` | **Manual**: run in Supabase SQL Editor |

GitHub holds the source of all three so changes are reviewed in one place. Deploy order for a change that touches several parts is always **database, then backend, then frontend**.

Target repository layout:

```
hhd-inventory/                  <- repo root (the folder you run git in)
  .gitignore
  GITHUB_VERCEL_COLLABORATION_GUIDE.md
  DEPLOYMENT_GUIDE.md
  docs/
    TRAINING_PRESENTATION_OUTLINE.md
    HHD_Operations_Guide.pptx
  apps-script/
    Code.gs
  supabase/
    schema.sql
  frontend/                     <- the full Vite project
    .env.example
    vercel.json
    package.json
    package-lock.json           <- created by your first `npm install`; commit it
    index.html
    vite.config.js
    src/
      main.jsx
      index.css
      App.jsx
```

> **This repository is already in that layout.** If you received it as a zip, unzip it and skip to section 3. Sections 2.1 to 2.2 are for when you start from your own existing folder. The starter `frontend/package.json`, `index.html` and `src/main.jsx` are standard Vite + React + Tailwind files; if you already have a working Vite project of your own, keep your own versions of those three files.

---

## 1. One-time prerequisites

| Need | Check it | Get it |
|---|---|---|
| Git | `git --version` | https://git-scm.com/downloads |
| Node.js 18+ and npm | `node -v` and `npm -v` | https://nodejs.org |
| GitHub account | log in at github.com | https://github.com/signup |
| Vercel account | log in at vercel.com | Sign up **with GitHub** (makes step 6 easier) |

Tell Git who you are (once per computer). Use the same email as your GitHub account:

```bash
git config --global user.name  "Your Name"
git config --global user.email "you@example.com"
git config --global init.defaultBranch main
```

---

## 2. Prepare the project folder

1. Make sure you have one folder called `hhd-inventory` containing `apps-script/`, `supabase/` and `frontend/` as shown above.
2. The Vite project you created with `npm create vite` (often called `hhd`) must live **inside** `frontend/`. Move `package.json`, `package-lock.json`, `index.html`, `vite.config.js`, `src/` and `public/` there. Do **not** move `node_modules/`; you can recreate it with `npm install`.
3. Add the three config files from this guide (section 8):
   - `.gitignore` at the **repo root**
   - `frontend/vercel.json`
   - `frontend/.env.example` (replace the old one)
4. Put your **latest** `App.jsx` in `frontend/src/` and your **latest** `Code.gs` in `apps-script/`.
5. **Check the backend URL is not hard-coded.** Open `frontend/src/App.jsx` and find `DEFAULT_URL`. It must read:

   ```js
   const DEFAULT_URL = import.meta.env.VITE_API_URL || '';
   ```

   If it contains a literal `https://script.google.com/...` address, replace it with the line above, so each environment (your laptop, Vercel preview, production) can use its own URL.
6. Create your local env file and confirm the app still builds:

   ```bash
   cd frontend
   cp .env.example .env.local      # then edit .env.local and paste your real /exec URL
   npm install
   npm run build                   # must finish without errors
   cd ..
   ```
7. **Add the IMEI column to `supabase/schema.sql`** (append these lines) so a fresh database matches production:

   ```sql
   -- IMEI is NOT unique on purpose (several devices may share one)
   alter table devices add column if not exists imei_number text;
   create index if not exists devices_imei_idx on devices (imei_number);
   ```

> **Secret check before the first commit.** Search the folder for keys: nothing starting with `eyJ` or `sb_secret`, and no real `SUPABASE_KEY` value in any file. In this project the key lives only in Apps Script > Project Settings > **Script properties**. The Supabase project URL in `Code.gs` is a public identifier and is fine to commit.

---

## 3. Initialize the local repository

From the `hhd-inventory` folder:

```bash
git init -b main
git status
```

Read the `git status` list. You should see `apps-script/`, `supabase/`, `frontend/...` and the guides. You must **not** see `node_modules/`, `dist/`, `.env.local` or `.vercel/`. If you do, the `.gitignore` is missing or in the wrong place (it belongs at the repo root).

Then make the first commit:

```bash
git add .
git commit -m "Initial commit: HHD Inventory app, Apps Script backend, Supabase schema"
```

---

## 4. Create the repository on GitHub

### Option A: in the browser (easiest)

1. Sign in to github.com. Click **+** (top right) > **New repository**.
2. **Owner:** your account, or your organization (see the box below).
3. **Repository name:** `hhd-inventory`.
4. **Visibility:** **Private** (this is internal company software).
5. **Leave all three boxes unticked:** *Add a README*, *Add .gitignore*, *Choose a license*. You already have these; ticking them creates a conflict on your first push.
6. Click **Create repository**. GitHub shows an empty-repo page with the URL, like `https://github.com/YOUR-ORG/hhd-inventory.git`.

### Option B: with the GitHub CLI

```bash
gh auth login                                       # follow the prompts once
gh repo create YOUR-ORG/hhd-inventory --private --source=. --remote=origin --push
```

This creates the repo, connects it, and pushes in one step. If you use Option B, skip section 5.

> **Personal account or Organization?** A personal repo is fine for one or two people. For a team, create a free **Organization** (github.com > **+** > **New organization**) and create the repo there. Ownership then belongs to the company, not to one person's account, and you can manage people through Teams.

---

## 5. Push your code to GitHub

Copy the URL from the GitHub page, then:

```bash
git remote add origin https://github.com/YOUR-ORG/hhd-inventory.git
git push -u origin main
```

When Git asks you to sign in:

* **Username:** your GitHub username.
* **Password:** a **Personal Access Token**, not your account password. Create one at GitHub > Settings > Developer settings > Personal access tokens > **Fine-grained tokens**, give it access to this repository with **Contents: Read and write**, and paste it as the password. (Installing the GitHub CLI and running `gh auth login` avoids this prompt entirely.)

Refresh the repository page on GitHub. You should see your folders and files. Check that `.env.local` and `node_modules` are **not** there.

---

## 6. Deploy from GitHub to Vercel

1. Go to https://vercel.com/new and choose **Import Git Repository**. Authorize the Vercel GitHub app for your organization/account and select `hhd-inventory`.
2. **Root Directory:** click **Edit** and choose `frontend`. (This is the most common mistake: the app is not in the repo root.)
3. **Framework Preset:** Vite (auto-detected). Build command `npm run build`, output `dist`. These match `vercel.json`.
4. Open **Environment Variables** and add:
   * Name `VITE_API_URL`, value = your Apps Script `/exec` URL.
   * Tick **Production** and **Preview**.
5. Click **Deploy**. When it finishes, open the production URL and sign in.

From now on:

| You do this in GitHub | Vercel does this |
|---|---|
| Push or merge to `main` | Builds and updates the **production** site |
| Open or update a Pull Request | Builds a separate **Preview** site and comments the link on the PR |

> Already deployed earlier with `vercel --prod` from your laptop? Open the Vercel project > **Settings > Git > Connect Git Repository**, and set **Settings > General > Root Directory** to `frontend`.

> **Changing `VITE_API_URL` later:** the value is baked into the build. After editing it in Vercel, go to **Deployments > (latest) > Redeploy**.

> **Vercel plan:** the free Hobby plan is meant for personal, non-commercial use and does not include team collaboration. For a company team use a Vercel **Pro** team (check Vercel's current terms before you decide).

---

## 7. Set up collaboration

### 7.1 Invite teammates to GitHub

* **Personal repo:** repo > **Settings > Collaborators > Add people**.
* **Organization repo:** org > **People > Invite member**, then put people in a **Team** and give the team access to the repo.

Pick the lowest role that works:

| Role | Can do | Give to |
|---|---|---|
| **Read** | View code, comment | Stakeholders, trainers |
| **Write** | Create branches, open PRs, review, merge when allowed | Developers |
| **Admin** | Settings, branch rules, delete repo | 1 or 2 owners only |

Invite teammates to the Vercel team too (Vercel > Team Settings > Members) so they can see Preview deployments and logs.

### 7.2 Protect the `main` branch (do this once, as the repo admin)

`main` is what runs in production. Make it impossible to break by accident.

1. Repo > **Settings > Rules > Rulesets > New ruleset > New branch ruleset**.
2. Name it `Protect main`. **Enforcement status:** Active.
3. **Target branches:** Add target > **Include default branch**.
4. Tick:
   * **Restrict deletions**
   * **Block force pushes**
   * **Require a pull request before merging** with **Required approvals: 1**, and **Dismiss stale pull request approvals when new commits are pushed**
   * **Require status checks to pass**, then add the Vercel check (it appears after the first PR build; it is named like `Vercel` or `Vercel – hhd-inventory`)
5. **Create.**

Result: nobody (including you) can push straight to `main`. Every change goes through a reviewed Pull Request.

> On a *private* repository some rule features need a paid GitHub plan. If the ruleset page says a feature is unavailable, agree on the rules as a team habit and upgrade when you can.

---

## 8. Configuration files (exact contents)

Put these files exactly where shown. The same files are provided as downloads next to this guide.

### 8.1 `.gitignore` (repo root)

```gitignore
# Dependencies
node_modules/
.pnp
.pnp.js

# Build output
dist/
build/
.vite/

# Environment variables (real values never go in Git; keep only .env.example)
.env
.env.*
!.env.example

# Vercel CLI link + local project settings
.vercel/

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Test / coverage output
coverage/

# Editor and OS files
.vscode/*
!.vscode/extensions.json
.idea/
*.swp
.DS_Store
Thumbs.db
```

### 8.2 `frontend/vercel.json`

Vercel detects Vite by itself, so this file is optional. It is included to pin the build settings and add safe response headers. The app is a single page with no URL routing (tabs change in memory), so **no rewrites are needed**. If you ever add client-side routes, add `"rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]`.

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    }
  ]
}
```

### 8.3 `frontend/.env.example`

This file **is** committed; it documents what is needed. The real value goes in `frontend/.env.local` (ignored by Git) and in Vercel's Environment Variables.

```bash
# Copy to frontend/.env.local for local development:  cp .env.example .env.local
# On Vercel set the same variable in Project > Settings > Environment Variables
# (Production and Preview), then redeploy: Vite bakes it into the build.

# Google Apps Script web-app URL. Must end in /exec (not /dev).
VITE_API_URL=https://script.google.com/macros/s/REPLACE_WITH_YOUR_DEPLOYMENT_ID/exec

# NOT environment variables, and never stored in Git or Vercel:
#   SUPABASE_KEY  -> Apps Script > Project Settings > Script properties
#   SECRET        -> created automatically by Code.gs in Script properties
```

Only variables that start with `VITE_` are visible to browser code. Anything you put in one is **public** to every visitor, so never place a password or the Supabase service key in a `VITE_` variable.

---

## 9. The everyday workflow

Everyone follows the same loop, for every change however small.

```
main (protected)  ──●────────────────────────●── merge ──●──
                     \                      /
your branch           ●──●──●  push  → Pull Request → review → approve
```

### 9.1 Get the latest code and start a branch

```bash
git checkout main
git pull origin main
git checkout -b feature/imei-search
```

Branch names: `feature/short-name` for new things, `fix/short-name` for bugs, `docs/short-name` for documents. Lowercase, hyphens, no spaces.

### 9.2 Make changes and commit

```bash
cd frontend && npm run dev          # test locally at http://localhost:5173
git status                          # what did I change?
git add frontend/src/App.jsx        # add specific files, not everything
git commit -m "Add IMEI column and search to Master Inventory"
```

Good commit messages say **what** and **why** in one line, in the present tense: `Fix bulk update ignoring filtered rows`. Small, frequent commits are easier to review than one giant one.

Before pushing, always run `cd frontend && npm run build`. If it fails on your laptop it will fail on Vercel.

### 9.3 Push the branch and open a Pull Request

```bash
git push -u origin feature/imei-search
```

GitHub prints a link (or shows a yellow **Compare & pull request** banner on the repo page). Click it, then:

1. **Title:** a short summary (`Add IMEI column and search`).
2. **Description:** use this template.

   ```markdown
   ## What changed
   - ...

   ## Why
   - ...

   ## How to test
   1. Open the Vercel preview link below
   2. ...

   ## Deploy notes (tick if needed)
   - [ ] Run SQL in supabase/schema.sql
   - [ ] Paste new apps-script/Code.gs and Deploy > New version
   ```
3. **Reviewers:** pick at least one teammate on the right-hand side.
4. Click **Create pull request**. After a minute the Vercel bot adds a comment with a **Preview** URL: a live copy of your branch.

> Open the PR as a **Draft** (the arrow next to the green button) when you want early feedback; click **Ready for review** when done.

### 9.4 Review a Pull Request (as the reviewer)

1. Open the PR > **Files changed**.
2. Hover a line and click the blue **+** to comment on that line. Use **Add suggestion** (the ± icon) to propose exact code the author can accept with one click.
3. Open the **Preview** URL and try the feature for real. Reading code does not find every bug.
4. Click **Review changes** (top right of Files changed), pick one, and **Submit**:
   * **Comment:** feedback only.
   * **Approve:** good to merge.
   * **Request changes:** must be fixed first.

What to check: does it do what the description says; does it break existing screens; are there secrets or hard-coded URLs; are SQL changes safe to re-run (`if not exists`); is the code understandable.

### 9.5 Respond to review comments (as the author)

Fix the code on the **same branch**, then:

```bash
git add -A && git commit -m "Address review: handle empty IMEI"
git push
```

The PR and Preview update by themselves. Reply to each comment and click **Resolve conversation** when done. New commits dismiss earlier approvals, so ask for a re-approval.

### 9.6 Merge

When the PR has the approval and the green Vercel check:

1. Click the arrow on the green button and choose **Squash and merge** (turns your many commits into one clean commit on `main`).
2. Edit the final message if needed and confirm.
3. Click **Delete branch**.
4. Vercel automatically deploys `main` to production. Wait for it to turn green in Vercel > **Deployments**.
5. Do any manual **Deploy notes** from the PR (SQL, then `Code.gs`).

Update your own computer:

```bash
git checkout main
git pull origin main
git branch -d feature/imei-search
```

### 9.7 If your PR says "This branch has conflicts"

Two people changed the same lines. Fix it on your computer:

```bash
git checkout feature/imei-search
git fetch origin
git merge origin/main
```

Git lists the conflicted files. Open each one and find:

```
<<<<<<< HEAD
your version
=======
their version
>>>>>>> origin/main
```

Keep the right result (often both), delete the three marker lines, save. Then:

```bash
cd frontend && npm run build        # make sure it still works
git add .
git commit -m "Merge main into feature/imei-search"
git push
```

Keep PRs small and merge them quickly; that prevents most conflicts. Because `App.jsx` is one big file, agree who is changing which area, and pull `main` often.

---

## 10. Changes that touch the backend or database

The Vercel deploy only updates the website. For the other two parts, after the PR is merged:

| Changed file | Do this | Notes |
|---|---|---|
| `supabase/schema.sql` | Supabase > **SQL Editor** > paste the new statements > **Run** | Write migrations so they are safe to run twice (`if not exists`). Add columns, don't rename or delete. |
| `apps-script/Code.gs` | script.google.com > open the project > replace the code > **Deploy > Manage deployments > pencil > Version: New version > Deploy** | The `/exec` URL stays the same. Do **not** choose "New deployment" (that makes a new URL). |
| `frontend/**` | Nothing, Vercel does it | |

Order for a combined change: **SQL, then Code.gs, then the web app** (so the app never calls something that does not exist yet). If order matters, say so in the PR description.

`Code.gs` reads its secret from Script properties, so it is safe to keep in Git. Optional later improvement: the `clasp` tool can push `Code.gs` from the command line; it is not needed to get started.

---

## 11. Keeping secrets safe

* Never commit: `SUPABASE_KEY` (service_role), passwords, `.env.local`, `.vercel/`.
* `.gitignore` already blocks `.env*` (except `.env.example`) and `.vercel/`.
* If you committed a secret by mistake, deleting it in a later commit is **not enough**; it stays in Git history. **Rotate it immediately** (Supabase > Project Settings > API > generate a new service_role key, update the Apps Script property, and revoke the old one). Then tell the team.
* If a file you should not track was committed, stop tracking it without deleting your copy:

  ```bash
  git rm --cached frontend/.env.local
  git commit -m "Stop tracking .env.local"
  ```
* The Apps Script `/exec` URL is not a password, but treat it as internal: keep the repository private.

---

## 12. Cheat sheet

| I want to... | Command |
|---|---|
| See what changed | `git status` and `git diff` |
| Get the latest `main` | `git checkout main && git pull origin main` |
| Start a branch | `git checkout -b feature/name` |
| Save my work | `git add <files> && git commit -m "message"` |
| Send my branch to GitHub | `git push -u origin feature/name` (first time), then `git push` |
| Switch branch | `git checkout branch-name` |
| See branches | `git branch -a` |
| See history | `git log --oneline -15` |
| Undo edits to one file (not yet committed) | `git restore path/to/file` |
| Undo my last commit but keep the changes | `git reset --soft HEAD~1` |
| Bring `main` into my branch | `git fetch origin && git merge origin/main` |
| Park unfinished work | `git stash` then later `git stash pop` |

---

## 13. Troubleshooting

| Problem | Cause and fix |
|---|---|
| `src refspec main does not match any` on push | No commit yet, or the branch has another name. Run `git commit` first, check `git branch`. |
| `rejected ... fetch first` / `non-fast-forward` | The remote has commits you don't. `git pull origin main`, resolve, push again. If you ticked README/.gitignore when creating the repo: `git pull origin main --allow-unrelated-histories`. |
| `Permission denied` / authentication failed | Use a Personal Access Token (not your password) or `gh auth login`. Check you were invited with Write access. |
| `git status` lists `node_modules` | `.gitignore` is missing or not at the repo root. Add it, then `git rm -r --cached frontend/node_modules`. |
| Vercel build: `Missing script: "build"` or no framework found | **Root Directory** is not `frontend`. Fix it in Project > Settings > General. |
| App says "Backend is not configured" | `VITE_API_URL` missing for that environment (Production vs Preview). Add it, then **Redeploy**. |
| Preview works but production does not | Production env var missing or old. Fix it, redeploy production. |
| Cannot push to `main` | Working as designed: open a PR from a branch. |
| `LF will be replaced by CRLF` warning (Windows) | Harmless. |
| Merged but production didn't change | Check Vercel > Deployments for a failed build; open its log. |

---

## 14. Quick start (the whole thing in 12 commands)

```bash
cd hhd-inventory
git init -b main
git add .
git commit -m "Initial commit"
gh repo create YOUR-ORG/hhd-inventory --private --source=. --remote=origin --push

# then in Vercel: Import repo, Root Directory = frontend, add VITE_API_URL, Deploy

git checkout -b feature/my-change
# ...edit, test, then:
git add -A && git commit -m "Describe the change"
git push -u origin feature/my-change
# open the Pull Request on GitHub, get a review, Squash and merge
```
