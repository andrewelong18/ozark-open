# Ozark Open Sportsbook — Context for Claude Code

Private fantasy-golf betting platform for the annual Ozark Open tournament. Pari-mutuel pool — no house, no rake, no profit. ~24 participants. Strictly behind login.

## Read These First

Before proposing or writing code, load the foundation docs in this order:

1. **[README.md](README.md)** — entry point, tech stack, local setup, deployment
2. **[PRD.md](PRD.md)** — what we're building and why; pari-mutuel math; the seven bet categories; the six bet-submission rules; user stories
3. **[ARCHITECTURE.md](ARCHITECTURE.md)** — system diagram; tech-choice rationale; auth flow; RLS strategy; where the math lives
4. **[DATA_MODEL.md](DATA_MODEL.md)** — every table column-by-column; the payout view; RLS policy summary; migration strategy
5. **[ROADMAP.md](ROADMAP.md)** — phased build plan; we're currently at Phase 0

## Stack (decided — don't relitigate)

- **Framework**: Next.js 14+ (App Router), TypeScript
- **DB + Auth**: Supabase (Postgres, magic-link email, RLS)
- **Hosting**: Vercel (auto-deploy from `main`)
- **Styling**: Tailwind CSS + shadcn/ui
- **Leaderboard source**: Google Sheets API (read-only, Phase 8)

Rationale for each choice is in `ARCHITECTURE.md` §2. If asked to swap one, push back and point at that section first.

## Project-Specific Conventions

- **Schema changes go through SQL files in `supabase/migrations/`.** Never edit schema in Supabase Studio — only data. Schema in Studio breaks prod/local parity.
- **Supabase Studio is the admin "CMS".** No custom admin UI for v1. Adding bets, marking outcomes, promoting users to admin = all done in Studio's table editor.
- **Bet validation runs server-side** in `lib/validation.ts`, called from API routes. Client-side checks are UX, not security.
- **Theoretical payouts come from a Postgres view** (`placement_payouts_view`, see DATA_MODEL.md §4). The pari-mutuel proportional split runs in TypeScript at render (`lib/payouts.ts`).
- **Tournament rule parameters live on the `tournaments` row**, not in code. Entry-fee bounds, max single bet, self-bet caps — all data, not constants. So the 2026 rules are preserved exactly even if 2027 changes them.
- **The seven bet rules from PRD §7 are sacred.** They come from the original Sportsbook memo. Don't relax, reorder, or "simplify" them without asking.
- **Self-bet detection** via `bet_subjects` join table; flagged placements get `requires_admin_review = true` for manual approval. Indirect self-bets aren't auto-detectable — that's by design.

## Out of Scope (don't propose these)

- Tournament scoring, skins, leaderboard math — lives in the Excel workbook (mirrored to Sheets, read-only)
- Payment processing — Venmo and cash, handled outside the app
- Public access, marketing pages, SEO — private app, behind login only
- Custom in-app admin UI — Supabase Studio is the admin UI
- Notifications, email digests, push notifications — out for v1
- Multi-tenancy — one pool for one group
- New bet *categories* without code changes — the seven `resolution_type` values are baked in by design

## Working Style

- This is a vibe-coded weekend project, not an enterprise app. Prefer the simplest thing that works.
- Don't add abstraction layers, factories, or "future-proofing" the docs don't ask for.
- When the docs and the code disagree, the docs are the source of truth — flag the drift, don't silently align to the code.
