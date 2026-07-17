# Roadmap & Sprint Tracker

The phased build plan **and** the live status tracker. Phases describe *what* gets built; sprints are the numbered, sitting-sized units of work we execute one at a time. This file is the dashboard — the single source of truth for "where are we?" **The work for each sprint lives in its own file under [`sprints/`](sprints/)** — start there, not here.

> **How to start a sprint:** open `docs/sprints/sprint-N.md` (self-contained: goal, reads, blockers, checkboxes, done-when). Check the blocker sprint's "Done when" if it's a dependency. Come back here only to flip status when the sprint ships.

> **Re-planned July 15, 2026** around Pat & Jake's new betting architecture (`docs/adr/0001-bet-pick-architecture.md`): bets now have picks, betting windows are phases, results arrive per pick from the admin's spreadsheet, and the menu is published via upload. The old Sprints 1–6 were renumbered and re-cut; two new sprints (schema rework, ingestion) were inserted up front. The July 11 audit's **Spike A** (bet-taxonomy design meeting) is resolved — the memo *is* its outcome — and **Spike B** (void → pool math) was confirmed July 15 (PRD §12 A7). Remaining open calls live in `OUTSTANDING_DECISIONS.md`.

---

## Timeline

- **Tournament:** September 24–26, 2026
- **Fully wrapped:** September 10, 2026 at the latest (two weeks before tee-off)
- **Feature freeze:** ~August 28, 2026 — after this, only bugs, polish, and dry-run fixes
- Coding is Claude-Code-assisted, so build time per sprint is short. The pacing constraints are **deploy verification and human testing** — not code. The schedule absorbed two extra sprints without moving the freeze; it's tighter than before, so don't let sprints sprawl.

| Window | Work |
|---|---|
| Week of Jul 13 | Sprint 0 (deploy & verify) |
| Week of Jul 20 | Sprints 1–2 (bet/pick schema rework, spreadsheet ingestion) |
| Late Jul – early Aug | Sprints 3–5 (bet placement, the heart of the app) |
| Mid August | Sprints 6–7 (results display, payouts) |
| Late August | Sprint 8 (leaderboard) → **feature freeze Aug 28** |
| Sept 1–10 | Sprint 9 (mobile pass, group dry run, fixes) |
| Sept 24–26 | 🏌️ Ozark Open |

---

## Sprint Index

One sprint = one sitting. Open the linked file to work it; don't start a sprint while its blockers are open. **Legend:** ✅ complete · 🔶 in progress · 🔲 not started · ⚠️ needs rework

| Sprint | Focus | Status | Blockers |
|---|---|---|---|
| [0](sprints/sprint-0.md) | Deploy & verify foundations | 🔶 | none |
| [1](sprints/sprint-1.md) | Bet/pick schema rework & menu rebuild | 🔶 code complete Jul 17, 2026 — awaiting prod SQL + merge | 0 |
| [2](sprints/sprint-2.md) | Spreadsheet ingestion (`/admin/import`) | 🔲 | 1 |
| [3](sprints/sprint-3.md) | Placements schema & validation | 🔲 | 1 (after 2) |
| [4](sprints/sprint-4.md) | Placement API & place-bet UI | 🔲 | 3 |
| [5](sprints/sprint-5.md) | My Bets & phase compliance | 🔲 | 4 |
| [6](sprints/sprint-6.md) | Results & closed-bet views | 🔲 | 2 + 4 |
| [7](sprints/sprint-7.md) | Payouts: theoretical & final | 🔲 | 6 |
| [8](sprints/sprint-8.md) | Leaderboard mirror | 🔲 | Pat's Sheets mirror |
| [9](sprints/sprint-9.md) | Polish & group dry run | 🔲 | 0–7 (8 nice-to-have) |

---

## Status Summary (by phase)

| Phase | What | Status | Sprint(s) | Target |
|---|---|---|---|---|
| 0 — Foundations | Skeleton, deploy pipeline | ✅ **Verified in production Jul 16, 2026** | 0 | Jul 18 |
| 1 — Auth | Magic-link login, users table | ✅ **Verified in production Jul 16, 2026** (magic-link login → dashboard) | 0 | Jul 18 |
| 2 — Tournament setup | Tournaments, participants, dashboard | ✅ **Verified in production Jul 16, 2026** | 0 | Jul 18 |
| 3 — Bet menu | Bets **and picks**, `/bets` page | 🔶 Reworked to ADR 0001 Jul 17, 2026 — awaiting prod SQL + merge | 1 | Jul 24 |
| 3b — Spreadsheet ingestion | `/admin/import` upload pipeline | 🔲 Not started (new scope, ADR 0001 §7) | 2 | Jul 31 |
| 4 — Placing bets | Placements, validation, My Bets | 🔲 Not started | 3, 4, 5 | Aug 12 |
| 5 — Results | Closed-bet views, per-pick results via re-upload | 🔲 Not started | 6 | Aug 16 |
| 6 — Theoretical payouts | Payout view, per-placement display | 🔲 Not started | 7 | Aug 21 |
| 7 — Final payouts | Pari-mutuel split (void-adjusted pool), `/results` | 🔲 Not started | 7 | Aug 21 |
| 8 — Leaderboard | Google Sheets mirror | 🔲 Not started | 8 | Aug 28 |
| 9 — Polish & dry run | Mobile pass, group test | 🔲 Not started | 9 | Sep 10 |

---

## Completed Work (Phases 0–3)

Shipped May 7, 2026 (see git history and `docs/superpowers/` for the design specs and plans):

- **Phase 0:** Next.js 15 (App Router) + Tailwind + shadcn/ui skeleton; header; landing page; `/dashboard` and `/bets` routes.
- **Phase 1:** Magic-link login (`/login`, auth callback, signout), session middleware with route protection, `public.users` table + new-user trigger + RLS (`supabase/migrations/20260507000000_users_table.sql`).
- **Phase 2:** `tournaments` + `tournament_participants` tables with RLS and the 2026 seed row (`20260507000001_tournaments.sql`); `/dashboard` showing tournament + registration status.
- **Phase 3:** `bet_categories` / `bets` / `bet_subjects` tables with RLS and the seven-category seed (`20260507000002_bets.sql`); `/bets` menu grouped by round → category with American/fractional/implied odds (`lib/odds.ts`). **⚠️ Superseded in part by ADR 0001** (July 15): the one-odds-per-bet schema, `bet_subjects`, the seven categories, and the computed odds display are all replaced by the bet/pick structure — Sprint 1 reworks this. Auth, tournaments, and the page scaffolding carry forward untouched.

**Phases 0–2 are now verified in production** (Jul 16, 2026) — infra was rebuilt under Andrew's own Vercel + Supabase accounts, taking ownership back from the fork. Production: **https://ozark-open-sportsbook.vercel.app**. Phase 3 remains ⚠️ rework-required regardless (Sprint 1). See `sprints/sprint-0.md` for the infra facts and the env-var gotcha.

---

## What Is Explicitly Not on the Roadmap

- A custom admin UI beyond `/admin/import` (Studio is the admin UI for everything else — ADR 0001 §7).
- A bet resolution engine (results are computed in the admin's workbook and uploaded — ADR 0001 §3).
- Notifications, email digests, or push notifications (out of scope for v1).
- A mobile app (it's a mobile-responsive web app — no native build).
- Public access, marketing pages, SEO (private app, behind login).
- Multi-tenancy (this is one pool for one group; it does not need to support multiple unrelated leagues).
- Payment processing (Venmo and cash, out of band, as today).
- Career P/L across tournaments (v2).

If a feature isn't here, default to "no" until someone makes the case for it.
