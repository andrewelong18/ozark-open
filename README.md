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
| Auth (magic link), tournament/participant setup, initial bet menu (pre-ADR-0001 schema — rework scheduled) | Sprint 0: verify production deploy · Sprint 1: bet/pick schema rework · Sprint 2: spreadsheet ingestion · Sprints 3–5: bet placement · Sprints 6–9: results, payouts, leaderboard, dry run |

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

## Updating Bets and Results (the admin workflow)

Two tracks (full rationale in `docs/adr/0001-bet-pick-architecture.md`; the detailed runbook lands in Sprint 6):

**Track 1 — the bets spreadsheet → `/admin/import`.** The workbook Pat already maintains is the source of truth for the menu: bets, picks, odds, probabilities, statuses, and results (its helper columns compute hit/miss/push/void). The format is `docs/import/bets-sample.xlsx`. Upload it at each point in the tournament itinerary:

1. **Before the tournament** — Phase 1 bets `open` (Phase 2 rows ship `hidden`).
2. **Thursday morning** — flip Phase 1 to `closed` in the sheet, re-upload.
3. **Thursday night** — fill in Round 1 / Tournament-so-far results, re-upload.
4. **Friday night** — flip Phase 2 rows to `open` (with updated odds), re-upload.
5. **Saturday morning** — close Phase 2, re-upload.
6. **Saturday night** — final results, re-upload. Payouts are now final.

Uploads upsert by the sheet's `bet_id`/`pick_id` — re-uploading is always safe, and the app re-renders the next time anyone loads it. Uploads never touch anyone's placed wagers.

**Track 2 — Supabase Studio** (https://supabase.com/dashboard → Project → Table Editor) for everything that isn't the menu: promoting admins, setting display names, registering tournament participants and entry fees, and one-off data fixes.

No deployments, no code, no Git.

---

## License & Disclaimer

Private project for tournament participants. Not affiliated with Sigma Tau Gamma Fraternity. No real sportsbook, no commercial gambling.
