# Roadmap & Sprint Tracker

The phased build plan **and** the live status tracker. Phases describe *what* gets built (unchanged in scope from v1 of this doc); sprints are the numbered, sitting-sized units of work we execute one at a time. Update the checkboxes and the status column here as work lands — this file is the single source of truth for "where are we?"

---

## Timeline

- **Tournament:** September 24–27, 2026
- **Fully wrapped:** September 10, 2026 at the latest (two weeks before tee-off)
- **Feature freeze:** ~August 28, 2026 — after this, only bugs, polish, and dry-run fixes
- Coding is Claude-Code-assisted, so build time per sprint is short. The pacing constraints are **stakeholder answers (PRD §12), deploy verification, and human testing** — not code.

| Window | Work |
|---|---|
| Week of Jul 13 | Sprint 0 (deploy & verify) + collect stakeholder answers |
| Mid–late July | Sprints 1–3 (bet placement, the heart of the app) |
| Early–mid August | Sprints 4–6 (outcomes, payouts, results) |
| Late August | Sprint 7 (leaderboard) → **feature freeze Aug 28** |
| Sept 1–10 | Sprint 8 (mobile pass, group dry run, fixes) |
| Sept 24–27 | 🏌️ Ozark Open |

---

## Status Summary

| Phase | What | Status | Sprint(s) | Target |
|---|---|---|---|---|
| 0 — Foundations | Skeleton, deploy pipeline | ✅ Code complete (May 7) — deploy unverified | 0 | Jul 18 |
| 1 — Auth | Magic-link login, users table | ✅ Code complete (May 7) — prod unverified | 0 | Jul 18 |
| 2 — Tournament setup | Tournaments, participants, dashboard | ✅ Code complete (May 7) — prod unverified | 0 | Jul 18 |
| 3 — Bet menu | Categories, bets, `/bets` page | ✅ Code complete (May 7) — prod unverified | 0 | Jul 18 |
| 4 — Placing bets | Placements, validation, My Bets | 🔲 Not started | 1, 2, 3 | Jul 31 |
| 5 — Outcomes | Closed/resolved UX, Studio workflow | 🔲 Not started (outcome badges already render on `/bets`) | 4 | Aug 7 |
| 6 — Theoretical payouts | Payout view, per-bet display | 🔲 Not started | 5 | Aug 14 |
| 7 — Final payouts | Pari-mutuel split, `/results` | 🔲 Not started | 6 | Aug 21 |
| 8 — Leaderboard | Google Sheets mirror | 🔲 Not started | 7 | Aug 28 |
| 9 — Polish & dry run | Mobile pass, group test | 🔲 Not started | 8 | Sep 10 |

**Legend:** ✅ complete · 🔶 in progress · 🔲 not started

---

## Completed Work (Phases 0–3)

Shipped May 7, 2026 (see git history and `docs/superpowers/` for the design specs and plans):

- **Phase 0:** Next.js 15 (App Router) + Tailwind + shadcn/ui skeleton; header; landing page; `/dashboard` and `/bets` routes.
- **Phase 1:** Magic-link login (`/login`, auth callback, signout), session middleware with route protection, `public.users` table + new-user trigger + RLS (`supabase/migrations/20260507000000_users_table.sql`).
- **Phase 2:** `tournaments` + `tournament_participants` tables with RLS and the 2026 seed row (`20260507000001_tournaments.sql`); `/dashboard` showing tournament + registration status.
- **Phase 3:** `bet_categories` / `bets` / `bet_subjects` tables with RLS and the seven-category seed (`20260507000002_bets.sql`); `/bets` menu grouped by round → category with American/fractional/implied odds (`lib/odds.ts`).

**"Code complete" is not "done"** — none of this is verified against a production deployment. That's Sprint 0.

---

## Sprint Backlog

One sprint = one sitting. Don't start a sprint while its blockers are open. Check boxes as tasks land; move the phase row in the Status Summary when a sprint's "done when" passes.

---

### Sprint 0 — Deploy & Verify Foundations 🔲

**Goal:** everything already coded is provably working in production.
**Target:** week of Jul 13 · **Blockers:** none — do this first.

- [ ] Confirm the Vercel project exists, is connected to the repo, and auto-deploys `main`; create it if not.
- [ ] Confirm the production Supabase project exists; apply all three migrations (`npx supabase db push` or SQL editor).
- [ ] Set env vars in Vercel (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- [ ] Log in via magic link on a phone (real-world email deliverability check).
- [ ] Promote Andrew, Pat, Jake, Steve to `is_admin = true` in Studio.
- [ ] Fix the four admins' `display_name` values in Studio (they default to email addresses) — per PRD Q13 default.
- [ ] Seed 3–5 sample bets in Studio; confirm they render on `/bets` grouped correctly.
- [ ] Send PRD §12 questions to Pat and Jake.

**Done when:** any admin can log in on their phone at the production URL, see the dashboard and sample bet menu, and the §12 answers are in hand.

---

### Sprint 1 — Placements Schema & Validation (Phase 4a) 🔲

**Goal:** the `bet_placements` table exists with correct RLS, and every §7 rule is encoded server-side.
**Target:** mid July · **Blockers:** ⚠️ PRD Q1–Q4 (budget semantics — do not guess these).

- [ ] Migration: `bet_placements` per `DATA_MODEL.md` §3.7, **plus** `requires_admin_review boolean NOT NULL DEFAULT false`.
- [ ] RLS: users insert/update/delete own rows while the bet is `open`; others' placements visible only once the bet is `closed`/`resolved`; admins read all.
- [ ] `lib/validation.ts`: pure functions for every rule in PRD §7 + §8.1, parameterized by the `tournaments` row (no hardcoded limits). Encode the Q1–Q4 answers.
- [ ] Unit-test the validation functions against the worked examples in PRD §5/§7 (including the $40-entry and $20-entry examples).

**Done when:** validation tests pass and the migration applies cleanly to prod.

---

### Sprint 2 — Placement API & Place-Bet UI (Phase 4b) 🔲

**Goal:** a participant can place, edit, and remove a bet from the menu.
**Target:** mid–late July · **Blockers:** Sprint 1 · PRD Q10, Q11.

- [ ] `app/api/placements/route.ts`: POST/PATCH/DELETE, calling `lib/validation.ts` before any write; reject non-participants and closed bets.
- [ ] Self-bet flagging: on write, if the user is in `bet_subjects` for the bet, set `requires_admin_review = true`.
- [ ] Inline amount input on `/bets` for each `open` bet (participant's own placement shown pre-filled if it exists).
- [ ] Clear error surface: rule violations come back as human-readable messages ("Max single bet is $20 for your $40 entry").

**Done when:** a participant can complete a legal placement end-to-end on the phone, and every §7 violation is rejected with a readable message.

---

### Sprint 3 — My Bets & Round Compliance (Phase 4c) 🔲

**Goal:** participants always know where they stand against the rules; admins can spot stragglers.
**Target:** late July · **Blockers:** Sprint 2 · PRD Q3, Q12.

- [ ] "My Bets" view: current placements grouped by round, running total, remaining budget.
- [ ] Compliance banner per PRD §8.1: "incomplete" warning while under the 5-bet minimum or off the exact total.
- [ ] Admin compliance view (can be a simple page or a Studio SQL snippet documented in README): who is non-compliant per round, encoding the Q3 answer.
- [ ] Other participants' placements become visible on bet close per the Q12 answer.

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

### Sprint 5 — Theoretical Payouts (Phase 6) 🔲

**Goal:** per-bet and total theoretical payouts, matching what Pat would compute by hand.
**Target:** early–mid August · **Blockers:** Sprint 4 · PRD Q6, Q7.

- [ ] Migration: `placement_payouts_view` exactly as defined in `DATA_MODEL.md` §4.
- [ ] "My Bets": theoretical payout column per resolved placement + "Total theoretical payout" summary.
- [ ] Admin "view all" page: everyone's placements and payouts in one table (replicates the spreadsheet's `View` sheet).
- [ ] Cross-check: reproduce Jake Kohne's $21.87 from the 2026 spreadsheet example (PRD §5).

**Done when:** the numbers match Pat's hand-math for any user.

---

### Sprint 6 — Final Pari-Mutuel Payouts (Phase 7) 🔲

**Goal:** final actual-payout shares computed and displayed.
**Target:** mid August · **Blockers:** Sprint 5 · PRD Q5.

- [ ] `lib/payouts.ts`: sum theoreticals, compute each share = `participant_total / sum_all × pool_total` (pool = sum of entry fees).
- [ ] `/results` page: name, entry fee, theoretical payout, actual payout, profit/loss — visible only when `tournament.status = 'completed'`.
- [ ] Rounding/display per the Q5 answer.
- [ ] Cross-check the full 2026 worked example: pool $520, sum $279.57, Jake $21.87 → $40.67.

**Done when:** final numbers match the spreadsheet's `View` sheet within rounding error.

---

### Sprint 7 — Leaderboard Mirror (Phase 8) 🔲

**Goal:** live standings from the scoring workbook, read-only.
**Target:** late August (feature freeze Aug 28) · **Blockers:** ⚠️ PRD Q15 (sheet format and Pat's buy-in).

- [ ] Pat mirrors the workbook tabs to a Google Sheet (his task — needs the Q15 answer).
- [ ] Google Cloud service account with read-only Sheet access; creds in Vercel env vars.
- [ ] `/leaderboard` page: fetch via Sheets API, cache 5 minutes, render the table.

**Done when:** standings appear in the app within 5 minutes of Pat editing the workbook.

---

### Sprint 8 — Polish & Group Dry Run (Phase 9) 🔲

**Goal:** tournament-ready. Everything after this is reactive.
**Target:** Sept 1–10 (hard stop) · **Blockers:** Sprints 0–6 (7 is nice-to-have for the dry run).

- [ ] Mobile pass on every page — the tournament happens on phones.
- [ ] **Group dry run:** recruit 5+ real participants, run a full fake betting round (open → place → close → resolve → payouts) start to finish.
- [ ] Fix everything the dry run surfaces.
- [ ] Pre-tournament checklist doc: what admins do the week of, day before, and each morning of the tournament.
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
