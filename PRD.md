# Product Requirements Document — Ozark Open Sportsbook

**Status:** Draft v2 · **Last updated:** July 2026 · **Owners:** Andrew (lead), Pat / Jake / Steve (admins)

> **Draft v2 note:** Phases 0–3 are code complete (see `ROADMAP.md` for the sprint tracker). This revision surfaces every unresolved spec decision as an explicit stakeholder question — see §12. Items marked `⚠️ AWAITING STAKEHOLDER ANSWER` block specific sprints and must be resolved before Sprint 1 (bet placement) begins.

---

## 1. Background

The Ozark Open is an annual three-day golf tournament with roughly 24 participants. Since 2026, a private fantasy-golf pool ("Sig Tau Sportsbook") has run alongside the tournament — participants pay an entry fee ($20–$50, deducted from their tournament deposit), receive a menu of bets curated by the chairman, and place wagers across two betting rounds.

The pool is **pari-mutuel**: there is no house, no rake, no profit. Each bettor's "theoretical payout" (what they would have won at the published odds) determines their proportional share of the actual pool.

Today the workflow is entirely manual:

- Bets are texted to Pat Leicht ("$3 on #3, $5 on #17, …")
- Pat enters them into an Excel workbook
- After each round of golf, outcomes are entered into the workbook
- The workbook computes theoretical and actual payouts
- Pat sends Venmo payments after the tournament

This works, but it's slow, error-prone, and gives no visibility into bets or standings during the tournament. The app replaces the bet-collection and outcome-display steps. **It does not replace the tournament scoring workbook** — that remains the source of truth for the leaderboard, skins, and placement money.

---

## 2. Goals

1. **Eliminate text-message bet submission.** Participants place bets in the app, with constraint validation enforced at submission time.
2. **Make bets and outcomes visible.** Everyone in the pool can see the bet menu, who bet on what, and how each bet resolved.
3. **Make admin updates a non-event.** Adding a bet, marking an outcome, and computing payouts should require zero code changes and zero deployments.
4. **Persist across years.** A user who plays in 2026 and 2028 should have one account, with a history of their bets across both tournaments.

## 3. Non-Goals

- Tournament scoring, skins calculation, leaderboard math — **stays in the existing Excel workbook.**
- Payment processing — **Venmo and cash, handled outside the app, as today.**
- Public access — **strictly behind login.** No marketing, no SEO, no public landing page.
- Real-money sportsbook regulatory compliance — this is a private pool among friends, not a commercial operation.
- New bet *categories* without code changes. The seven existing structures (see §6) are baked in for now. Adding an eighth structure would require a small code change.
- **Commercial-sportsbook mechanics — asked and answered, permanently out:** parlays, live/in-play betting, cash-out, odds that move with pool weight (this is pari-mutuel *at settlement*, not a live tote board), and real-time page updates (a refresh is fine for 24 users). These are how a weekend project dies; don't reopen them.

---

## 4. User Personas

### 4.1 Participant
A tournament player (or eligible non-playing entrant). Typical age 22–45, comfortable with phones, not a developer. Wants to:

- Log in fast, ideally on a phone, ideally without remembering a password.
- See what bets are open and what the odds are.
- Place 5–10 bets per round, see them confirmed, and edit them up until the round closes.
- See, after each day, which of their bets hit/missed/pushed/voided.
- See their running theoretical payout and (after the tournament) their final share of the pool.

### 4.2 Admin
Pat, Jake, Steve, or Andrew. Responsible for publishing bets, marking outcomes, and running final payouts. Wants to:

- Edit the bet menu like a spreadsheet.
- After each round of golf, mark outcomes for that round's bets in a few minutes.
- Open the second round of bets (with odds informed by what happened in rounds 1 and 2 of golf) without redeploying anything.
- Trigger the final payout calculation and see the results.

---

## 5. The Pari-Mutuel Math

This is the heart of the system. Every other feature exists to support these two formulas.

**Theoretical payout** for a single bet placement, based on American odds:

```
If outcome = HIT:
    if odds > 0:    payout = stake × (odds / 100) + stake
    if odds < 0:    payout = stake × (100 / |odds|) + stake

If outcome = MISS:  payout = 0
If outcome = PUSH:  payout = stake (return the stake)
If outcome = VOID:  payout = stake (return the stake)
```

A user's **total theoretical payout** is the sum across all their bet placements.

**Actual payout** for a user is the proportional share:

```
actual_payout(user) = total_theoretical(user) / sum(total_theoretical(all users)) × pool_total
```

`pool_total` = sum of every participant's entry fee.

**Worked example** (from the 2026 spreadsheet): pool = $520. Jake Kohne's theoretical payout = $21.87. Sum of everyone's theoretical = $279.57. Jake's actual share = $21.87 / $279.57 × $520 = $40.67.

---

## 6. The Seven Bet Categories

The existing Sportsbook supports these structures. The data model treats them as a generic `bet_category` with a `resolution_type` enum, so adding new categories later is a config change, not a rewrite.

| # | Category | Resolution | Notes |
|---|---|---|---|
| 1 | **Outright Winner** (e.g., "Win Tournament") | `single_winner` | Exactly one player or "the field" wins; everyone else loses. |
| 2 | **Top-N Finish + Ties** (e.g., "Top 4 Finish + Ties") | `top_n_with_ties` | Hit if the named player finishes in the top N including ties. |
| 3 | **Best Finisher (head-to-head, no ties)** | `head_to_head_strict` | Two players: the better finisher wins; pushes if tied. |
| 4 | **Best Finisher + Ties (head-to-head among group)** | `best_in_group_with_ties` | One player vs. a group; hits if they finish at or above the others. |
| 5 | **Best Finisher (Void If Tied)** | `head_to_head_void_on_tie` | Two players: better finisher wins; tie voids the bet (stakes returned). |
| 6 | **Best Finisher among 3+ players** | `best_in_group_strict` | One player named to be best of three or more; ties don't count. |
| 7 | **Prop Bets** | `prop` | Manually adjudicated by admin (e.g., "best ball under 80.5"). |

Each individual bet has American odds (e.g., `+150`, `-130`) which the admin sets by hand. The fractional display (`3-2`, `13-10`) is computed for display only.

---

## 7. Bet Submission Rules

These rules come straight from the original Sportsbook memo and must be enforced at bet submission time:

1. **Per-tournament entry fee:** between $20 and $50, in whole dollars. Set when the participant joins the tournament.
2. **Total bets per round:** minimum 5, maximum 10.
   `⚠️ AWAITING STAKEHOLDER ANSWER (Q3)` — what happens if a participant is still under 5 bets when the round closes?
3. **Bet amounts:** whole dollars only, $1 minimum.
4. **Maximum single bet:** half the participant's entry fee, capped at $20. (Example: $40 entry → max $20 single bet. $20 entry → max $10 single bet.)
   `⚠️ AWAITING STAKEHOLDER ANSWER (Q4)` — confirm this cap applies to any single placement regardless of round (assumed yes).
5. **Maximum total bet on yourself:** one quarter of the participant's entry fee, capped at $10.
   `⚠️ AWAITING STAKEHOLDER ANSWER (Q4)` — is this total per round or per tournament?
6. **Total wagered:** must equal exactly the participant's entry fee. (No partial commitments.)
   `⚠️ AWAITING STAKEHOLDER ANSWER (Q1/Q2)` — **this is the biggest open question.** Does the entry fee cover both betting rounds combined, or must each round's wagers total the full entry fee? (`ROADMAP.md` previously said "per round must equal entry fee," which contradicts this rule as written. The two readings produce different budgets, different validation code, and different pool math.) If combined: is the split between rounds the participant's choice, and can a participant wager $0 in Round 2?

**Self-bet detection:** the app will flag bets where the participant appears to be the subject (their name matches a player named in the bet's `subject_player_ids`). Admins manually review flagged bets. Indirect self-bets (e.g., betting on a head-to-head you're in) cannot be reliably auto-detected — final discretion rests with the admin team, as today.

### 7.1 Odds Integrity

**Odds are locked at placement time.** Each placement snapshots the bet's odds into `odds_at_placement` at the moment the wager is written, and payouts are computed from that snapshot — never from the current value on the bet. Admins remain free to reprice a bet in Studio while it's `open` (e.g., odds drifting as Round 1 golf unfolds), but a reprice only affects *future* placements. Without this, editing `american_odds` after money is down would silently change every existing bettor's theoretical payout — the classic sportsbook integrity failure.

---

## 8. Lifecycle of a Bet (admin-controlled, not time-based)

Bets move through these statuses, all toggled manually by admins in Supabase Studio:

```
draft → open → closed → resolved
```

- `draft`: admin is preparing the bet; not visible to participants.
- `open`: visible to participants; they can place / edit / remove placements.
- `closed`: visible but no longer editable. Set when admin closes betting before tee-off.
- `resolved`: outcome (`hit` / `miss` / `push` / `void`) has been recorded. Theoretical payouts are now computed for placements on this bet.

**DB-enforced invariant:** `status = 'resolved'` **if and only if** `outcome IS NOT NULL` (CHECK constraint, added in Sprint 1). Since admins edit these columns directly in Studio, the database itself refuses the two plausible fat-fingers: setting an outcome on a bet that's still open, and marking a bet resolved without recording its outcome.

**There is no scheduled cutoff.** The admin closes Round 1 bets manually before Thursday tee-off. After Day 1 (match play) and Day 2 (scramble), admins enter outcomes for Round 1 bets. Round 2 bets are released ahead of Saturday's stroke-play round, with odds informed by what's already happened.

### 8.1 Enforcement Timing

Not all of the §7 rules can be checked at the same moment. They split into two groups:

**Per-placement rules — hard-blocked at submission time** (the API rejects the write):

- Bet status must be `open`.
- Amount is a whole dollar, $1 minimum (rule 3).
- Amount ≤ max single bet (rule 4).
- Placement count for the round ≤ 10 (rule 2 upper bound).
- Running self-bet total ≤ self-bet cap (rule 5).
- Running wager total ≤ the applicable budget (rule 6 upper bound — a participant can never *over*-commit).

**Round-completeness rules — can only be evaluated at round close**, because a participant is legitimately incomplete while still placing bets:

- At least 5 placements in the round (rule 2 lower bound).
- Total wagered equals exactly the required amount (rule 6).

**Intended UX for the completeness rules:** while the round is `open`, the app shows the participant a running total, remaining budget, and a prominent "incomplete" warning (e.g., "You've wagered $23 of $40 — place at least 2 more bets"). The app never silently fixes anything. Admins get a view of non-compliant participants before closing the round so they can chase stragglers, exactly as Pat does today by text.

`⚠️ AWAITING STAKEHOLDER ANSWER (Q3)` — what the *consequence* of closing a round with a non-compliant participant is (void their round? count what they placed? admin discretion?) is Pat's call and is not yet specified.

---

## 9. User Stories by Phase

See `ROADMAP.md` for the phased build plan and acceptance criteria. At a high level:

**Participant-facing:**
- As a participant, I can log in via a magic link sent to my email.
- As a participant, I can see the active bet menu, grouped by category and round.
- As a participant, I can place bets totaling exactly my entry fee, respecting all rules in §7.
- As a participant, I can edit or remove my bets while the round is `open`.
- As a participant, I can see everyone's bets — who bet what, and for how much — on a dedicated page after the round closes. (This is the social heart of the pool; it's a first-class feature, not a side effect of visibility rules.)
- As a participant, I can see a personalized rules card: my entry fee, my max single bet, my max self-bet, and my progress toward the 5-bet minimum and exact total.
- As a participant, I can see the current pool total on the dashboard.
- As a participant, I can see the outcomes of my bets after each day.
- As a participant, I can see my running theoretical payout and (after the tournament) my final actual share.
- As a participant, I can see the leaderboard pulled from the scoring workbook.

**Admin-facing:**
- As an admin, I can mark a user as a tournament participant for a given year and set their entry fee.
- As an admin, I can create bets in Supabase Studio with a category, description, odds, round, and subject players.
- As an admin, I can move bets through draft → open → closed → resolved.
- As an admin, I can mark each bet's outcome as hit / miss / push / void.
- As an admin, I can review flagged self-bets and approve or reject them.
- As an admin, I can trigger / view the final payout calculation.

---

## 10. Out-of-Scope Decisions Already Made

- **Authentication:** magic-link email via Supabase Auth. No shared passwords. No social SSO. **Email delivery goes through custom SMTP (Resend free tier)** — Supabase's built-in email service is rate-limited to a handful of messages per hour and is for development only; 24 people requesting magic links on tournament morning would fail. Session duration is extended so anyone who logs in during dry-run week stays logged in through the tournament.
- **Odds integrity:** odds are snapshotted onto each placement at write time (`odds_at_placement`); payouts use the snapshot. See §7.1.
- **Audit trail:** placements are soft-deleted (`deleted_at` timestamp), never hard-deleted. When there's a payout dispute, the history exists.
- **Identity:** evergreen accounts across years. One user, many tournaments.
- **Visibility:** strictly behind login.
- **Admins:** Pat, Jake, Steve, Andrew. Stored as a role flag on the user record.
- **Cutoffs:** admin-controlled, not time-based.
- **Payments:** out of scope. App does not track Venmo handles or payment status.
- **Scoring math:** stays in the Excel workbook; app reads via Google Sheets API for display only.

---

## 11. Timeline

- **Tournament:** September 24–27, 2026.
- **Feature freeze:** ~August 28, 2026 — everything after is testing, bugs, and polish.
- **Fully wrapped:** September 10, 2026 at the latest (two weeks before tee-off), with a group dry run before then.

**Operational risks to manage around the timeline:**

- **Supabase free-tier projects pause after ~1 week of inactivity.** A paused project means login is down. The pre-tournament checklist verifies the project is awake (or we spend $25 on Pro for September and skip the worry).
- **Free tier has no automated backups — and this is money data.** A CSV/`pg_dump` export runs before Round 1 opens and after final payouts, minimum.

Sprint-by-sprint dates live in `ROADMAP.md`.

---

## 12. Open Questions for Stakeholders (Pat / Jake)

Every unresolved spec decision, phrased so a short answer unblocks a sprint. Each has a proposed default — "yes, use the default" is a complete answer. Questions marked **[BLOCKER]** gate Sprint 1 (bet placement).

### Money & betting rules — Pat

| # | Question | Proposed default | Blocks |
|---|---|---|---|
| Q1 | **[BLOCKER]** Does the entry fee fund **both betting rounds combined**, or must **each round's** wagers total the full entry fee? ($40 entry: $40 across both rounds, or $40 per round?) | Combined — total across both rounds equals entry fee | Sprint 1 |
| Q2 | **[BLOCKER]** If combined: is the split between rounds the participant's choice? Can someone wager $0 in Round 2 (subject to the 5-bet minimum)? | Participant's choice, but each round they participate in needs ≥5 bets; must hit exact total by end of Round 2 | Sprint 1 |
| Q3 | **[BLOCKER]** What happens today when someone misses the 5-bet minimum or doesn't hit the exact total by round close? (Chase them? Void their round? Count what they placed?) | Admin chases before closing; if still short, count what they placed | Sprint 1, 3 |
| Q4 | **[BLOCKER]** Are the max-single-bet cap ($20 / half-entry) and self-bet cap ($10 / quarter-entry) **per round** or **per tournament**? | Single-bet cap: per placement (always). Self-bet cap: per tournament | Sprint 1 |
| Q5 | Payout rounding: are Venmo payments made to the cent, or rounded to whole dollars? What should the app display? | Display cents; Pat rounds however he pays | Sprint 6 |
| Q6 | Confirm push/void semantics: stake is returned and **counts toward** the theoretical total (matches the spreadsheet)? | Yes, stake counts | Sprint 5 |
| Q7 | If a void drops someone below the 5-bet minimum retroactively, is any adjustment made? | No adjustment — voids happen, life goes on | Sprint 5 |

### Bet menu & tournament ops — Pat / Jake

| # | Question | Proposed default | Blocks |
|---|---|---|---|
| Q8 | Roughly how many bets were on the menu per round in 2026? (Sizes the menu UI and the Studio data-entry workflow.) | Assume 15–25 per round | UI polish |
| Q9 | Confirm round mapping: Round 1 bets resolve on Day 1 (match play) + Day 2 (scramble); Round 2 bets cover Saturday stroke play only? | Yes as stated | — |
| Q10 | Do "the field" bets exist (e.g., "the field to beat Dan Mercer")? How should they be labeled on the menu? | Yes; displayed like any bet, no special subject rows | Sprint 2 |

### Visibility & identity — Jake

| # | Question | Proposed default | Blocks |
|---|---|---|---|
| Q11 | While a round is open, hide the aggregate money on each bet (avoids herd behavior)? | Hide until close | Sprint 2 |
| Q12 | After a round closes, do participants see everyone's **individual amounts**, or just **who bet on what**? | Full amounts visible after close | Sprint 3 |
| Q13 | Display names: set by admins in Studio, or user-editable in the app? (Currently defaults to the email address — someone must fix each one by hand.) | Admin-set in Studio for v1 | Sprint 0 |
| Q14 | Any non-playing bettors expected in 2026? (They're exempt from the self-bet rule.) | Support them; expect 0–2 | — |

### Leaderboard — Pat

| # | Question | Proposed default | Blocks |
|---|---|---|---|
| Q15 | Will you mirror the scoring workbook to Google Sheets? Which tabs/columns should the app's leaderboard show, and how often will you update during tournament days? | One "Leaderboard" tab: player, thru, score, position; updated after each day | Sprint 7 |

### Defaults already taken (not blocking — speak up only to change)

- No career P/L across tournaments in v1 — per-tournament only.
- No notifications when Round 2 bets are released — Pat texts the group chat, as today.
