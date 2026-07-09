# Ozark Open Sportsbook

A private fantasy-golf betting platform for the annual Ozark Open tournament. Participants log in, place bets on a curated set of odds published by admins, and see their winnings calculated as a pari-mutuel share of the entry pool.

> **No house, no rake, no profit.** The entire entry pool is redistributed to participants based on the proportional value of their theoretical winnings. This is a private pool for tournament participants only.

---

## What This Repo Contains

A web application that lets:

- **Participants** log in, view the active bet menu, place bets within the configured constraints, and see their outcomes and payouts.
- **Admins** (Pat, Jake, Steve, Andrew) publish bets, mark outcomes (hit / miss / push / void) after each round of golf, and run final payout calculations.

Everything else — tournament scoring, skins, the leaderboard math — stays in the existing Excel workbook. The app reads from that workbook (or a Google Sheets mirror of it) for display purposes only.

---

## Current Status

**Target: fully wrapped by September 10, 2026** (tournament is September 24–27).

| Built (code complete) | Up next |
|---|---|
| Auth (magic link), tournament/participant setup, bet menu with odds display, all migrations through `bets`/`bet_subjects` | Sprint 0: verify production deploy · Sprints 1–3: bet placement & validation · Sprints 4–8: outcomes, payouts, leaderboard, dry run |

`ROADMAP.md` is the live sprint tracker — status table, numbered sprints with checkboxes, blockers, and target dates. All product decisions are settled and logged in `PRD.md` §12; there are no open spec questions.

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

See `ARCHITECTURE.md` for the diagram and deeper rationale.

---

## Repository Layout

```
ozark-open/
├── README.md              ← you are here
├── PRD.md                 ← product requirements; bet rules; §12 decision log
├── ARCHITECTURE.md        ← how the pieces fit together
├── DATA_MODEL.md          ← database schema in detail; payout view
├── ROADMAP.md             ← phase roadmap + live sprint tracker
├── CLAUDE.md              ← instructions for AI-assisted sprint work
├── middleware.ts          ← session refresh + route protection
├── app/                   ← Next.js App Router pages (login, dashboard, bets, auth)
├── components/            ← header + shadcn/ui components
├── lib/                   ← Supabase clients, odds math (validation & payouts to come)
├── supabase/
│   └── migrations/        ← SQL migration files (the only way schema changes)
├── docs/superpowers/      ← per-phase design specs and implementation plans
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

Work happens in the numbered sprints defined in `ROADMAP.md`, built with Claude Code:

1. Tell Claude **"start sprint N"** (in plan mode). It reads the sprint's tasks and blockers, plans, and waits for approval.
2. Accept the plan; it builds task-by-task with the sprint's **"Done when"** line as the acceptance test.
3. After shipping, it updates `ROADMAP.md` itself — checkboxes, status table, dates — so the tracker always matches reality.
4. Anything that can't be finished in code (bugs to fix later, manual steps in Supabase Studio / Vercel / Resend, questions for Pat or Jake) gets logged as a **GitHub issue** titled `Sprint N: …` — nothing lives only in chat history.

The full protocol Claude follows is in `CLAUDE.md`.

---

## Deployment

1. Push your branch to GitHub.
2. In Vercel, click "New Project" and import the GitHub repo.
3. Add the same environment variables from your `.env.local` to Vercel's project settings.
4. Click Deploy. Vercel auto-deploys every push to `main` from then on.

No CI/CD pipeline to configure. No servers to manage. Updating odds, bet outcomes, and payouts is done in the Supabase Studio dashboard — **no code changes or redeployments required.**

---

## Updating Bets and Outcomes (the "CMS" workflow)

The admin workflow happens entirely in Supabase Studio (https://supabase.com/dashboard → Project → Table Editor):

1. Open the `bets` table — it looks like a spreadsheet.
2. Add a new row for each bet you want to release: number, description, category, odds, round, status = `open`.
3. After each day of golf, find the bet rows and update `outcome` to `hit`, `miss`, `push`, or `void`.
4. The app re-renders automatically the next time anyone loads it.

That's the whole CMS. No deployments, no code, no Git.

---

## License & Disclaimer

Private project for tournament participants. Not affiliated with Sigma Tau Gamma Fraternity. No real sportsbook, no commercial gambling.
