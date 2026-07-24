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
| [1](sprints/sprint-1.md) | Bet/pick schema rework & menu rebuild | 🔶 merged Jul 17, 2026 (PR #10); prod SQL applied Jul 18, 2026 (#12 — 13 bets/57 picks) — `/bets` render verify pending (#31) | 0 |
| [2](sprints/sprint-2.md) | Spreadsheet ingestion (`/admin/import`) | 🔶 code complete + local round-trip Jul 17, 2026; prod SQL applied Jul 18, 2026 (#12) — prod import verify pending (#15: only Andrew is admin so far) | 1 |
| [3](sprints/sprint-3.md) | Placements schema & validation | ✅ validation tests pass + prod migration applied Jul 18, 2026 (#22 — RLS on, 5 policies) | 1 (after 2) |
| [4](sprints/sprint-4.md) | Placement API & place-bet UI | 🔶 code complete + tested locally Jul 17, 2026 (unit + local-Postgres RLS) — in-browser verify pending (prod SQL #12/#22 applied Jul 18, 2026; #15 admins partial) | 3 |
| [5](sprints/sprint-5.md) | My Bets & phase compliance | 🔶 code complete + tested locally Jul 17, 2026 — in-browser verify pending (prod SQL #12/#22 applied Jul 18, 2026; #15 partial, #24 open) | 4 |
| [6](sprints/sprint-6.md) | Results & closed-bet views | 🔶 code complete + tested locally Jul 18, 2026 — prod SQL applied Jul 18, 2026 (#28) — browser verify (#31) + Pat walkthrough (#30) pending | 2 + 4 |
| [7](sprints/sprint-7.md) | Payouts: theoretical & final | 🔶 code complete + tested locally Jul 18, 2026 (unit tests incl. the 2026 worked example, PG16 round trip for the view) — view migration + full chain applied Jul 18, 2026 (#34); prod verify pending (numbers vs Pat's hand-math; `tournament.status` flip) | 6 |
| [8](sprints/sprint-8.md) | Leaderboard mirror | 🔶 code complete + unit-tested + built locally Jul 21, 2026 (`lib/leaderboard.ts` reads the "Sportsbook Leaderboard" tab read-only, 5-min cache; `/leaderboard` 8-column table with `+0;-0;"E"` to-par formatting; nav tab + route guard) — Google Cloud service account + Vercel env vars pending (manual), then prod "within 5 min" verify | Pat's Sheets mirror |
| [9](sprints/sprint-9.md) | Polish & group dry run | 🔲 | 0–7 (8 nice-to-have) |
| [10](sprints/sprint-10.md) | ★ Admin roster & registration status | 🔲 | none hard (bonus) |
| [11](sprints/sprint-11.md) | ★ Bet-state snapshots & rollback | 🔲 | 3 in prod (bonus) |
| [12](sprints/sprint-12.md) | ★ Animation & delight pass + Jake celebration | 🔲 | Jake photo + sound from Andrew (bonus) |
| [13](sprints/sprint-13.md) | ★ Funny ad slots (dashboard + landing) | 🔲 | ≥1 finished creative from Andrew (bonus) |
| [14](sprints/sprint-14.md) | ★ Announcement banner (admin-toggled, dismissible) | 🔲 | none (bonus) |
| [15](sprints/sprint-15.md) | ★ Self-serve profile page (nickname, avatar, status; Competitive Analysis §1.1) | 🔶 code complete Jul 19, 2026 (nickname + avatar_url columns, `avatars` storage bucket, `/profile`, admin entry relocated here, name+nickname everywhere — unit-tested + built locally); prod SQL + browser verify pending | none (bonus) |
| [16](sprints/sprint-16.md) | ★ First-run onboarding, self-set identity & admin bettor-approval (Competitive Analysis §1.2, expanded) | 🔶 code complete Jul 20, 2026 (`onboarded_at` + relaxed guard, `/onboarding` flow + walkthrough, middleware gate, `/admin/participants` approval — unit-tested + built locally); prod SQL + browser verify pending | none hard (bonus); builds on 1 + 4 + 15 |
| [17](sprints/sprint-17.md) | ★ Bet-slip review & confirmation (Competitive Analysis §1.3 + §1.5) | 🔲 | none hard (bonus); builds on 4 + 5 |
| [18](sprints/sprint-18.md) | ★ Player profile modals (clickable names → animated profile + 4-year chart) | 🔶 code complete Jul 23, 2026 (6 admin-owned profile columns seeded dummy, first modal primitive on Base UI, `PlayerChip` on `/bets` + `/results` — unit-tested + built locally; leaderboard names deferred); prod SQL + browser verify pending | none hard (bonus); builds on 15 |
| [19](sprints/sprint-19.md) | Automated testing & pre-prime-time pool simulation (Playwright E2E · DB round-trips in CI · full-pool synthetic seed) | 🔲 planned Jul 24, 2026 — testing/hardening sprint that automates the browser journeys behind #24/#26/#31/#35 and lets one person simulate the ~32-person pool; feeds Sprint 9's dry run | none hard; app code-complete through 8 |

> **★ Sprints 10–18 are the bonus wish list** (Andrew, Jul 18, 2026): enhancements, never MVP blockers. Work them only when no MVP sprint (0–9) is waiting on you; they must land before the Aug 28 feature freeze or be cut without ceremony — the tournament runs fine without them. *(Sprint 15 — the Competitive Analysis §1.1 profile page — was cut into a file Jul 19, 2026. Sprint 16 — the §1.2 first-run onboarding stub, expanded on Andrew's Jul 20 direction to also cover self-set identity + admin bettor-approval — was cut into a file Jul 20, 2026. Sprint 17 keeps its `COMPETITIVE_ANALYSIS.md` §6 number. Sprint 18 — clickable player profile modals — was added Jul 23, 2026 on Andrew's direction.)*

---

## Status Summary (by phase)

| Phase | What | Status | Sprint(s) | Target |
|---|---|---|---|---|
| 0 — Foundations | Skeleton, deploy pipeline | ✅ **Verified in production Jul 16, 2026** | 0 | Jul 18 |
| 1 — Auth | Magic-link login, users table | ✅ **Verified in production Jul 16, 2026** (magic-link login → dashboard) | 0 | Jul 18 |
| 2 — Tournament setup | Tournaments, participants, dashboard | ✅ **Verified in production Jul 16, 2026** | 0 | Jul 18 |
| 3 — Bet menu | Bets **and picks**, `/bets` page | 🔶 Reworked to ADR 0001, merged Jul 17, 2026; prod SQL applied Jul 18, 2026 (#12) — `/bets` render verify pending (#31) | 1 | Jul 24 |
| 3b — Spreadsheet ingestion | `/admin/import` upload pipeline | 🔶 Code complete + local round-trip Jul 17, 2026; prod SQL applied Jul 18, 2026 (#12) — prod import verify pending (#15: only Andrew admin so far) | 2 | Jul 31 |
| 4 — Placing bets | Placements, validation, My Bets | 🔶 **Sprints 3–5 all code complete Jul 17, 2026** (schema, validation, placement API, `/bets` UI, `/my-bets`, compliance banners, dashboard rework, admin chase SQL — unit-tested + built locally); phase-wide in-browser verify pending (prod SQL #12/#22 applied Jul 18, 2026; #15 admins partial, #24 open) | 3, 4, 5 | Aug 12 |
| 5 — Results | Closed-bet views, per-pick results via re-upload | 🔶 Code complete + tested locally Jul 18, 2026 (everyone's placements on closed bets, derived settled badge, users read-all migration, README runbook — unit-tested + built locally); in-browser verify pending (prod SQL #28 applied Jul 18, 2026; browser #31, Pat #30) | 6 | Aug 16 |
| 6 — Theoretical payouts | Payout view, per-placement display | 🔶 Code complete + tested locally Jul 18, 2026 (`placement_payouts_view` proven on local PG16, My Bets per-pick payouts + rollup, `/admin/view` View-sheet replica) — prod SQL applied Jul 18, 2026 (#34); browser verify pending | 7 | Aug 21 |
| 7 — Final payouts | Pari-mutuel split (void-adjusted pool), `/results` | 🔶 Code complete + tested locally Jul 18, 2026 (`lib/payouts.ts` split, `/results` gated on `completed`, 2026 worked example + void case unit-tested) — view + chain applied Jul 18, 2026 (#34); prod verify pending, incl. flipping `tournament.status` at tournament end | 7 | Aug 21 |
| 8 — Leaderboard | Google Sheets mirror | 🔶 Code complete + tested locally Jul 21, 2026 (`lib/leaderboard.ts` read-only Sheets fetch of the "Sportsbook Leaderboard" tab, `parseLeaderboard`/`formatToPar` unit-tested, 5-min `unstable_cache`; `/leaderboard` 8-column table, always-visible nav tab, middleware guard) — manual Google Cloud service account + Vercel env vars pending, then the "within 5 min" prod check | 8 | Aug 28 |
| 9 — Polish & dry run | Mobile pass, group test | 🔲 Not started | 9 | Sep 10 |
| Testing & simulation | E2E browser journeys, DB round-trips in CI, full-pool synthetic seed | 🔲 Planned Jul 24, 2026 (de-risks the Sprint 9 dry run; automates the pending browser-verify issues) | 19 | before Aug 28 |
| ★ Bonus wish list | Admin roster · bet-state snapshots · animation & Jake celebration · funny ads · announcement banner · self-serve profile page · first-run onboarding + bettor-approval · bet-slip review & confirmation · player profile modals | 🔶 Sprint 15 (profile page) code complete Jul 19, 2026; Sprint 16 (onboarding + bettor-approval) code complete Jul 20, 2026; Sprint 18 (player profile modals) code complete Jul 23, 2026; rest not started (never blocks MVP) | 10–18 | as time allows, before Aug 28 |

---

## Completed Work (Phases 0–3)

Shipped May 7, 2026 (see git history and `docs/superpowers/` for the design specs and plans):

- **Phase 0:** Next.js 15 (App Router) + Tailwind + shadcn/ui skeleton; header; landing page; `/dashboard` and `/bets` routes.
- **Phase 1:** Magic-link login (`/login`, auth callback, signout), session middleware with route protection, `public.users` table + new-user trigger + RLS (`supabase/migrations/20260507000000_users_table.sql`).
- **Phase 2:** `tournaments` + `tournament_participants` tables with RLS and the 2026 seed row (`20260507000001_tournaments.sql`); `/dashboard` showing tournament + registration status.
- **Phase 3:** `bet_categories` / `bets` / `bet_subjects` tables with RLS and the seven-category seed (`20260507000002_bets.sql`); `/bets` menu grouped by round → category with American/fractional/implied odds (`lib/odds.ts`). **⚠️ Superseded in part by ADR 0001** (July 15): the one-odds-per-bet schema, `bet_subjects`, the seven categories, and the computed odds display are all replaced by the bet/pick structure — Sprint 1 reworks this. Auth, tournaments, and the page scaffolding carry forward untouched.

**Phases 0–2 are now verified in production** (Jul 16, 2026) — infra was rebuilt under Andrew's own Vercel + Supabase accounts, taking ownership back from the fork. Production: **https://ozark-open-sportsbook.vercel.app** (custom domain **`ozark-open.com`** registered via Vercel; also the auth email sending domain — see issue #16). Phase 3 remains ⚠️ rework-required regardless (Sprint 1). See `sprints/sprint-0.md` for the infra facts and the env-var gotcha.

---

## What Is Explicitly Not on the Roadmap

- A custom admin UI beyond `/admin/import` and the read-only `/admin/view` View-sheet replica (Sprint 7) — Studio is the admin UI for everything else (ADR 0001 §7). *(One bonus exception on the wish list: the read-only `/admin/roster` page, Sprint 10.)*
- A bet resolution engine (results are computed in the admin's workbook and uploaded — ADR 0001 §3).
- Notifications, email digests, or push notifications (out of scope for v1).
- A mobile app (it's a mobile-responsive web app — no native build).
- Public access, marketing pages, SEO (private app, behind login).
- Multi-tenancy (this is one pool for one group; it does not need to support multiple unrelated leagues).
- Payment processing (Venmo and cash, out of band, as today).
- Career P/L across tournaments (v2).

If a feature isn't here, default to "no" until someone makes the case for it.
