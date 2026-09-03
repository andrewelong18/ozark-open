# Ozark Open Sportsbook

A private fantasy-golf betting platform for the annual Ozark Open tournament. Participants log in, place bets on a curated set of odds published by admins, and see their winnings calculated as a pari-mutuel share of the entry pool.

> **No house, no rake, no profit.** The entire entry pool is redistributed to participants based on the proportional value of their theoretical winnings. This is a private pool for tournament participants only.

---

## What This Repo Contains

A web application that lets:

- **Participants** log in, view the active bet menu (bets with per-pick odds), place wagers on picks within the configured constraints, and see their results and payouts.
- **Admins** (Pat, Jake, Steve, Andrew) publish the bet menu **by uploading the bets spreadsheet**, and deliver results (hit / miss / push / void, computed in that same workbook) by re-uploading it after each betting round. Final payouts are calculated in the app.

Everything else — tournament scoring, skins, the leaderboard math, and **bet resolution itself** — stays in the existing Excel workbooks. The app reads from them (via upload for bets, via a Google Sheets mirror for the leaderboard) and never adjudicates a bet. See `docs/adr/0001-bet-pick-architecture.md` for the full betting-architecture decision record.

---

## Current Status

**Target: fully wrapped by September 10, 2026** (tournament is September 24–26).

| Built (code complete) | Up next |
|---|---|
| Auth + tournament/participant setup (**verified in prod**); Sprints 1–7: bet/pick schema (ADR 0001), spreadsheet ingestion (`/admin/import`), placements + validation, My Bets + compliance, closed-bet views with everyone's placements + result badges, the admin runbook, payouts (theoretical + final: `placement_payouts_view`, `/admin/view`, `/results`) — all unit-tested and built locally, **full prod SQL chain applied Jul 18, 2026** (#12 → #22 → #28 → #34); in-browser verification pending (#24/#26/#31/#35) plus admin promotion (#15) | Sprint 8: leaderboard mirror · Sprint 9: mobile pass + group dry run |

`docs/ROADMAP.md` is the live sprint tracker — status table, numbered sprints with checkboxes, blockers, and target dates. All product decisions are settled and logged in `docs/PRD.md` §12 and `docs/adr/0001-bet-pick-architecture.md`; there are no open spec questions.

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 14+** (App Router) | Best AI-assisted coding support; React-based; mobile-responsive by default |
| Styling | **Tailwind CSS** + shadcn/ui | Fast to vibe-code, looks decent without design effort |
| Database | **Supabase** (Postgres) | Real database with a spreadsheet-style admin UI built in |
| Authentication | **Supabase Auth** — magic link (email) | No passwords for users to manage; reliably ties bets to people |
| Hosting | **Vercel** | One-click deploy from GitHub; free for hobby use |
| External data | **Google Sheets API** (read-only) | Leaderboard data lives in the existing workbook |

See `docs/ARCHITECTURE.md` for the diagram and deeper rationale.

---

## Repository Layout

```
ozark-open/
├── README.md              ← you are here
├── CLAUDE.md              ← instructions for AI-assisted sprint work
├── middleware.ts          ← session refresh + route protection
├── app/                   ← Next.js App Router pages (login, dashboard, bets, auth)
├── components/            ← the app's shipped React (betting/, modules/, ui/, nav)
├── lib/                   ← Supabase clients, odds math (validation & payouts to come)
├── supabase/
│   └── migrations/        ← SQL migration files (the only way schema changes)
├── docs/                  ← all project docs
│   ├── PRD.md             ← product requirements; bet rules; §12 decision log
│   ├── ARCHITECTURE.md    ← how the pieces fit together
│   ├── DATA_MODEL.md      ← database schema in detail; payout view
│   ├── ROADMAP.md         ← phase roadmap + live sprint tracker
│   ├── OUTSTANDING_DECISIONS.md ← open decisions still needing a stakeholder call
│   ├── DESIGN_SYSTEM.md   ← how the brand visual system is wired into the app
│   ├── sprints/           ← one self-contained file per sprint (sprint-0.md … sprint-9.md)
│   ├── adr/               ← architecture decision records (0001: bet/pick structure)
│   ├── import/            ← bets-sample.xlsx — the canonical spreadsheet format
│   └── superpowers/       ← per-phase design specs and implementation plans
├── .claude/skills/
│   └── ozark-open-design/ ← design reference kit (tokens, brand assets, UI-kit); the visual source of truth
├── public/                ← static assets
└── .env.local.example     ← environment variable template
```

---

## Getting Started Locally

**Prerequisites:** Node.js 20+, a Supabase account (free), a Vercel account (free), a GitHub account.

1. Clone the repo: `git clone https://github.com/<your-username>/ozark-open-sportsbook.git`
2. Install dependencies: `npm install`
3. Copy `.env.local.example` to `.env.local` and fill in your Supabase URL and anon key (find them at https://supabase.com/dashboard → Project → Settings → API). The `GOOGLE_*` vars power the read-only `/leaderboard` mirror (Sprint 8) — leave them blank locally and the page shows a friendly "no standings yet" state; fill them in to read a real Google Sheet (see `.env.local.example` for how to set up the service account).
4. Run database migrations: `npx supabase db push` (or run the SQL files in `supabase/migrations/` manually in the Supabase SQL editor).
5. Start the dev server: `npm run dev`
6. Visit http://localhost:3000

> **Testing the app end-to-end?** See [`docs/DEV_TESTING.md`](docs/DEV_TESTING.md) — a cheat
> sheet for driving the flow with pre-seeded dummy accounts, either against a hosted Supabase
> project (no Docker) or a full local stack, with magic-link logins that need no real email.

### Tests & verification

Four layers, fastest first. Each proves something the one above it structurally can't.

- `npm run test` — unit tests, ~2s (every `lib/*.test.ts`: validation, placements, my-bets, closed-bets, payouts, admin view). Pure functions only: no Supabase, no `@/` imports. That's what keeps it this fast — don't add either.
- `npm run lint` · `npx tsc --noEmit` · `npm run build` — the rest of the gate.
- `bash scripts/local-db-verify.sh` — the database half, ~30s: spins up a throwaway local Postgres (no Supabase creds, no Docker, no ports), applies every migration + the Phase 1 seed, runs the four round-trip harnesses (import idempotency, placement lifecycle under RLS, the payout view, the onboarding guard), and smoke-tests `docs/admin/phase-compliance.sql`. Needs `postgresql-16` server binaries installed.
- `npm run test:sim` — the full-pool simulation, ~40s: ~32 members with rule-valid wagers on the 19-bet menu, every wager replayed through `lib/validation.ts`, and the pari-mutuel split reconciled to the cent at field size. Same throwaway Postgres, no Docker.
- `npm run test:e2e` — the browser journeys, ~1 min plus stack start-up. Drives a real Chromium through sign-up → onboarding → admin approval → place/edit/remove → reveal-at-close → payouts, with no human clicking and no real email. **Needs Docker** (it boots the local Supabase stack itself) — see [`docs/DEV_TESTING.md`](docs/DEV_TESTING.md#the-browser-suite-e2e).
- `bash scripts/dry-run-verify.sh` — the whole tournament lifecycle against the real spreadsheets, ~1 min. See [`docs/dry-run/GAMEPLAN.md`](docs/dry-run/GAMEPLAN.md). It regenerates `docs/dry-run/sheets/*.xlsx` as a side effect, so `git checkout -- docs/dry-run/sheets/` before committing.

`npm run test:e2e` runs two Playwright projects: the 13 desktop journeys, and a Pixel 7 project (Sprint 9) that asserts phone geometry — no route overflows 412px, every control in the bet menu is a 44px target measured by where taps actually land, and one wager placed end to end with `tap()`. `bash scripts/mobile-shots.sh before|after` regenerates the screenshots in [`docs/mobile/`](docs/mobile); those are for a human to look at, and nothing automated replaces that.

Every PR runs the gate plus the database and simulation jobs via GitHub Actions (`.github/workflows/ci.yml`). The browser suite is **not** a merge gate — it needs Docker and a full Supabase stack, and a flaky browser shouldn't be able to block a merge; run it locally, or on demand from the Actions tab. `main` auto-deploys to Vercel, so keep the gate green.

---

## Development Workflow (sprint-driven, AI-assisted)

Work happens in the numbered sprints under `docs/sprints/` — one self-contained file each — with `docs/ROADMAP.md` as the dashboard that indexes them. Built with Claude Code:

1. Tell Claude **"start sprint N"** (in plan mode). It reads `docs/sprints/sprint-N.md` for that sprint's tasks and blockers, plans, and waits for approval.
2. Accept the plan; it builds task-by-task with the sprint's **"Done when"** line as the acceptance test.
3. After shipping, it checks off the sprint file's tasks and flips that sprint's status in `docs/ROADMAP.md` — sprint index + phase table + dates — so the tracker always matches reality.
4. Anything that can't be finished in code (bugs to fix later, manual steps in Supabase Studio / Vercel / Resend, questions for Pat or Jake) gets logged as a **GitHub issue** titled `Sprint N: …` — nothing lives only in chat history.

The full protocol Claude follows is in `CLAUDE.md`.

---

## Deployment

1. Push your branch to GitHub.
2. In Vercel, click "New Project" and import the GitHub repo.
3. Add the same environment variables from your `.env.local` to Vercel's project settings. Add
   `SUPABASE_SERVICE_ROLE_KEY` too if admins need to create members who can't use the magic link
   (#124) — it's the one variable that isn't in `.env.local` by default, and the only one that
   bypasses row-level security. Never give it a `NEXT_PUBLIC_` prefix.
4. Click Deploy. Vercel auto-deploys every push to `main` from then on.

No CI/CD pipeline to configure. No servers to manage. Updating bets, odds, statuses, and results is done by re-uploading the bets spreadsheet — **no code changes or redeployments required.**

**Apply migrations before you merge.** Vercel deploys `main` the moment it lands, so a schema
change merged ahead of its migration is live against a database that can't serve it. That is not
theoretical — it took the dashboard down for every member on Aug 31, 2026. `GET /api/health` runs
the reads the app depends on and answers 503 naming the failing one; point an uptime monitor at
`https://ozark-open.com/api/health` (setup and what to do when it's red:
`docs/PRE_TOURNAMENT_CHECKLIST.md` § Monitoring).

---

## The Admin Runbook (updating bets, statuses, and results)

Everything an admin does during tournament week runs on **two tracks** (full rationale in `docs/adr/0001-bet-pick-architecture.md`):

| Track | Tool | Owns |
|---|---|---|
| 1 | The bets spreadsheet → **`/admin/import`** | The entire menu: bets, picks, odds, probabilities, **statuses** (`hidden`/`open`/`closed`), **results** (`hit`/`miss`/`push`/`void`) |
| 1b | **`/admin/people`** | The whole access funnel in one page: who's invited but absent, signed in but stalled, awaiting approval, approved — plus approving bettors (verify display name, set entry fee + player flag, create/edit/revoke their pool entry — revoke is soft, so the entry fee and their wagers leave the pool together and both return on re-approval), **correcting a display name after onboarding**, and pasting in the invite list (Sprint 20 + Sprint 23) |
| 2 | **Supabase Studio** (Table Editor) | Remaining fixes: promoting admins, one-off data fixes, pick→player links |
| 3 | **`/admin/close`** | The clock and the money: chase list, closing a phase, publishing final results |
| 4 | **`/admin/rules`** | The house rules: entry-fee bounds, pick counts, bet-size percentages and caps, with the derived per-entry-fee limits shown as you type (Sprint 23) |

Three rules make the whole thing safe:

- **The sheet is the source of truth.** The workbook Pat already maintains (format: `docs/import/bets-sample.xlsx` — 13 contract columns; helper columns to the right are ignored) drives everything the menu shows. The app never adjudicates a bet; the workbook's helper columns compute hit/miss/push/void and the `result` column carries the verdicts in.
- **Re-uploading is the normal workflow, not a recovery step.** Uploads upsert by the sheet's stable `bet_id`/`pick_id`. Re-uploading an identical sheet is a true no-op; a changed sheet writes only the changed fields; an upload interrupted halfway is healed by uploading again.
- **Uploads never touch anyone's placed wagers.** Only `bets` and `bet_picks` are written. Placements snapshot their odds at write time, so even repricing a pick can't change money already on the board.

No deployments, no code, no Git — the app re-renders on the next page load.

### How to upload

1. Log in as an admin (`is_admin = true` — non-admins get a 404 on this page) and go to **`/admin/import`**. (Admins reach the admin pages from their **`/profile`** page now — the old top-nav "Admin" pill was retired there in Sprint 15; the `/admin/import` and `/admin/view` URLs are unchanged.)
2. Choose the workbook (`.xlsx` or `.csv`) and upload. Bad files are rejected **before any write** — a missing column or an invalid status/result value fails the whole upload with per-row errors, so a typo can't half-apply.
3. Read the **import report**:
   - **Created / updated / unchanged counts** for bets and picks. Sanity-check them against what you meant to change — a routine status flip should show updates roughly equal to the phase's row count and create nothing.
   - **Unmatched pick names** — pick labels that matched no `users.display_name` (expected for "Field"/"Yes"/"No" and players who haven't logged in yet). These picks carry no player link until you set one in Studio (Track 2); the importer never overwrites a link that was hand-set there.
   - **Warnings** — flagged when odds changed on a pick that already has live placements (harmless for payouts, since existing placements keep their snapshotted odds and only future placements get the new price), and when a bet is still `open` although its phase looks closed. Warnings never block the upload; they're there so you can confirm you meant it.
   - **Rejections you'll see** — a `result` other than `Pending` on a bet whose `status` isn't `closed` is refused outright, per row. Results belong on a closed book: publishing them while stake inputs are still showing is the one mistake the sheet can make that bettors see immediately. Close the bet in the sheet, or set the result back to `Pending`.

### Recipe: close a phase (Thursday morning / Saturday morning)

1. **First**, open **`/admin/close`**. It shows the chase list with a one-line "text these people" answer at the top, ready to copy into the group chat. It knows which close it is: before **Phase 1** it chases only people under the pick minimum, because nobody can have hit their exact entry-fee total yet; before **Phase 2** it chases on the minimum *or* the exact total, the last moment either can be fixed. The pick minimum is 5 **across both phases combined** (the 10-pick maximum is the per-phase one). Chase whoever it names. After the close, whatever stands, stands.

   *(The same query lives in [`docs/admin/phase-compliance.sql`](docs/admin/phase-compliance.sql) for the Supabase SQL editor — the fallback for when the app itself is the thing that's broken.)*

2. **Close the phase** on the same page. Each phase has a deadline (2026: Thu Sept 24 and Sat Sept 26, 11:00 CT); "Close now" sets it to this moment, and editing the time moves it. Closing stops new wagers **immediately** — but it does not close the bets or reveal anyone's picks. That still happens on upload, below. Clearing a deadline reopens the phase.
3. In the sheet, flip the phase's rows from `open` to `closed` in the `status` column.
4. Re-upload.
5. **What the app now shows:** stake inputs were already gone at the deadline; now **everyone's placements go public** — each pick lists every bettor's name and amount, with a per-pick total. (While a bet is open, nobody sees anyone else's wagers; the close is the reveal.)

### Recipe: enter results (Thursday night / Saturday night)

1. In the sheet, let the workbook's helper columns settle each pick, then fill the `result` column: `hit`, `miss`, `push`, or `void`. Leave picks that aren't settled yet as `pending` — partial results are fine; you can re-upload as many times as verdicts come in.
2. Re-upload.
3. **What the app now shows:** every non-pending pick gets a color-coded result badge (✓ hit / ✕ miss / = push / ∅ void), and a bet whose picks are all settled reads as **Resolved** instead of Closed. Got a verdict wrong? Fix the cell and re-upload — same as everything else.

### Recipe: open Phase 2 (Friday night)

1. Flip the Phase 2 rows from `hidden` to `open` — updating their odds in the same pass is fine and expected.
2. Re-upload. Hidden bets were never visible to participants; they appear for the first time now.

### Recipe: publish the final results (Saturday night)

1. Upload the final sheet with every bet `closed` and every pick carrying a verdict.
2. On **`/admin/close`**, press **Publish final results**. That's the flip that reveals `/results` to everyone.
3. **It will refuse if anything is unresolved, and that refusal is the point.** The payout rollup *skips* a pending placement rather than scoring it zero, so publishing early divides the whole pool across only the settled wagers: every payout comes out too high, every number looks plausible, and the totals still reconcile against the pool. There is nothing on the page that would look wrong. Finish the uploads, then publish.

### The tournament itinerary

**The executable version of this table is [`docs/PRE_TOURNAMENT_CHECKLIST.md`](docs/PRE_TOURNAMENT_CHECKLIST.md)** — the same weekend as a checkbox script an admin works top to bottom, with the waking-the-project, magic-link and database-export steps that don't fit in a column here. Use that on the weekend; use this table to remember which upload is which.

| When | Upload |
|---|---|
| Before the tournament | Phase 1 rows `open`, Phase 2 rows `hidden` |
| Thursday morning | Close Phase 1 on `/admin/close` (chase → close) → flip `status` in the sheet → re-upload |
| Thursday night | Round 1 / tournament-so-far results in `result` → re-upload |
| Friday night | Phase 2 rows `hidden` → `open`, updated odds → re-upload |
| Saturday morning | Close Phase 2 on `/admin/close` |
| Saturday night | Final results → re-upload → **Publish final results** on `/admin/close` |

### Recipe: change a house rule

Go to **`/admin/rules`**. Every rule the app enforces is on that page, and the table under the form shows what the numbers actually mean per entry fee — "50%, capped at $20" doesn't tell you that a $25 entry allows $12 (amounts floor, they don't round) or that everything from $40 up allows exactly $20. Bad values are refused with a reason, including the ones that look fine and quietly break the tournament: a percentage that floors to a $0 maximum bet, or a pick minimum nobody can reach in two phases.

**Changing a rule never re-checks wagers already placed.** Whatever stands, stands — every wager keeps the limits it was placed under, and a lowered cap can leave existing slates above it. New values apply from the next placement onward.

### Recipe: place a wager for someone who can't

Some members won't get through the magic-link flow. On **`/admin/people`**, open their **Edit** panel and press **Place bets for them** — that opens the ordinary bet menu at `/bets?for=<them>`, showing **their** entry fee, their remaining budget, their existing slate and their locked odds, with a banner across the top so you can't forget whose menu you're in.

Two things to know:

- **Every rule is checked against them, not you.** Their entry fee, their running total, their self-bet cap, their opponent block. A wager that would break one of their limits is refused, in the same words they would see.
- **The wager is recorded as entered by you.** `/admin/view` shows "Entered by <name>" on those rows. It's their wager and their money — the attribution just makes a September dispute reconstructable.

If they never logged in at all, create their account first — the next recipe.

### Recipe: add a member who can't use the magic link at all

On **`/admin/people`**, open **"Add a member who can't use the magic link"**. Type their email, their
display name, their entry fee and whether they're playing, then **Add and approve**. That creates
their account outright — **no email is sent and there is nothing for them to click** — approves them,
and puts their entry fee in the pool. You can place wagers for them immediately (previous recipe).

Three things to know:

- **Check the email carefully.** It becomes a real, confirmed login. A typo'd address that happens
  to belong to somebody else is an account that person could sign in to. You can correct it in
  Studio (`users` → `email`) before anyone uses it.
- **The name must match the bet sheet**, for the same reason as every other display name: the
  importer links picks to people by matching it, and a mismatch silently disables that person's
  self-bet cap, self-pick flag and opponent block.
- **They can still claim the account later.** It's an ordinary account — if they eventually get the
  magic link working, that address signs them into *this* account, with their entry fee, name and
  wagers all intact. Nothing to merge.

**Requires `SUPABASE_SERVICE_ROLE_KEY`** in Vercel's environment variables (Supabase dashboard →
Settings → API; see `.env.local.example` for the warnings that come with it). Without it the form
answers "account creation isn't configured on this deployment" and the rest of the app is
unaffected. It is the only place this project uses a key that bypasses row-level security, and it's
confined to one module with one importer — `docs/DATA_MODEL.md` §5.1 explains why and how.

### Recipe: undo a bad import or a bad edit

Uploaded last week's sheet? Fat-fingered a cell in Studio? The app keeps save states of the money tables, and rolling back is one command.

**You already have a snapshot.** Every import takes one automatically before it applies — the import report prints its id and the exact command to undo that upload. There's also a **Snapshot now** button on `/admin/import`; press it before editing anything by hand.

```bash
# What can I go back to?
node --experimental-strip-types scripts/restore-snapshot.ts --list

# Go back.
node --experimental-strip-types scripts/restore-snapshot.ts <id> "$SUPABASE_DB_URL" --yes
```

**This overwrites current state.** Bets, picks, wagers, participants and the tournament row all go back to how they were at that instant — *including throwing away wagers people placed since*. On a Friday afternoon that can be real money someone typed in. The script tells you how old the snapshot is and how many rows it's about to discard before it touches anything, and refuses to run without `--yes`. Read those numbers, then decide.

It does **not** touch accounts, the invite list, avatars or the bet categories — undoing a bad bet import never costs you the roster. Afterwards it prints row counts and the pool reconciliation, and exits non-zero if they don't match the save state.

Full detail, including the schedule and retention: [`docs/DATA_SAFETY.md`](docs/DATA_SAFETY.md). That doc also covers the *other* backup — `scripts/db-export.sh`, which is the fire escape to this undo button.

### Track 2 — Supabase Studio

Studio (https://supabase.com/dashboard → Project → Table Editor) is the admin UI for everything that isn't the menu — **data only, never schema**:

- **Promote an admin:** `users` → set `is_admin = true`.
- **Fix a display name:** do it on **`/admin/people`** — the approve panel for someone awaiting approval, the **Edit** panel for someone already approved (Sprint 23 / #99). Studio (`users` → `display_name`) still works but is no longer the only way. Members set their own name **once** at onboarding (Sprint 16); after that a guard trigger pins it, so corrections are an admin job. Names matter twice: they're what everyone sees on closed bets, and the importer matches pick labels against them. Members *do* self-manage their own `nickname` + `avatar_url` on `/profile` (Sprint 15) — those are cosmetic and never affect matching, so leave them alone in Studio.
- **Register / approve a participant:** use **`/admin/people`** (Sprint 20), not Studio — approving a member sets their `entry_fee` + `is_player` and creates the `tournament_participants` row that grants betting access. (The row can still be hand-edited in Studio if ever needed; the app's gate is simply whether it exists.) The same page is the read-only chase list it replaced: who still needs to register, who registered but can't bet yet, who's ready, who's an admin, and when each person last logged in. `/admin/roster` and `/admin/participants` redirect here.
- **Enter the expected roster:** easiest on **`/admin/people`** — paste one `name, email` per line into the invite box and it adds the missing ones (re-pasting the same list is safe). Studio still works for one-off edits and removals: `tournament_invites` → one row per person you expect (`tournament_id` + `email`, optional `invited_name`). No account needed — that's the point: the console matches an invite to a member by email (case-insensitive) the moment they log in, so you can see who hasn't shown up yet. These rows are **not** participants and never touch pool math.
- **Link an unmatched pick to a player:** `bet_picks` → set `player_user_id` (this powers self-pick flagging). The importer respects hand-set links on every future upload.
- **One-off data fixes** as needed.

> **Both prod database steps landed Jul 18, 2026** (the rework migration and the admin flags — issues #12 and #15, closed). `supabase/seed-sample-phase1.sql` remains available as a fallback: paste it into the Supabase SQL editor after the migrations. Seed and importer upsert by the same sheet IDs, so either can safely run over the other.

### Track 3 — Claude Code (automated)

The two tracks above are the *manual* runbook. Once the Supabase MCP is connected
(a free personal access token in `SUPABASE_ACCESS_TOKEN`), the coding agent does
the Track 2 data edits and the prod migrations itself — no SQL-editor pasting, no
"run this in prod" issue. Auth-dashboard settings (SMTP, session lifetime,
magic-link template) and Vercel env vars are automated too. Setup and the full
issue-by-issue mapping are in [`docs/AGENT_AUTOMATION.md`](docs/AGENT_AUTOMATION.md).

---

## License & Disclaimer

Private project for tournament participants. Not affiliated with Sigma Tau Gamma Fraternity. No real sportsbook, no commercial gambling.
