# Product Requirements Document — Ozark Open Sportsbook

**Status:** Draft v3 · **Last updated:** July 2026 · **Owners:** Andrew (lead), Pat / Jake / Steve (admins)

> **Draft v3 note:** Phases 0–3 are code complete (see `ROADMAP.md` for the sprint tracker). Jake answered all fifteen stakeholder questions on July 9, 2026; **Pat reviewed the PRD in July 2026 and revised several of those answers** — the §12 log now reflects Pat's revisions (attributed inline). A handful of items Pat raised still need a decision or a design meeting; those are tracked in `OUTSTANDING_DECISIONS.md`, not buried here.

---

## 1. Background

The Ozark Open is an annual three-day golf tournament with roughly 32 participants (up from 24 in 2026). Since 2026, a private fantasy-golf pool ("Sig Tau Sportsbook") has run alongside the tournament — participants pay an entry fee ($20–$50), receive a menu of bets curated by the chairman, and place wagers across two betting rounds. **Entry collection:** the $20 minimum is deducted from each participant's tournament deposit; anything above $20 is collected separately by Venmo or cash. *(Collection mechanic is Pat's working plan — see `OUTSTANDING_DECISIONS.md`.)*

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

1. **Eliminate text-message bet submission.** Participants place bets in the app, with constraint validation enforced at submission time. Every placement is **timestamped** (created/updated) so admins have an audit trail for governance.
2. **Make bets and outcomes visible — on the admins' schedule.** Everyone in the pool can see the bet menu and, **once admins close a round (their approval of visibility)**, who bet on what and how each bet resolved. Nobody sees anyone else's submissions while the betting window is still open (see §12 Q11/Q12).
3. **Make admin updates a non-event.** Adding a bet, marking an outcome, and computing payouts should require zero code changes and zero deployments.
4. **Persist across years.** A user who plays in 2026 and 2028 should have one account, with a history of their bets across both tournaments.

## 3. Non-Goals

- Tournament scoring, skins calculation, leaderboard math — **stays in the existing Excel workbook.**
- Payment processing — **Venmo and cash, handled outside the app, as today.**
- Public access — **strictly behind login.** No marketing, no SEO, no public landing page.
- Real-money sportsbook regulatory compliance — this is a private pool among friends, not a commercial operation.
- New bet *categories* without code changes. The seven existing structures (see §6) are baked in for now. Adding an eighth structure would require a small code change.
- **Odds computation or suggestion.** All odds are hand-set by Pat and Jake. The app never calculates, recommends, or moves odds — it only displays what the admins entered.
- **Commercial-sportsbook mechanics — asked and answered, permanently out:** parlays, live/in-play betting, cash-out, odds that move with pool weight (this is pari-mutuel *at settlement*, not a live tote board), and real-time page updates (a refresh is fine for ~32 users). These are how a weekend project dies; don't reopen them.

---

## 4. User Personas

### 4.1 Participant
A tournament player (or eligible non-playing entrant). Typical age 22–45, comfortable with phones, not a developer. Wants to:

- Log in fast, ideally on a phone, ideally without remembering a password.
- Set their display name when they first register (they can't change it afterward — admins can correct it to match the official tournament roster).
- See what bets are open and what the odds are.
- Place 5–10 bets across the tournament, see them confirmed, and edit them up until the round closes.
- See, after each scored day, which of their bets hit/missed/pushed/voided.
- See their running theoretical payout and (after the tournament) their final share of the pool.

**Non-playing bettors** (people who aren't playing golf but are in the pool) are supported — none are expected in 2026, but the app allows any number now and in future years. They are exempt from the self-bet rule, carry a **stricter betting maximum** than players, and admins can **enable or disable betting for any user** (playing or not) and easily monitor the non-players. *(Q14; the exact stricter max is still open — see `OUTSTANDING_DECISIONS.md`.)*

### 4.2 Admin
Pat, Jake, Steve, or Andrew. Responsible for publishing bets, marking outcomes, and running final payouts. Wants to:

- Edit the bet menu like a spreadsheet, setting every bet's odds by hand (the app never sets or suggests odds — that's Pat and Jake's call alone).
- After a scored day of golf, mark outcomes for that day's bets in a few minutes.
- Open the second round of bets (with odds informed by what happened in Round 1 / Day 1) without redeploying anything.
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
If outcome = PUSH:  payout = stake  (bet counts; stake returned as its payout)
If outcome = VOID:  bet does NOT count — excluded from the theoretical total;
                    the stake is refunded to the bettor and removed from the pool
```

**Push vs void** *(revised by Pat, Jul 2026 — Q6)*: a **push** still counts — its theoretical payout is exactly the stake (e.g., a $4 bet that pushes contributes $4). A **void** is different: the bet is struck entirely. It contributes nothing to the theoretical total, the wagered dollars are **returned to the bettor**, and those dollars **leave the pool**.

A user's **total theoretical payout** is the sum across all their bet placements *that count* (hits, misses, pushes — never voids).

**Actual payout** for a user is the proportional share:

```
actual_payout(user) = total_theoretical(user) / sum(total_theoretical(all users)) × pool_total
```

`pool_total` = sum of every participant's entry fee **minus every voided placement's stake** (voided dollars are refunded off the top and no longer in the pool). A bettor with a voided bet gets that stake back directly, on top of their `actual_payout`. *(The precise handling of voids in the pool math is money-critical and stated here from Pat's principle — see `OUTSTANDING_DECISIONS.md` for final confirmation.)*

Displayed theoretical and actual payouts are **rounded to the nearest cent** (e.g., `$38.72`); Venmo is then paid **exactly to the cent** *(Q5)*.

**Worked example** (from the 2026 spreadsheet, no voids): pool = $520. Jake Kohne's theoretical payout = $21.87. Sum of everyone's theoretical = $279.57. Jake's actual share = $21.87 / $279.57 × $520 = $40.67.

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

> **Note (Pat, Jul 2026):** the seven bets above were a quick sample built during development. Pat and Jake still need to brainstorm the full 2026 menu, and Pat has proposed reorganizing how bets are structured — see §6.1.

### 6.1 Proposed restructure — pending Pat/Jake design meeting

> ⚠️ **Not built, not decided.** This subsection records Pat's proposed bet taxonomy so it isn't lost. The **live schema and the seven `resolution_type` values in §6 remain in force** until this is finalized at a Pat/Jake design meeting. Open questions are tracked in `OUTSTANDING_DECISIONS.md` (#1). Do not implement against this yet.

Pat proposes replacing the flat category list with a **two-level taxonomy plus grouping**, released in two stages:

**Top-level categories (by golf segment):**
- **Final Tournament** — bets that resolve on the overall tournament result.
- **Round 1** — bets resolving after Day 1.
- **Round 3** — bets resolving after Day 3 (Saturday). *(Day 2, the scramble, is not part of the Sportsbook — see Q9. Note the naming: what §7/§8 currently call "betting Round 2" is Pat's "Round 3" in golf terms; reconciling this naming is part of the meeting.)*

**Two-stage release:**
- **Stage 1** — bets open for **Final Tournament** and **Round 1**.
- **Stage 2** — new bets **appended** to Final Tournament, and **Round 3** bets become available.

**Subcategories (under each top-level category), each with its own selection rule:**

| Subcategory | Selection rule | Resolution |
|---|---|---|
| Winner / Top Finisher (incl. ties) | Bettor may back **multiple** options | Hit for first place + ties |
| Top X Finisher (incl. ties) | Bettor may back **multiple** options | Hit for all players finishing top X + ties |
| Head-to-Head (2 players) | Bettor may back **only one** player | Push if tied |
| Head-to-Head (3+ players) | Bettor may back **only one** player | Hit for all ties |
| Prop Bets | **No multiple bets within the same group**; otherwise multiple props allowed | Manually adjudicated |

**Data shape:** each bet row would carry **category, subcategory, group id, and bet id**. `group_id` lets a subcategory hold multiple independent groups of bets (e.g., several separate head-to-head matchups). This is a modest change to the existing spreadsheet/columns; see `DATA_MODEL.md` for the proposed-column note.

---

## 7. Bet Submission Rules

These rules come straight from the original Sportsbook memo and must be enforced at bet submission time:

1. **Per-tournament entry fee:** between $20 and $50, in whole dollars. Set when the participant joins the tournament.
2. **Bets per tournament:** minimum 5, maximum 10, counted **across both rounds combined** — not per round. A participant may place all of their bets in one round and none in the other (e.g., all 5–10 in Round 1, zero in Round 2, or vice-versa). If someone is still under the 5-bet minimum when betting closes, admins chase them first (as Pat does today by text); if they stay short, their placed bets simply stand as-is — no voiding, no penalty. *(Revised by Pat, Jul 2026: the 5–10 count spans the tournament, not each round — Q2/Q3.)*
3. **Bet amounts:** whole dollars only, $1 minimum.
4. **Maximum single bet:** half the participant's entry fee, capped at $20 — applies to every individual placement, in either round. (Example: $40 entry → max $20 single bet. $20 entry → max $10 single bet.) *(Resolved: Q4.)*
5. **Maximum total bet on yourself:** one quarter of the participant's entry fee, capped at $10 — totaled **across the whole tournament**, both rounds combined. *(Resolved: Q4.)*
6. **Total wagered:** must equal exactly the participant's entry fee, **summed across both rounds combined** — "$40 across the board": a $40 entry buys $40 of total wagering, not $40 per round. The split between rounds is the participant's choice, including wagering everything in Round 1 and nothing in Round 2. The exact total must be reached by the time Round 2 closes. *(Resolved: Q1/Q2.)*

7. **One player per head-to-head** *(pending the §6.1 restructure)*: in a head-to-head bet (2 or 3+ players), a bettor may back **only one** of the named players, never several. In the "winner / top finisher" and "top-X" subcategories a bettor **may** back multiple options. Prop bets: **no more than one** bet within the same prop group, though a bettor may place multiple props across different groups. *(Pat, Jul 2026 — §7.1 of his feedback; exact enforcement lands with the §6.1 taxonomy.)*

**Self-bet detection:** the app will flag bets where the participant appears to be the subject (their name matches a player named in the bet's `subject_player_ids`). Admins manually review flagged bets. **Betting on "the field" is never treated as a self-bet**, even if the participant is one of the players in the field *(Q10)*. Indirect self-bets (e.g., betting on a head-to-head you're in) cannot be reliably auto-detected — final discretion rests with the admin team, as today.

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

**There is no scheduled cutoff.** The admin closes Round 1 bets manually before Thursday tee-off. **After Day 1 (match play), admins enter outcomes for Round 1 bets** — Day 2 (the scramble) is not covered by the Sportsbook. Round 2 bets are released ahead of Day 3 (Saturday stroke play), with odds informed by what's already happened, and resolve after that final round. *(Round mapping revised by Pat, Jul 2026 — Q9.)*

**Submission timestamps.** Every placement records its created/updated time, giving admins a governance trail — when a bet went in, and whether it was edited after the fact *(Pat §2.1/§8)*.

### 8.1 Enforcement Timing

Not all of the §7 rules can be checked at the same moment. They split into two groups:

**Per-placement rules — hard-blocked at submission time** (the API rejects the write):

- Bet status must be `open`.
- Amount is a whole dollar, $1 minimum (rule 3).
- Amount ≤ max single bet (rule 4).
- Total placement count across both rounds ≤ 10 (rule 2 upper bound — counts across the tournament, not per round).
- Running self-bet total across both rounds ≤ self-bet cap (rule 5).
- Running wager total **across both rounds** ≤ entry fee (rule 6 upper bound — a participant can never *over*-commit).

**Round-completeness rules — can only be evaluated at round close**, because a participant is legitimately incomplete while still placing bets:

- At least 5 placements **across the tournament** (rule 2 lower bound — the count spans both rounds, so this is a final check at Round 2 close, not per round).
- Total wagered across both rounds equals exactly the entry fee — final check at Round 2 close (rule 6).

**Intended UX for the completeness rules:** while a round is `open`, the app shows the participant a running total, remaining tournament budget, and a prominent "incomplete" warning (e.g., "You've wagered $23 of $40 — Round 2 must bring you to exactly $40"). Crucially, the app **lets the participant save their bet slip whether or not it currently meets the requirements** — it never blocks saving and never silently fixes anything — and the flag/alert **clears automatically the moment the slip becomes compliant** *(Pat, Jul 2026 — Q3)*. Admins get a view of non-compliant participants before closing each round so they can chase stragglers, exactly as Pat does today by text.

**Consequence of closing with a non-compliant participant** *(resolved: Q3)*: their placed bets stand as-is. No voiding, no auto-adjustment — the chase-then-accept approach mirrors how the pool already works.

---

## 9. User Stories by Phase

See `ROADMAP.md` for the phased build plan and acceptance criteria. At a high level:

**Participant-facing:**
- As a participant, I can log in via a magic link sent to my email.
- As a participant, I can set my display name when I first register (admins can correct it later; I can't change it myself).
- As a participant, I can see the active bet menu, grouped by category and round.
- As a participant, I can place bets totaling exactly my entry fee, respecting all rules in §7.
- As a participant, I can edit or remove my bets while the round is `open`.
- As a participant, I can save my in-progress bet slip even when it's incomplete, and see a clear flag that disappears once I meet all the requirements.
- As a participant, I can see everyone's bets — who bet what, and for how much — on a dedicated page after the round closes. (This is the social heart of the pool; it's a first-class feature, not a side effect of visibility rules.)
- As a participant, I can see a personalized rules card: my entry fee, my max single bet, my max self-bet, and my progress toward the 5-bet minimum and exact total.
- As a participant, I can see the current pool total on the dashboard.
- As a participant, I can see the outcomes of my bets after each scored day.
- As a participant, I can see my running theoretical payout and (after the tournament) my final actual share.

*(Dropped per Pat, Jul 2026: participants do **not** need to see the tournament leaderboard in the app — the scoring workbook stays the leaderboard's home. The Google Sheets mirror now feeds outcome entry, not a participant-facing standings page — see §10 and Q15.)*

**Admin-facing:**
- As an admin, I can mark a user as a tournament participant for a given year and set their entry fee.
- As an admin, I can create bets in Supabase Studio with a category, description, odds, round, and subject players.
- As an admin, I can move bets through draft → open → closed → resolved.
- As an admin, I can mark each bet's outcome as hit / miss / push / void.
- As an admin, I can review flagged self-bets and approve or reject them.
- As an admin, I can trigger / view the final payout calculation.

---

## 10. Out-of-Scope Decisions Already Made

- **Authentication:** magic-link email via Supabase Auth. No shared passwords. No social SSO. **Email delivery goes through custom SMTP (Resend free tier)** — Supabase's built-in email service is rate-limited to a handful of messages per hour and is for development only; ~32 people requesting magic links on tournament morning would fail. Session duration is extended so anyone who logs in during dry-run week stays logged in through the tournament.
- **Odds integrity:** odds are snapshotted onto each placement at write time (`odds_at_placement`); payouts use the snapshot. See §7.1.
- **Audit trail:** placements are soft-deleted (`deleted_at` timestamp), never hard-deleted. When there's a payout dispute, the history exists.
- **Identity:** evergreen accounts across years. One user, many tournaments. **Display names are user-set at registration and then immutable by the user; admins can always edit them** and are expected to keep them matching the official tournament roster (self-bet flagging depends on the name match). *(Q13, revised by Pat.)*
- **Visibility:** strictly behind login. Other participants' bets become visible only after admins close the round (§2, Q11/Q12).
- **Admins:** Pat, Jake, Steve, Andrew. Stored as a role flag on the user record. Admins can enable/disable betting for any user and set a stricter max for non-playing bettors (§4, Q14).
- **Cutoffs:** admin-controlled, not time-based.
- **Payments:** the app tracks no Venmo handles or payment status. Collection: the **$20 minimum comes out of the tournament deposit; anything above $20 is Venmo/cash**. The app **shows payouts to the nearest cent**, and Venmo is paid **exactly to the cent** *(Q5)*.
- **Odds:** hand-set by Pat and Jake only. The app never computes or suggests odds (§3).
- **Scoring math:** stays in the Excel workbook. The workbook has dedicated Sportsbook tabs mirrored to Google Sheets **after Day 1 and Day 3** (not live) to feed **bet-outcome entry**; if mirroring fails, admins **enter bet results manually**. There is no participant-facing leaderboard in the app *(Q15, revised by Pat)*.

---

## 11. Timeline

- **Tournament:** September 24–26, 2026 (three days: Day 1 Thu, Day 2 Fri scramble, Day 3 Sat).
- **Feature freeze:** ~August 28, 2026 — everything after is testing, bugs, and polish.
- **Fully wrapped:** September 10, 2026 at the latest (two weeks before tee-off), with a group dry run before then.

**Operational risks to manage around the timeline:**

- **Supabase free-tier projects pause after ~1 week of inactivity.** A paused project means login is down. The pre-tournament checklist verifies the project is awake (or we spend $25 on Pro for September and skip the worry).
- **Free tier has no automated backups — and this is money data.** A CSV/`pg_dump` export runs before Round 1 opens and after final payouts, minimum.

Sprint-by-sprint dates live in `ROADMAP.md`.

---

## 12. Stakeholder Decision Log (Jake, Jul 9 2026 · revised by Pat, Jul 2026)

All fifteen questions from Draft v2 were answered by Jake on July 9, 2026 (Q1/Q2 explicitly; Q3–Q15 adopting the proposed defaults). **Pat then reviewed the PRD in July 2026 and revised several answers** — those rows are marked *(revised by Pat)* and are the current source of truth. Items Pat left genuinely open are in `OUTSTANDING_DECISIONS.md`, not here.

| # | Decision |
|---|---|
| Q1 | **Entry fee funds both rounds combined** — "$40 across the board." A $40 entry buys $40 of total wagering, not $40 per round. *(Jake + Pat confirmed.)* |
| Q2 | Split between rounds is the **participant's choice**; $0 in a round is allowed. The **5–10 bet count and the exact-total requirement span both rounds combined**, not per round; exact total due by Round 2 close. *(Revised by Pat: the 5–10 count is per tournament, not per round.)* |
| Q3 | Under-minimum or off-total at close: **admins chase first; whatever stands, stands** — no voiding, no auto-adjustment. The app **flags a non-compliant slip, still lets the user save it, and clears the flag once compliant**; if abuse appears, reassess later. *(Extended by Pat.)* |
| Q4 | Max single bet: **per placement**, either round. Self-bet cap: **per tournament** (both rounds combined). *(Jake + Pat confirmed.)* |
| Q5 | App **rounds theoretical and actual payouts to the nearest cent** (e.g., $38.72); **Venmo is paid exactly to the cent.** *(Revised by Pat — not "payer's business.")* |
| Q6 | **Push:** bet counts, stake returned as its payout. **Void:** bet does **not** count — stake **refunded to the bettor and removed from the pool**. *(Revised by Pat — push and void now differ.)* |
| Q7 | Voids that retroactively drop someone below the 5-bet minimum: **no adjustment** — the bettor followed the rules; voids happen. *(Pat confirmed.)* |
| Q8 | Menu sized for **~70–100 bets per round** (not yet final; build for it and keep flexibility to adjust). *(Revised by Pat.)* |
| Q9 | Round mapping: **Round 1 bets resolve after Day 1; Day 2 (scramble) is not covered; Round 2 bets resolve after Day 3 (Saturday).** *(Revised by Pat.)* |
| Q10 | **"The field" bets exist** as a long option to win the tournament; displayed like any other bet, no `bet_subjects` rows. **Backing the field is never a self-bet**, even if you're in the field. *(Extended by Pat.)* |
| Q11 | Aggregate money per bet is **hidden while the round is open**; visible after close. *(Pat confirmed.)* |
| Q12 | After close, **everyone's individual amounts are visible** — not just who bet on what. *(Pat confirmed.)* |
| Q13 | Display names are **user-set at registration, then immutable by the user; admins can always edit** and must keep them matching the official tournament roster (self-bet flagging depends on it). *(Revised by Pat.)* |
| Q14 | **Non-playing bettors supported** (exempt from self-bet), any number now/future, expect **0–5**. **Admins can enable/disable betting per user** and non-players carry a **stricter betting max** + monitoring. *(Revised/extended by Pat.)* |
| Q15 | Scoring workbook has **dedicated Sportsbook tabs mirrored to Google Sheets after Day 1 and Day 3** (not live) to feed **bet-outcome entry**; **manual entry** is the fallback. **No participant-facing leaderboard in the app.** *(Revised by Pat.)* |

### Defaults already taken (not blocking — speak up only to change)

- No career P/L across tournaments in v1 — per-tournament only.
- No notifications when Round 2 bets are released — Pat texts the group chat, as today.
