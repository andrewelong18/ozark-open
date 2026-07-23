# Agent Automation — connecting Claude Code to Supabase & Vercel

**Why this exists.** Almost every sprint ends the same way: the code ships, but a
human still has to paste a migration into the Supabase SQL editor, click around
the Auth dashboard, promote an admin in Studio, or add an env var in Vercel. The
GitHub issue tracker is full of these (see the mapping table below). This doc
wires Claude Code directly into Supabase and Vercel so the coding agent does that
work itself instead of writing an issue for you.

**Everything here runs on free accounts.** No Supabase Pro, no Vercel Pro. The
connections authenticate with personal access tokens, not plan upgrades. The one
issue that involves money — #18 (Supabase Pro for September) — is a judgment
call about backups/idle-pausing, not a task an agent should decide, and stays
with you.

**No secrets in git.** `.mcp.json` and the scripts reference environment
variables (`${SUPABASE_ACCESS_TOKEN}`, etc.). `.env*` is gitignored. You paste the
actual tokens into your environment once; they never get committed.

---

## What the agent can now do (and what it can't)

| Bucket | Manual chore | Automation | Issues it retires |
|---|---|---|---|
| **A** | Apply a migration to prod | Supabase MCP `apply_migration` | #12, #22, #28, #34, #49, #54, #58, **#73** |
| **B** | Studio data edits (promote admin, flip `tournament.status`, fill profile copy) | Supabase MCP `execute_sql` | #6, #7, #11, #15, **#36, #60, #74** |
| **C** | Auth dashboard settings (SMTP, session lifetime, magic-link template) | `scripts/prod-auth-config.sh` (Management API) | #3, #4, #16, #17, **#70** |
| **D** | Vercel env vars | Vercel CLI (`vercel env add`) | **#66** |
| **E** | Google Cloud service account for the Sheets read | `gcloud` CLI (share step stays manual) | **#66** (partial) |
| **F** | Prod browser verification | Playwright (pre-installed) + Gmail MCP for the magic link | #8, #19, #24, #26, #30, #31, #35, #50, #68, #73, #75 |

**Bold** = still open. **Not automatable, stays with you:** #18 (spend money),
#9 (ask Steve / buy a domain), #14 / #30 / #37 / #67 (ask Pat, human coordination).

---

## One-time setup

### 1. Supabase MCP — buckets A & B (the big win)

Committed in `.mcp.json`. It runs the official server scoped to the prod project
(`--project-ref=rbjqqzjqhsbcotqfrwhb`) and is **read-write** so the agent can
apply migrations and data edits directly.

**Generate the token (free):** Supabase dashboard → **Account → Access Tokens**
→ *Generate new token* → name it `claude-code`. This is a personal access token
(`sbp_...`); it works on the free plan.

**Give it to Claude Code:**
- *Claude Code on the web / this remote environment:* set `SUPABASE_ACCESS_TOKEN`
  as an environment variable in your environment's settings (see
  https://code.claude.com/docs/en/claude-code-on-the-web → environment config).
- *Local CLI:* `export SUPABASE_ACCESS_TOKEN=sbp_...` in your shell (or drop it in
  `.env.local`, which is gitignored).

On first use Claude Code will ask you to approve the project MCP server — approve
`supabase`. Then ask the agent to "apply the pending migration to prod" and it
uses `apply_migration` itself.

**Safety.** It's scoped to the one project. To make it read-only (agent prepares
SQL, you apply it), add `--read-only` to the args in `.mcp.json`. To let it touch
only data and never schema, drop `apply_migration` by narrowing `--features` (see
the server docs).

### 2. Supabase Auth config — bucket C

`scripts/prod-auth-config.sh` wraps the Management API for the settings the MCP
can't reach. It uses the **same** `SUPABASE_ACCESS_TOKEN`. It's a **dry run by
default** (prints the JSON, sends nothing); add `--apply` to write. Examples:

```bash
# #17 — don't time-box sessions (login in the dry run survives to tournament day)
SESSION_TIMEBOX_HOURS=0 bash scripts/prod-auth-config.sh --apply

# #70 — switch the hosted magic-link template to the token_hash flow
MAGIC_LINK_HTML_PATH=supabase/templates/magic_link.html \
SITE_URL=https://ozark-open-sportsbook.vercel.app \
bash scripts/prod-auth-config.sh --apply

# #16 — custom SMTP via Resend (create a free Resend key first)
SMTP_HOST=smtp.resend.com SMTP_PASS=re_yourkey \
SMTP_SENDER_EMAIL=login@yourdomain \
bash scripts/prod-auth-config.sh --apply
```

### 3. Vercel — bucket D

The **official Vercel MCP cannot read or write env vars** — so for #66 use the
Vercel CLI, which does, on the free Hobby plan.

**Generate the token (free):** Vercel → **Account Settings → Tokens** → create one
scoped to the project. Export `VERCEL_TOKEN`.

```bash
npm i -g vercel
vercel link            # once, picks the ozark-open-sportsbook project
echo "13ueUu..." | vercel env add GOOGLE_SHEET_ID production --token=$VERCEL_TOKEN
```

(Optional: you can also add Vercel's remote MCP at `https://mcp.vercel.com` for
deployment/log visibility — but it won't help with env vars, so it's not required.)

### 4. Google Cloud — bucket E (for #66's service account)

The service account, JSON key, and Sheets-API enablement are scriptable with the
free `gcloud` CLI. The one step that stays manual is **sharing the sheet** with the
service-account email as Viewer (or the agent can do it via the Google Drive MCP
connected to this session).

### 5. Browser verification — bucket F

This environment ships Chromium + Playwright. Combined with the Gmail MCP, the
agent can drive prod end-to-end: open the login page, request a magic link, read
it out of Gmail, finish login, and click through the flow — the verifications in
#24/#26/#31/#35/#50/#68/#73/#75.

---

## The token checklist (all free)

| Env var | Where to get it | Powers |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | Supabase → Account → Access Tokens | MCP (A/B) + auth script (C) |
| `VERCEL_TOKEN` | Vercel → Account Settings → Tokens | env vars (D) |
| `RESEND_API_KEY` (as `SMTP_PASS`) | resend.com → API Keys (free, only if doing #16) | SMTP (C) |
| Gmail / Drive MCP | already connected to this session | browser verify (F), sheet share (E) |

Set these as environment variables in your Claude Code environment (web) or shell
(local). None of them belong in the repo.
