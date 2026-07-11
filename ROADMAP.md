# Roadmap & Sprint Tracker

The phased build plan **and** the live status tracker. Phases describe *what* gets built (unchanged in scope from v1 of this doc); sprints are the numbered, sitting-sized units of work we execute one at a time. Update the checkboxes and the status column here as work lands — this file is the single source of truth for "where are we?"

---

## Timeline

- **Tournament:** September 24–26, 2026 (Day 1 Thu · Day 2 Fri scramble · Day 3 Sat)
- **Fully wrapped:** September 10, 2026 at the latest (two weeks before tee-off)
- **Feature freeze:** ~August 28, 2026 — after this, only bugs, polish, and dry-run fixes
- Coding is Claude-Code-assisted, so build time per sprint is short. The pacing constraints are **stakeholder answers (PRD §12), deploy verification, and human testing** — not code. *(Pat's Jul 2026 review revised several §12 answers and opened a few items — see `OUTSTANDING_DECISIONS.md`.)*

| Window | Work |
|---|---|
| Week of Jul 13 | Sprint 0 (deploy & verify) — stakeholder answers already in hand (Jul 9, PRD §12) |
| Before Sprint 1 | 🔺 **Spike A** — bet-taxonomy design meeting + non-player max decision (gates the bet-model refactor and validation) |
| Mid–late July | Sprints 1–3 (bet placement, the heart of the app) |
| Before Sprint 5 | 🔺 **Spike B** — confirm void → pool math (gates payouts) |
| Early–mid August | Sprints 4–6 (outcomes, payouts, results) |
| Late August | Sprint 7 (outcome-data import) → **feature freeze Aug 28** |
| Sept 1–10 | Sprint 8 (mobile pass, group dry run, fixes) |
| Sept 24–26 | 🏌️ Ozark Open |

---

## Status Summary

| Phase | What | Status | Sprint(s) | Target |
|---|---|---|---|---|
| 0 — Foundations | Skeleton, deploy pipeline | ✅ Code complete (May 7) — deploy unverified | 0 | Jul 18 |
| 1 — Auth | Magic-link login, users table | ✅ Code complete (May 7) — prod unverified · ⚠️ **refactor:** display-name handling (user-set once + locked, admin-editable) revisits the new-user trigger — Sprint 2 | 0, 2 | Jul 18 |
| 2 — Tournament setup | Tournaments, participants, dashboard | ✅ Code complete (May 7) — prod unverified · ⚠️ **refactor:** rename `*_bets_per_round` cols + add `betting_enabled` (schema shipped in `20260507000001`) — Sprint 1 | 0, 1 | Jul 18 |
| 3 — Bet menu | Categories, bets, `/bets` page | ✅ Code complete (May 7) — prod unverified · ⚠️ **refactor likely** pending 🔺 Spike A (category/subcategory/`group_id` taxonomy), round-mapping/naming change, and ~70–100-bets/round scaling | 0, A | Jul 18 |
| 4 — Placing bets | Placements, validation, My Bets | 🔲 Not started | A, 1, 2, 3 | Jul 31 |
| 5 — Outcomes | Closed/resolved UX, Studio workflow | 🔲 Not started (outcome badges already render on `/bets`) | 4 | Aug 7 |
| 6 — Theoretical payouts | Payout view, per-bet display | 🔲 Not started | B, 5 | Aug 14 |
| 7 — Final payouts | Pari-mutuel split, `/results` | 🔲 Not started | B, 6 | Aug 21 |
| 8 — Outcome import | Sheets outcome feed + manual entry (no participant leaderboard) | 🔲 Not started | 7 | Aug 28 |
| 9 — Polish & dry run | Mobile pass, group test | 🔲 Not started | 8 | Sep 10 |

**Legend:** ✅ complete · 🔶 in progress · 🔲 not started · ⚠️ needs refactor/rework (requirements changed or pending a decision) · 🔺 spike (a decision/meeting, not a build sprint)

---

## Completed Work (Phases 0–3)

Shipped May 7, 2026 (see git history and `docs/superpowers/` for the design specs and plans):

- **Phase 0:** Next.js 15 (App Router) + Tailwind + shadcn/ui skeleton; header; landing page; `/dashboard` and `/bets` routes.
- **Phase 1:** Magic-link login (`/login`, auth callback, signout), session middleware with route protection, `public.users` table + new-user trigger + RLS (`supabase/migrations/20260507000000_users_table.sql`).
- **Phase 2:** `tournaments` + `tournament_participants` tables with RLS and the 2026 seed row (`20260507000001_tournaments.sql`); `/dashboard` showing tournament + registration status.
- **Phase 3:** `bet_categories` / `bets` / `bet_subjects` tables with RLS and the seven-category seed (`20260507000002_bets.sql`); `/bets` menu grouped by round → category with American/fractional/implied odds (`lib/odds.ts`).

**"Code complete" is not "done"** — none of this is verified against a production deployment. That's Sprint 0.

**⚠️ Refactor flags from Pat's Jul 2026 review** — some shipped work needs rework as requirements firmed up:
- **Phase 1 (Auth):** display names are now user-set at registration and then immutable by the user (admins can edit). The new-user trigger currently just copies the email — the capture flow + lock land in Sprint 2 (Q13).
- **Phase 2 (Tournament setup):** the shipped `tournaments`/`tournament_participants` schema needs a migration to rename `min_bets_per_round`/`max_bets_per_round` (they're per-tournament now, not per-round — Q2) and add `betting_enabled` (Q14). Handled in Sprint 1.
- **Phase 3 (Bet menu):** most exposed. Pending 🔺 **Spike A**, the bet taxonomy may move to category/subcategory/`group_id` (PRD §6.1), which would re-migrate `bets`/`bet_categories`; the round mapping/naming changed (Day 1 → R1, Day 3 → R2; Day 2 excluded — Q9); and `/bets` must scale to ~70–100 bets/round (Q8). Don't treat Phase 3 as frozen until the meeting.

---

## Sprint Backlog

One sprint = one sitting. Don't start a sprint while its blockers are open. Check boxes as tasks land; move the phase row in the Status Summary when a sprint's "done when" passes.

> **🔺 Spikes are decisions, not build sprints.** They have letters (A, B), not numbers, and no code deliverable — they exist because a stakeholder decision or live meeting is a hard dependency for downstream work. Resolve a spike before starting anything it blocks. Both current spikes trace to Pat's Jul 2026 review (`OUTSTANDING_DECISIONS.md`).

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
- [ ] Fix the four admins' `display_name` values in Studio (they currently default to email addresses) so they match the official roster — display names are user-set going forward, but admins can always correct them (PRD §12 Q13).
- [ ] Seed 3–5 sample bets in Studio; confirm they render on `/bets` grouped correctly.
- [x] ~~Send PRD §12 questions to Pat and Jake~~ — **answered by Jake (Jul 9) and revised by Pat (Jul 2026)**; decisions logged in PRD §12, open items in `OUTSTANDING_DECISIONS.md`.

**Done when:** any admin can log in on their phone at the production URL and see the dashboard and sample bet menu.

---

### 🔺 Spike A — Bet Taxonomy Design Meeting + Non-Player Max (decision, not a sprint)

**Type:** live Pat/Jake meeting + decisions · **Owners:** Pat + Jake · **Target:** before Sprint 1.
**Gates:** the Phase 3 bet-model refactor; the subcategory **selection-rule** validation in Sprint 1–2; and the non-player betting-max path in Sprint 1. *(Sprint 1's core placements table + budget/cap rules do **not** depend on this and can proceed; the selection rules and non-player max do.)*

- [ ] Finalize the category / subcategory / `group_id` taxonomy proposed in PRD §6.1, and reconcile the round naming ("betting Round 2" vs golf "Round 3"). → closes `OUTSTANDING_DECISIONS.md` #1.
- [ ] Lock the per-subcategory selection rules (Winner/Top-X allow multiple picks; head-to-heads one player; one prop per group).
- [ ] Set the **stricter non-playing-bettor max** (flat amount? lower single/self caps? per-tournament param vs per-participant override). → closes #2.
- [ ] Brainstorm the actual 2026 bet menu (the current seven categories are a dev-time sample).

**Resolves when:** PRD §6.1 is promoted from "proposed" to decided, `OUTSTANDING_DECISIONS.md` #1–#2 are closed, and — if the taxonomy changed — a Phase 3 refactor migration is scheduled ahead of the work that depends on it.

---

### Sprint 1 — Placements Schema & Validation (Phase 4a) 🔲

**Goal:** the `bet_placements` table exists with correct RLS, and every §7 rule is encoded server-side.
**Target:** mid July · **Blockers:** Sprint 0 (fully); 🔺 Spike A (for the subcategory selection-rule validation and the non-player max value — the rest can start without it). *(Q1–Q4 per PRD §12, revised by Pat: entry fee spans both rounds combined; the **5–10 bet count also spans both rounds combined**, not per round; participant chooses the split; single-bet cap per placement; self-bet cap per tournament.)*

- [ ] Migration: `bet_placements` per `DATA_MODEL.md` §3.7, including `requires_admin_review boolean NOT NULL DEFAULT false`, `odds_at_placement int NOT NULL` (odds snapshot — PRD §7.1), and `deleted_at timestamptz` (soft delete — placements are never hard-deleted).
- [ ] Same migration: add CHECK constraint on `bets`: `(status = 'resolved') = (outcome IS NOT NULL)` — makes the two Studio fat-fingers impossible (PRD §8).
- [ ] Same migration: drop the hardcoded `entry_fee BETWEEN 20 AND 50` CHECK on `tournament_participants` (keep `> 0`); bounds move to validation per the rules-are-data convention.
- [ ] Same migration: **rename `tournaments.min_bets_per_round` / `max_bets_per_round` → `min_bets_per_tournament` / `max_bets_per_tournament`** — the 5–10 count now spans both rounds combined (Q2), so the old names are misleading.
- [ ] Same migration: add **`tournament_participants.betting_enabled boolean NOT NULL DEFAULT true`** (admin enable/disable betting for any user — Q14).
- [ ] RLS: users insert/update/soft-delete own rows while the bet is `open`; others' placements visible only once the bet is `closed`/`resolved`; admins read all; all reads filter `deleted_at IS NULL`.
- [ ] `lib/validation.ts`: pure functions for every rule in PRD §7 + §8.1, parameterized by the `tournaments` row (no hardcoded limits). Payout-relevant reads use `odds_at_placement`, not `bets.american_odds`. Budget math per PRD §12: wager total across **both rounds** ≤ entry fee (exact-equal checked at Round 2 close); **5–10 bet count across the tournament**; self-bet cap totals across the tournament; single-bet cap per placement; reject writes when `betting_enabled = false`. Non-player stricter max is stubbed pending its value (`OUTSTANDING_DECISIONS.md` #2).
- [ ] Unit-test the validation functions against the worked examples in PRD §5/§7 (including the $40-entry and $20-entry examples, and a $0-in-one-round split).

**Done when:** validation tests pass and the migration applies cleanly to prod.

---

### Sprint 2 — Placement API & Place-Bet UI (Phase 4b) 🔲

**Goal:** a participant can place, edit, and remove a bet from the menu.
**Target:** mid–late July · **Blockers:** Sprint 1. *(Q10/Q11 resolved: field bets display like any bet; aggregate money hidden while open.)*

- [ ] `app/api/placements/route.ts`: POST/PATCH/DELETE, calling `lib/validation.ts` before any write; reject non-participants and closed bets. Every write snapshots the bet's current odds into `odds_at_placement`; DELETE sets `deleted_at` (soft delete).
- [ ] Self-bet flagging: on write, if the user is in `bet_subjects` for the bet, set `requires_admin_review = true`.
- [ ] Inline amount input on `/bets` for each `open` bet (participant's own placement shown pre-filled if it exists). The menu must stay usable at **~70–100 bets per round** (Q8) — keep the round → category grouping tight; no pagination needed at this scale.
- [ ] **Display-name capture on first login:** prompt a new user for their display name once, then lock it (users can't edit it later; admins can — Q13). Until entered it falls back to email.
- [ ] Clear error surface: rule violations come back as human-readable messages ("Max single bet is $20 for your $40 entry").

**Done when:** a participant can complete a legal placement end-to-end on the phone, and every §7 violation is rejected with a readable message.

---

### Sprint 3 — My Bets & Round Compliance (Phase 4c) 🔲

**Goal:** participants always know where they stand against the rules; admins can spot stragglers.
**Target:** late July · **Blockers:** Sprint 2. *(Q3/Q12 resolved: non-compliant bets stand as-is after the chase; full amounts visible after close.)*

- [ ] "My Bets" view: current placements grouped by round, running total, remaining budget.
- [ ] Personalized rules card: "Your entry: $40 · max single bet: $20 · max on yourself: $10 · 3 of 5 minimum bets placed (across the tournament)" — computed from the `tournaments` row, kills the questions Pat gets by text today.
- [ ] Pool total on the dashboard (sum of participant entry fees).
- [ ] Compliance banner per PRD §8.1: "incomplete" warning while under the 5-bet minimum (**counted across both rounds**) or off the exact total. The user can **always save the slip regardless**, and the warning **clears automatically once compliant** (Q3, Pat).
- [ ] Admin compliance view (can be a simple page or a Studio SQL snippet documented in README): who is non-compliant per round, so admins can chase before closing (Q3 — after the chase, whatever stands, stands).
- [ ] Other participants' placements become visible on bet close, including individual amounts (Q12).

**Done when:** the full Phase 4 definition-of-done holds — a participant can complete a betting round without breaking any of the seven memo rules, and knows it.

---

### Sprint 4 — Outcomes Workflow (Phase 5) 🔲

**Goal:** Pat can mark outcomes in Studio and the app reflects them correctly.
**Target:** early August · **Blockers:** Sprint 3.

- [ ] When `bet.status = 'closed'`: hide the placement input, show placements read-only.
- [ ] When `bet.status = 'resolved'`: outcome badge prominent with color coding (already partially rendering on `/bets` — verify and polish).
- [ ] Expand README "Updating Bets and Outcomes" into the full Studio runbook (status transitions, outcome entry, self-bet review queue via `requires_admin_review`), with screenshots.
- [ ] Walk Pat through one simulated day-1 outcome entry.

**Done when:** Pat takes a fake day-1 result sheet, marks outcomes in Studio in a few minutes unaided, and the app shows them on reload.

---

### 🔺 Spike B — Confirm Void → Pool Math (decision, not a sprint)

**Type:** decision (money-critical) · **Owner:** Pat · **Target:** before Sprint 5.
**Gates:** the `placement_payouts_view` void handling (Sprint 5) and the pool-split math in `lib/payouts.ts` (Sprint 6).

- [ ] Confirm a voided bet's stake is **refunded to the bettor and removed from `pool_total`** (`pool_total = Σ(entry_fee) − Σ(void refunds)`), so voided dollars earn no proportional share and don't inflate the denominator (PRD §5, DATA_MODEL §4). → closes `OUTSTANDING_DECISIONS.md` #3.

**Resolves when:** the void handling in DATA_MODEL §4 is signed off, so Sprint 5/6 build the view + split against a confirmed formula rather than an inferred one.

---

### Sprint 5 — Theoretical Payouts (Phase 6) 🔲

**Goal:** per-bet and total theoretical payouts, matching what Pat would compute by hand.
**Target:** early–mid August · **Blockers:** Sprint 4; 🔺 Spike B (the void→pool formula the view encodes). *(Q6/Q7 revised by Pat: a **push** counts and returns its stake; a **void** does NOT count — its stake is refunded and removed from the pool. No adjustment when voids drop someone below the minimum.)*

- [ ] Migration: `placement_payouts_view` as defined in `DATA_MODEL.md` §4 — computes from `odds_at_placement` (not `bets.american_odds`), excludes soft-deleted rows, gives a **push** its stake, and returns a **void** as `theoretical_payout = 0` with a `refund` column carrying the stake.
- [ ] "My Bets": theoretical payout column per resolved placement + "Total theoretical payout" summary.
- [ ] **Participant-facing "All Bets" page:** everyone's placements on closed/resolved bets — who bet what, for how much, and how it's going. This is the social heart of the pool (PRD §9); distinct from the admin view below.
- [ ] Admin "view all" page: everyone's placements and payouts in one table, including still-open rounds and self-bet review flags (replicates the spreadsheet's `View` sheet).
- [ ] Cross-check: reproduce Jake Kohne's $21.87 from the 2026 spreadsheet example (PRD §5).

**Done when:** the numbers match Pat's hand-math for any user.

---

### Sprint 6 — Final Pari-Mutuel Payouts (Phase 7) 🔲

**Goal:** final actual-payout shares computed and displayed.
**Target:** mid August · **Blockers:** Sprint 5; 🔺 Spike B (the `pool_total = Σ(entry_fee) − Σ(refunds)` formula). *(Q5 revised by Pat: app rounds payouts to the nearest cent; Venmo paid exactly to the cent.)*

- [ ] `lib/payouts.ts`: sum theoreticals, compute each share = `participant_total / sum_all × pool_total`, where **`pool_total = Σ(entry_fee) − Σ(void refunds)`** (voided dollars leave the pool — Q6); refund each void's stake to its bettor on top of their share. *(Confirm the void→pool math before building — `OUTSTANDING_DECISIONS.md` #3.)*
- [ ] `/results` page: name, entry fee, theoretical payout, actual payout, profit/loss — visible only when `tournament.status = 'completed'`.
- [ ] Amounts **rounded to the nearest cent** in the app (Q5); Venmo is paid exactly to the cent.
- [ ] Cross-check the full 2026 worked example (no voids): pool $520, sum $279.57, Jake $21.87 → $40.67.

**Done when:** final numbers match the spreadsheet's `View` sheet within rounding error.

---

### Sprint 7 — Outcome-Data Import (Phase 8) 🔲

**Goal:** get bet *outcomes* out of the scoring workbook and into the app efficiently — **no participant-facing leaderboard** (dropped per Pat, Q15/§9).
**Target:** late August (feature freeze Aug 28) · **Blockers:** Pat creating the Sheets mirror. *(Q15 revised by Pat: dedicated Sportsbook tabs mirrored after Day 1 and Day 3, not live; manual entry is the fallback.)*

- [ ] Pat mirrors the workbook's **Sportsbook tabs** to a Google Sheet, refreshed **after Day 1 and Day 3** (his task; format per PRD §12 Q15).
- [ ] Google Cloud service account with read-only Sheet access; creds in Vercel env vars.
- [ ] Import path: read the Sheet to help admins mark bet outcomes (assist, not auto-resolve — admins still confirm in Studio). **Manual bet-result entry remains the fallback** if the mirror isn't ready.
- [ ] Skip any `/leaderboard` participant page — out of scope now (Q15/§9).

**Done when:** an admin can pull the mirrored results after a scored day and mark that day's bet outcomes without hand-copying from Excel, with manual entry available if the mirror fails.

---

### Sprint 8 — Polish & Group Dry Run (Phase 9) 🔲

**Goal:** tournament-ready. Everything after this is reactive.
**Target:** Sept 1–10 (hard stop) · **Blockers:** Sprints 0–6 (7 is nice-to-have for the dry run).

- [ ] Mobile pass on every page — the tournament happens on phones.
- [ ] **Group dry run:** recruit 5+ real participants, run a full fake betting round (open → place → close → resolve → payouts) start to finish.
- [ ] Fix everything the dry run surfaces.
- [ ] Pre-tournament checklist doc: what admins do the week of, day before, and each morning of the tournament. Must include: verify the Supabase project is awake (free tier pauses after ~1 week idle), verify magic-link email works end-to-end, and run a DB export.
- [ ] Data safety: CSV/`pg_dump` export **before Round 1 opens** and **after final payouts** — free tier has no automated backups and this is money data.
- [ ] Optional stretch (only if time): bet aggregate stats after close ("$48 wagered on Dan Mercer to win").

**Done when:** the dry run completes without an admin needing to touch code or ask Andrew a question.

---

## What Is Explicitly Not on the Roadmap

- A custom admin UI (Studio is the admin UI).
- Notifications, email digests, or push notifications (out of scope for v1).
- A mobile app (it's a mobile-responsive web app — no native build).
- Public access, marketing pages, SEO (private app, behind login).
- Multi-tenancy (this is one pool for one group; it does not need to support multiple unrelated leagues).
- Payment processing (Venmo and cash, out of band, as today).
- Career P/L across tournaments (v2).

If a feature isn't here, default to "no" until someone makes the case for it.
