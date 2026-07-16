# Roadmap & Sprint Tracker

The phased build plan **and** the live status tracker. Phases describe *what* gets built; sprints are the numbered, sitting-sized units of work we execute one at a time. Update the checkboxes and the status column here as work lands — this file is the single source of truth for "where are we?"

> **Re-planned July 15, 2026** around Pat & Jake's new betting architecture (`docs/adr/0001-bet-pick-architecture.md`): bets now have picks, betting windows are phases, results arrive per pick from the admin's spreadsheet, and the menu is published via upload. The old Sprints 1–6 were renumbered and re-cut; two new sprints (schema rework, ingestion) were inserted up front.

---

## Timeline

- **Tournament:** September 24–27, 2026
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
| Sept 24–27 | 🏌️ Ozark Open |

---

## Status Summary

| Phase | What | Status | Sprint(s) | Target |
|---|---|---|---|---|
| 0 — Foundations | Skeleton, deploy pipeline | ✅ Code complete (May 7) — deploy unverified | 0 | Jul 18 |
| 1 — Auth | Magic-link login, users table | ✅ Code complete (May 7) — prod unverified | 0 | Jul 18 |
| 2 — Tournament setup | Tournaments, participants, dashboard | ✅ Code complete (May 7) — prod unverified | 0 | Jul 18 |
| 3 — Bet menu | Bets **and picks**, `/bets` page | ⚠️ Built May 7 on the pre-ADR-0001 schema — **rework required** | 1 | Jul 24 |
| 3b — Spreadsheet ingestion | `/admin/import` upload pipeline | 🔲 Not started (new scope, ADR 0001 §7) | 2 | Jul 31 |
| 4 — Placing bets | Placements, validation, My Bets | 🔲 Not started | 3, 4, 5 | Aug 12 |
| 5 — Results | Closed-bet views, per-pick results via re-upload | 🔲 Not started | 6 | Aug 16 |
| 6 — Theoretical payouts | Payout view, per-placement display | 🔲 Not started | 7 | Aug 21 |
| 7 — Final payouts | Pari-mutuel split (void-adjusted pool), `/results` | 🔲 Not started | 7 | Aug 21 |
| 8 — Leaderboard | Google Sheets mirror | 🔲 Not started | 8 | Aug 28 |
| 9 — Polish & dry run | Mobile pass, group test | 🔲 Not started | 9 | Sep 10 |

**Legend:** ✅ complete · 🔶 in progress · 🔲 not started · ⚠️ needs rework

---

## Completed Work (Phases 0–3)

Shipped May 7, 2026 (see git history and `docs/superpowers/` for the design specs and plans):

- **Phase 0:** Next.js 15 (App Router) + Tailwind + shadcn/ui skeleton; header; landing page; `/dashboard` and `/bets` routes.
- **Phase 1:** Magic-link login (`/login`, auth callback, signout), session middleware with route protection, `public.users` table + new-user trigger + RLS (`supabase/migrations/20260507000000_users_table.sql`).
- **Phase 2:** `tournaments` + `tournament_participants` tables with RLS and the 2026 seed row (`20260507000001_tournaments.sql`); `/dashboard` showing tournament + registration status.
- **Phase 3:** `bet_categories` / `bets` / `bet_subjects` tables with RLS and the seven-category seed (`20260507000002_bets.sql`); `/bets` menu grouped by round → category with American/fractional/implied odds (`lib/odds.ts`). **⚠️ Superseded in part by ADR 0001** (July 15): the one-odds-per-bet schema, `bet_subjects`, the seven categories, and the computed odds display are all replaced by the bet/pick structure — Sprint 1 reworks this. Auth, tournaments, and the page scaffolding carry forward untouched.

**"Code complete" is not "done"** — none of this is verified against a production deployment. That's Sprint 0.

---

## Sprint Backlog

One sprint = one sitting. Don't start a sprint while its blockers are open. Check boxes as tasks land; move the phase row in the Status Summary when a sprint's "done when" passes.

---

### Sprint 0 — Deploy & Verify Foundations 🔲

**Goal:** everything already coded is provably working in production.
**Target:** week of Jul 13 · **Blockers:** none — do this first.

- [ ] Confirm the Vercel project exists, is connected to the repo, and auto-deploys `main`; create it if not.
- [ ] Confirm the production Supabase project exists and **is not paused** (free tier pauses after ~1 week idle); apply all three migrations (`npx supabase db push` or SQL editor).
- [ ] Set env vars in Vercel (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- [ ] **Configure custom SMTP (Resend free tier) for Supabase Auth emails.** The built-in email service is dev-only and rate-limited to a few messages/hour — it will drop magic links on tournament morning.
- [ ] Extend session/JWT duration in Supabase Auth settings so a login during dry-run week survives through Sept 27.
- [ ] Decide: upgrade to Supabase Pro ($25) for September (backups + no pausing), or accept manual mitigation.
- [ ] Ask Steve to enable Issues on `riversteve/ozark-open` (Settings → General → Features → Issues; disabled by default on forks) — the sprint workflow logs bugs and manual steps there.
- [ ] Log in via magic link on a phone (real-world email deliverability check through Resend).
- [ ] Promote Andrew, Pat, Jake, Steve to `is_admin = true` in Studio.
- [ ] Fix the four admins' `display_name` values in Studio (they default to email addresses) — admin-set per PRD §12 Q13. **Also enter proper display names for the players named in the sample sheet** — Sprint 1's seed and Sprint 2's name-matching key off `users.display_name`.
- [ ] Confirm `/bets` and `/dashboard` render on prod (empty menu is fine — the bet schema gets reworked in Sprint 1; don't seed old-shape sample bets).
- [x] ~~Send PRD §12 questions to Pat and Jake~~ — **answered by Jake, July 9, 2026**; decisions logged in PRD §12.

**Done when:** any admin can log in on their phone at the production URL and see the dashboard.

---

### Sprint 1 — Bet/Pick Schema Rework & Menu Rebuild (Phase 3 rework) 🔲

**Goal:** the database and `/bets` page match ADR 0001 — bets have picks, and the menu renders the sample sheet's Phase 1 faithfully.
**Reads:** PRD §6, §8 · `DATA_MODEL.md` §3.4–3.6 · ADR 0001.
**Target:** ~Jul 24 · **Blockers:** Sprint 0.

- [ ] Migration (clean rebuild — no production bet data exists): rework `bets` to the new shape (`sheet_bet_id`, `title`, `phase`, `round`, `status` hidden/open/closed, `total_probability`; drop `american_odds`/`outcome`/`bet_number`); create `bet_picks` per DATA_MODEL §3.6; drop `bet_subjects`; re-seed `bet_categories` with the five categories (`allows_multiple_picks` flags); rename `tournaments.min/max_bets_per_round` → `min/max_picks_per_phase`; drop the hardcoded `entry_fee BETWEEN 20 AND 50` CHECK (keep `> 0`); RLS per DATA_MODEL §5 (picks readable when parent bet not hidden).
- [ ] Rebuild `/bets`: group **phase → round → category**, bet cards showing title + `total_probability`, pick rows showing label / american / fractional / probability **verbatim from the DB** (sheet-supplied — delete the `lib/odds.ts` display converters); `hidden` bets excluded; pick result badge rendered **only when result ≠ `pending`**.
- [ ] Hand-seed the Phase 1 menu from `docs/import/bets-sample.xlsx` (SQL insert or Studio; the automated importer is Sprint 2) and link picks to the seeded users' `player_user_id` where names match.
- [ ] `npm run build` + verify on prod.

**Done when:** the sample sheet's Phase 1 (13 bets, 57 picks) renders on `/bets` in production, grouped phase → round → category, with odds displayed exactly as the sheet formats them.

---

### Sprint 2 — Spreadsheet Ingestion (`/admin/import`) 🔲

**Goal:** admins publish and update the entire menu — bets, picks, odds, statuses, results — by uploading the spreadsheet. The one custom admin page (ADR 0001 §7).
**Reads:** PRD §8.2 · DATA_MODEL §3.5–3.6 · ADR 0001 §§7–8, 11.
**Target:** ~Jul 31 · **Blockers:** Sprint 1.

- [ ] `/admin/import` page + API route, gated on `is_admin`; accepts `.xlsx` and `.csv`.
- [ ] Parser + column-contract validation (the 13 PRD §8.2 columns; helper columns ignored; unsorted rows fine; enum values checked for `status`/`round`/`category`/`result`; duplicate `bet_id`/`pick_id` detection). A file with contract errors is rejected whole — no partial imports.
- [ ] Upsert: bets keyed on (`tournament_id`, `sheet_bet_id`), picks on (`bet_id`, `sheet_pick_id`). Uploads never touch `bet_placements`.
- [ ] Pick→player name-matching: strip stroke suffixes (`(E)`, `(-5)`), match against `users.display_name`, set `player_user_id`; leave NULL when unmatched.
- [ ] Import report: bets/picks created vs. updated, unmatched pick names, and a warning when a pick's odds changed while it has live placements (wire fully once placements exist in Sprint 3; harmless per PRD §7.1 but the admin should know).
- [ ] Round-trip test: upload `bets-sample.xlsx` → DB matches the sheet; upload it again → report shows zero changes (idempotent).

**Done when:** an admin uploads the sample sheet twice from the browser — first upload creates the full menu, second reports no changes — and `/bets` reflects it without a redeploy.

---

### Sprint 3 — Placements Schema & Validation (Phase 4a) 🔲

**Goal:** the `bet_placements` table exists with correct RLS, and every §7 rule is encoded server-side.
**Reads:** PRD §7, §8.1 · DATA_MODEL §3.7.
**Target:** early Aug · **Blockers:** Sprint 1 (schema); do after Sprint 2 so testing has real menu data.

- [ ] Migration: `bet_placements` per DATA_MODEL §3.7 — `pick_id` FK, `odds_at_placement int NOT NULL` (snapshot of the **pick's** odds — PRD §7.1), `requires_admin_review boolean NOT NULL DEFAULT false`, `deleted_at timestamptz` (soft delete), UNIQUE (`user_id`, `pick_id`).
- [ ] RLS: users insert/update/soft-delete own rows while the parent bet is `open`; others' placements visible only once the bet is `closed`; admins read all; all reads filter `deleted_at IS NULL`.
- [ ] `lib/validation.ts`: pure functions for every rule in PRD §7 + §8.1, parameterized by the `tournaments` row (no hardcoded limits): whole dollars ≥ $1; single-bet cap per placement; 5–10 **pick-placements per phase** (each wagered pick counts); running total across both phases ≤ entry fee (exact-equal checked at Phase 2 close); self-pick cap across the tournament; **one pick per Match/Group Match** (`allows_multiple_picks`); **opponent hard-block** (bettor is a `player_user_id` in the bet but places on a different pick).
- [ ] Unit-test the validation functions against the worked examples in PRD §5/§7 ($40-entry and $20-entry cases, multi-pick counting, opponent rejection).

**Done when:** validation tests pass and the migration applies cleanly to prod.

---

### Sprint 4 — Placement API & Place-Bet UI (Phase 4b) 🔲

**Goal:** a participant can place, edit, and remove a wager on a pick from the menu.
**Target:** early–mid Aug · **Blockers:** Sprint 3.

- [ ] `app/api/placements/route.ts`: POST/PATCH/DELETE, calling `lib/validation.ts` before any write; reject non-participants and non-`open` bets. Every write snapshots the pick's current odds into `odds_at_placement`; DELETE sets `deleted_at` (soft delete; re-placing revives the row).
- [ ] Self-pick flagging on write: pick's `player_user_id` = bettor → `requires_admin_review = true`.
- [ ] Inline amount input per **pick** on `/bets` for each `open` bet (own placement pre-filled if it exists); single-pick categories switch to pick-one affordance.
- [ ] Clear error surface: rule violations come back as human-readable messages ("Max single bet is $20 for your $40 entry", "You can't bet against yourself in a match").
- [ ] Finish the Sprint 2 import-report warning: odds changed on picks with live placements.

**Done when:** a participant can complete a legal placement end-to-end on the phone, and every §7 violation is rejected with a readable message.

---

### Sprint 5 — My Bets & Phase Compliance (Phase 4c) 🔲

**Goal:** participants always know where they stand against the rules; admins can spot stragglers.
**Target:** ~Aug 12 · **Blockers:** Sprint 4.

- [ ] "My Bets" view: current placements grouped by phase (bet title + pick + amount + snapshotted odds), running total, remaining budget.
- [ ] Personalized rules card: "Your entry: $40 · max single bet: $20 · max on yourself: $10 · 3 of 5 minimum picks this phase" — computed from the `tournaments` row; kills the questions Pat gets by text today.
- [ ] Pool total on the dashboard (sum of participant entry fees).
- [ ] Compliance banner per PRD §8.1: "incomplete" warning while under the 5-pick minimum or off the exact total ("Phase 2 must bring you to exactly $40").
- [ ] Admin compliance view (simple page or documented Studio SQL snippet): who is non-compliant per phase, so admins can chase before closing (Q3 — after the chase, whatever stands, stands).

**Done when:** the full Phase 4 definition-of-done holds — a participant can complete a betting phase without breaking any §7 rule, and knows it.

---

### Sprint 6 — Results & Closed-Bet Views (Phase 5) 🔲

**Goal:** closing a phase and uploading results is a non-event for Pat, and the app tells the story.
**Reads:** PRD §8 (itinerary, gating) · ADR 0001 §§5–6.
**Target:** ~Aug 16 · **Blockers:** Sprints 2 + 4.

- [ ] When a bet is `closed`: placement inputs disappear; **everyone's placements** render on the bet — who took which pick, for how much (PRD §12 Q11/Q12; the social heart of the pool).
- [ ] Per-pick result badges with color coding, shown **only when result ≠ `pending`**; a bet whose picks are all resolved reads visually as settled ("resolved" is derived — never stored).
- [ ] Rewrite the README admin runbook around the two-track workflow: spreadsheet upload for bets/statuses/results (close a phase = flip `status` in the sheet and re-upload; enter results = fill `result` and re-upload) + Studio for users/participants/fixes, with screenshots.
- [ ] Walk Pat through one simulated Thursday night: close Phase 1 via upload, then upload results, unaided.

**Done when:** Pat takes a fake day-1 result sheet, re-uploads it in a few minutes unaided, and the app shows every pick's result and everyone's wagers on reload.

---

### Sprint 7 — Payouts: Theoretical & Final (Phases 6 + 7) 🔲

**Goal:** per-placement, per-user, and final pari-mutuel numbers that match what Pat would compute by hand.
**Reads:** PRD §5 · DATA_MODEL §4 · ADR 0001 §9.
**Target:** ~Aug 21 · **Blockers:** Sprint 6. *(Q5 resolved: display cents. Q6-as-amended: push returns stake in the math; void leaves the pool.)*

- [ ] Migration: `placement_payouts_view` per DATA_MODEL §4 — computes from `odds_at_placement` + `bet_picks.result`, excludes soft-deleted rows, surfaces `refunded_stake` for voids.
- [ ] "My Bets": theoretical payout per resolved placement + "Total theoretical payout" summary (pushes count, voids show as refunded).
- [ ] Admin "view all" page: everyone's placements and payouts in one table, including still-open phases and self-pick review flags (replicates the spreadsheet's `View` sheet).
- [ ] `lib/payouts.ts`: pool = sum(entry fees) − sum(refunded voided stakes); share = `user_theoretical / sum_all × pool`.
- [ ] `/results` page: name, entry fee, theoretical payout, actual payout, profit/loss — visible only when `tournament.status = 'completed'`; amounts to the cent (Q5).
- [ ] Cross-check the 2026 worked example: pool $520 (no voids), sum $279.57, Jake Kohne $21.87 → $40.67. Add a void case and verify the pool shrinks by exactly the voided stakes.

**Done when:** the numbers match Pat's hand-math for any user, including the void case.

---

### Sprint 8 — Leaderboard Mirror (Phase 8) 🔲

**Goal:** live standings from the scoring workbook, read-only.
**Target:** late August (feature freeze Aug 28) · **Blockers:** Pat creating the Sheets mirror. *(Q15 resolved: one "Leaderboard" tab — player, thru, score, position — updated after each day.)*

- [ ] Pat mirrors the workbook to a Google Sheet with the agreed "Leaderboard" tab (his task; format settled in PRD §12 Q15).
- [ ] Google Cloud service account with read-only Sheet access; creds in Vercel env vars.
- [ ] `/leaderboard` page: fetch via Sheets API, cache 5 minutes, render the table.

**Done when:** standings appear in the app within 5 minutes of Pat editing the workbook.

---

### Sprint 9 — Polish & Group Dry Run (Phase 9) 🔲

**Goal:** tournament-ready. Everything after this is reactive.
**Target:** Sept 1–10 (hard stop) · **Blockers:** Sprints 0–7 (8 is nice-to-have for the dry run).

- [ ] Mobile pass on every page — the tournament happens on phones.
- [ ] **Group dry run:** recruit 5+ real participants and run the full cycle end to end — upload Phase 1 → place picks → close via re-upload → upload results → open Phase 2 via re-upload → final payouts.
- [ ] Fix everything the dry run surfaces.
- [ ] Pre-tournament checklist doc: what admins do the week of, day before, and each morning/night of the tournament (the PRD §8 itinerary as a checklist — including the four uploads). Must include: verify the Supabase project is awake, verify magic-link email works end-to-end, and run a DB export.
- [ ] Data safety: CSV/`pg_dump` export **before Phase 1 opens** and **after final payouts** — free tier has no automated backups and this is money data.
- [ ] Optional stretch (only if time): bet aggregate stats after close ("$48 wagered on Dan Mercer to win").

**Done when:** the dry run completes without an admin needing to touch code or ask Andrew a question.

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
