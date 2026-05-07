# Product Requirements Document — Ozark Open Sportsbook

**Status:** Draft v1 · **Last updated:** May 2026 · **Owners:** Andrew (lead), Pat / Jake / Steve (admins)

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
3. **Bet amounts:** whole dollars only, $1 minimum.
4. **Maximum single bet:** half the participant's entry fee, capped at $20. (Example: $40 entry → max $20 single bet. $20 entry → max $10 single bet.)
5. **Maximum total bet on yourself:** one quarter of the participant's entry fee, capped at $10.
6. **Total wagered:** must equal exactly the participant's entry fee. (No partial commitments.)

**Self-bet detection:** the app will flag bets where the participant appears to be the subject (their name matches a player named in the bet's `subject_player_ids`). Admins manually review flagged bets. Indirect self-bets (e.g., betting on a head-to-head you're in) cannot be reliably auto-detected — final discretion rests with the admin team, as today.

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

**There is no scheduled cutoff.** The admin closes Round 1 bets manually before Thursday tee-off. After Day 1 (match play) and Day 2 (scramble), admins enter outcomes for Round 1 bets. Round 2 bets are released ahead of Saturday's stroke-play round, with odds informed by what's already happened.

---

## 9. User Stories by Phase

See `ROADMAP.md` for the phased build plan and acceptance criteria. At a high level:

**Participant-facing:**
- As a participant, I can log in via a magic link sent to my email.
- As a participant, I can see the active bet menu, grouped by category and round.
- As a participant, I can place bets totaling exactly my entry fee, respecting all rules in §7.
- As a participant, I can edit or remove my bets while the round is `open`.
- As a participant, I can see everyone's bets after the round closes.
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

- **Authentication:** magic-link email via Supabase Auth. No shared passwords. No social SSO.
- **Identity:** evergreen accounts across years. One user, many tournaments.
- **Visibility:** strictly behind login.
- **Admins:** Pat, Jake, Steve, Andrew. Stored as a role flag on the user record.
- **Cutoffs:** admin-controlled, not time-based.
- **Payments:** out of scope. App does not track Venmo handles or payment status.
- **Scoring math:** stays in the Excel workbook; app reads via Google Sheets API for display only.

---

## 11. Open Questions (for later phases)

- Should bets show running aggregate stake (e.g., "$48 total wagered on Dan Mercer to win") to participants while round is `open`? Could create herd behavior. **Default: no, only show after round closes.**
- Should the app expose a participant's career P/L across multiple tournaments, or just per-tournament? **Default: per-tournament for v1, career stats in v2.**
- Should there be a notification when bets are released for Round 2? **Default: no for v1; could add email-via-Supabase-trigger later.**
