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
| Auth + tournament/participant setup (**verified in prod**); Sprints 1–6: bet/pick schema (ADR 0001), spreadsheet ingestion (`/admin/import`), placements + validation, My Bets + compliance, closed-bet views with everyone's placements + result badges, the admin runbook — all unit-tested and built locally, awaiting the manual prod SQL chain (#12 → #15 → #22 → #28) and in-browser verification | Sprint 7: payouts (theoretical + final) · Sprint 8: leaderboard mirror · Sprint 9: mobile pass + group dry run |

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
3. Copy `.env.local.example` to `.env.local` and fill in your Supabase URL and anon key (find them at https://supabase.com/dashboard → Project → Settings → API).
4. Run database migrations: `npx supabase db push` (or run the SQL files in `supabase/migrations/` manually in the Supabase SQL editor).
5. Start the dev server: `npm run dev`
6. Visit http://localhost:3000

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
3. Add the same environment variables from your `.env.local` to Vercel's project settings.
4. Click Deploy. Vercel auto-deploys every push to `main` from then on.

No CI/CD pipeline to configure. No servers to manage. Updating bets, odds, statuses, and results is done by re-uploading the bets spreadsheet — **no code changes or redeployments required.**

---

## The Admin Runbook (updating bets, statuses, and results)

Everything an admin does during tournament week runs on **two tracks** (full rationale in `docs/adr/0001-bet-pick-architecture.md`):

| Track | Tool | Owns |
|---|---|---|
| 1 | The bets spreadsheet → **`/admin/import`** | The entire menu: bets, picks, odds, probabilities, **statuses** (`hidden`/`open`/`closed`), **results** (`hit`/`miss`/`push`/`void`) |
| 2 | **Supabase Studio** (Table Editor) | People and fixes: admins, display names, participants, entry fees, pick→player links |

Three rules make the whole thing safe:

- **The sheet is the source of truth.** The workbook Pat already maintains (format: `docs/import/bets-sample.xlsx` — 13 contract columns; helper columns to the right are ignored) drives everything the menu shows. The app never adjudicates a bet; the workbook's helper columns compute hit/miss/push/void and the `result` column carries the verdicts in.
- **Re-uploading is the normal workflow, not a recovery step.** Uploads upsert by the sheet's stable `bet_id`/`pick_id`. Re-uploading an identical sheet is a true no-op; a changed sheet writes only the changed fields; an upload interrupted halfway is healed by uploading again.
- **Uploads never touch anyone's placed wagers.** Only `bets` and `bet_picks` are written. Placements snapshot their odds at write time, so even repricing a pick can't change money already on the board.

No deployments, no code, no Git — the app re-renders on the next page load.

### How to upload

1. Log in as an admin (`is_admin = true` — non-admins get a 404 on this page) and go to **`/admin/import`**.
2. Choose the workbook (`.xlsx` or `.csv`) and upload. Bad files are rejected **before any write** — a missing column or an invalid status/result value fails the whole upload with per-row errors, so a typo can't half-apply.
3. Read the **import report**:
   - **Created / updated / unchanged counts** for bets and picks. Sanity-check them against what you meant to change — a routine status flip should show updates roughly equal to the phase's row count and create nothing.
   - **Unmatched pick names** — pick labels that matched no `users.display_name` (expected for "Field"/"Yes"/"No" and players who haven't logged in yet). These picks carry no player link until you set one in Studio (Track 2); the importer never overwrites a link that was hand-set there.
   - **Warnings** — flagged when odds changed on a pick that already has live placements. Harmless for payouts (existing placements keep their snapshotted odds; only future placements get the new price), but you should know you did it.

### Recipe: close a phase (Thursday morning / Saturday morning)

1. **First**, run [`docs/admin/phase-compliance.sql`](docs/admin/phase-compliance.sql) in the Supabase SQL editor. It lists every participant's per-phase pick counts and wagered total, flagging who's under the phase minimum or off their exact entry-fee total (the same rules the app's compliance banners show). Chase the flagged stragglers. After the close, whatever stands, stands.
2. In the sheet, flip the phase's rows from `open` to `closed` in the `status` column.
3. Re-upload.
4. **What the app now shows:** stake inputs are gone from those bets, and **everyone's placements go public** — each pick lists every bettor's name and amount, with a per-pick total. (While a bet is open, nobody sees anyone else's wagers; the close is the reveal.)

### Recipe: enter results (Thursday night / Saturday night)

1. In the sheet, let the workbook's helper columns settle each pick, then fill the `result` column: `hit`, `miss`, `push`, or `void`. Leave picks that aren't settled yet as `pending` — partial results are fine; you can re-upload as many times as verdicts come in.
2. Re-upload.
3. **What the app now shows:** every non-pending pick gets a color-coded result badge (✓ hit / ✕ miss / = push / ∅ void), and a bet whose picks are all settled reads as **Resolved** instead of Closed. Got a verdict wrong? Fix the cell and re-upload — same as everything else.

### Recipe: open Phase 2 (Friday night)

1. Flip the Phase 2 rows from `hidden` to `open` — updating their odds in the same pass is fine and expected.
2. Re-upload. Hidden bets were never visible to participants; they appear for the first time now.

### The tournament itinerary

| When | Upload |
|---|---|
| Before the tournament | Phase 1 rows `open`, Phase 2 rows `hidden` |
| Thursday morning | Close Phase 1 (compliance check → flip `status` → re-upload) |
| Thursday night | Round 1 / tournament-so-far results in `result` → re-upload |
| Friday night | Phase 2 rows `hidden` → `open`, updated odds → re-upload |
| Saturday morning | Close Phase 2 |
| Saturday night | Final results → re-upload. Payouts are now final. |

### Track 2 — Supabase Studio

Studio (https://supabase.com/dashboard → Project → Table Editor) is the admin UI for everything that isn't the menu — **data only, never schema**:

- **Promote an admin:** `users` → set `is_admin = true`.
- **Fix a display name:** `users` → `display_name` (new accounts default to their email address). Names matter twice: they're what everyone sees on closed bets, and the importer matches pick labels against them.
- **Register a participant:** add a row to `tournament_participants` with their `entry_fee` (and `is_player` if they're in the field).
- **Link an unmatched pick to a player:** `bet_picks` → set `player_user_id` (this powers self-pick flagging). The importer respects hand-set links on every future upload.
- **One-off data fixes** as needed.

> **Until the prod database steps land** (rework migration + admin flag, issues #12/#15), the fallback remains pasting `supabase/seed-sample-phase1.sql` into the Supabase SQL editor (after the migrations). Seed and importer upsert by the same sheet IDs, so either can safely run over the other.

---

## License & Disclaimer

Private project for tournament participants. Not affiliated with Sigma Tau Gamma Fraternity. No real sportsbook, no commercial gambling.
