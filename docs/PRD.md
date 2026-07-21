# Product Requirements Document — Ozark Open Sportsbook

**Status:** Draft v4 · **Last updated:** July 15, 2026 · **Owners:** Andrew (lead), Pat / Jake / Steve (admins)

> **Draft v4 note:** Pat and Jake delivered the new betting architecture (July 2026 memo + reference spreadsheet, `docs/import/bets-sample.xlsx`). Bets now have **picks**, betting windows are **phases**, results arrive **per pick from the admin's spreadsheet**, and the menu is published via **spreadsheet upload**. The full decision record is `docs/adr/0001-bet-pick-architecture.md`; §6–§8 below are rewritten around it, and §12 logs what it supersedes. This memo is the design meeting Pat's July 11 review called for — his proposed §6.1 taxonomy became the five categories, and his void ruling is confirmed. The few genuinely open items live in `OUTSTANDING_DECISIONS.md`.
>
> *(Lineage: Draft v2 questions → Jake's answers Jul 9 → Pat's review revisions Jul 11 → this architecture rev Jul 15. §12 tracks all three.)*

---

## 1. Background

The Ozark Open is an annual three-day golf tournament (three rounds: Thursday, Friday, Saturday — Sept 24–26 in 2026) with roughly 32 participants (up from 24 in 2026's first pool). Since 2026, a private fantasy-golf pool ("Sig Tau Sportsbook") has run alongside the tournament — participants pay an entry fee ($20–$50), receive a menu of bets curated by the chairman, and place wagers across two betting phases. **Entry collection:** the $20 minimum is deducted from each participant's tournament deposit; anything above $20 is collected separately by Venmo or cash. *(Collection mechanic is Pat's working plan — see `OUTSTANDING_DECISIONS.md`.)*

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
2. **Make bets and outcomes visible — on the admins' schedule.** Everyone in the pool can see the bet menu and, **once admins close a bet**, who bet on what and how each pick resolved. Nobody sees anyone else's wagers while the betting window is still open (§12 Q11/Q12).
3. **Make admin updates a non-event.** Adding a bet, marking an outcome, and computing payouts should require zero code changes and zero deployments.
4. **Persist across years.** A user who plays in 2026 and 2028 should have one account, with a history of their bets across both tournaments.

## 3. Non-Goals

- Tournament scoring, skins calculation, leaderboard math — **stays in the existing Excel workbook.**
- Payment processing — **Venmo and cash, handled outside the app, as today.**
- Public access — **strictly behind login.** No marketing, no SEO, no public landing page.
- Real-money sportsbook regulatory compliance — this is a private pool among friends, not a commercial operation.
- Bet *resolution* logic. The app never adjudicates a bet — results are computed in the admin's Excel workbook and uploaded per pick (see §6/§8.2, ADR 0001 §3). The five categories (see §6) exist for wagering constraints and display, not for outcome math.
- **Odds computation or suggestion.** All odds are hand-set by Pat and Jake in the spreadsheet. The app never calculates, recommends, or moves odds — it only displays what the sheet says.
- **Commercial-sportsbook mechanics — asked and answered, permanently out:** parlays, live/in-play betting, cash-out, odds that move with pool weight (this is pari-mutuel *at settlement*, not a live tote board), and real-time page updates (a refresh is fine for ~32 users). These are how a weekend project dies; don't reopen them.

---

## 4. User Personas

### 4.1 Participant
A tournament player (or eligible non-playing entrant). Typical age 22–45, comfortable with phones, not a developer. Wants to:

- Log in fast, ideally on a phone, ideally without remembering a password.
- See what bets are open and what the odds are on each pick.
- Place 5–10 pick wagers per phase, see them confirmed, and edit them up until the phase closes.
- See, after results are uploaded, which of their picks hit/missed/pushed/voided.
- See their running theoretical payout and (after the tournament) their final share of the pool.

### 4.2 Admin
Pat, Jake, Steve, or Andrew. Responsible for publishing bets, uploading results, and running final payouts. Wants to:

- Maintain the bet menu in the Excel workbook he already trusts, and publish it by uploading the spreadsheet — no retyping into another tool.
- After each betting round of golf, re-upload the sheet with results filled in and be done in a few minutes.
- Release Phase 2 bets (with odds informed by Rounds 1 and 2 of golf) by flipping their status in the sheet and re-uploading — no redeploys.
- Trigger the final payout calculation and see the results.

---

## 5. The Pari-Mutuel Math

This is the heart of the system. Every other feature exists to support these two formulas.

**Theoretical payout** for a single pick placement, based on the American odds snapshotted at placement time (§7.1). Result comes from the pick (§6):

```
If result = HIT:
    if odds > 0:    payout = stake × (odds / 100) + stake
    if odds < 0:    payout = stake × (100 / |odds|) + stake

If result = MISS:   payout = 0
If result = PUSH:   payout = stake (stake returned inside the math)
If result = VOID:   excluded — stake is refunded and removed from the pool
```

A user's **total theoretical payout** is the sum across all their non-void placements.

**Actual payout** for a user is the proportional share:

```
actual_payout(user) = total_theoretical(user) / sum(total_theoretical(all users)) × pool_total

pool_total = sum(entry fees) − sum(voided stakes)
```

**Push vs. void** *(ADR 0001 §9 — supersedes the void half of Q6)*: a push credits the stake back **inside** the theoretical math and leaves the pool untouched; a void takes the stake **out of the game entirely** — no theoretical credit, and the pool shrinks by the stake (the refund itself is out of band, like all money movement).

**Worked example** (from the 2026 spreadsheet; no voids that year, so the pool is just the entry-fee sum): pool = $520. Jake Kohne's theoretical payout = $21.87. Sum of everyone's theoretical = $279.57. Jake's actual share = $21.87 / $279.57 × $520 = $40.67.

---

## 6. Bet Structure: Bets, Picks, and the Five Categories

*(Rewritten per ADR 0001 — Pat & Jake's July 2026 architecture.)*

A **bet** is a menu heading with a shared question ("Win Tournament", "Medalist - Round 1", "More Even or Odd hole scores"). Its **picks** are the individual options — each player, "Field", "Yes"/"No" — and each pick carries its own American odds, fractional odds, implied probability, and (eventually) its own result. **Participants wager on picks, not bets.** A bet also displays its `total_probability` (the sum of its picks' probabilities), informationally.

Every bet is scoped to a **round** — the whole **Tournament**, **Round 1**, or **Round 3**. No bets are released for Round 2, by policy.

### The five categories

| Category | Picks per participant | Ties | Self-pick | Opponent pick |
|---|---|---|---|---|
| **Top Finisher** (winner of round/tournament) | multiple allowed | hit | flagged for review | n/a |
| **Top X Finisher** (e.g. "Top 4 Finish") | multiple allowed | hit | flagged for review | n/a |
| **Match** (head-to-head, straight up or with strokes) | **one only** | push | flagged for review | **prohibited** |
| **Group Match** (3+ players, straight up or with strokes) | **one only** | hit | flagged for review | **prohibited** |
| **Prop Bet** (special rules, e.g. "best ball under 80.5") | per the bet's options | manual | n/a | n/a |

Match and Group Match picks may carry stroke adjustments in the pick label itself ("Steve Jones (-5)", "Jake Kohne (E)").

**The app never adjudicates.** The tie rules above are informational — they document how the admin's Excel workbook arrives at each pick's result. Results (`hit` / `miss` / `push` / `void`) are computed in the workbook and arrive per pick via spreadsheet upload (§8.2).

**Odds are supplied, not computed.** The sheet provides `american_odds`, `fractional_odds`, `probability`, and `total_probability` per pick, all pre-calculated; the app displays them verbatim (probability to one decimal place). `american_odds` is the source of truth for **payout math only** (§5, §7.1).

---

## 7. Bet Submission Rules

These rules come from the original Sportsbook memo, restated in phase/pick terms per ADR 0001 §10 ("betting round" → **phase**; every wagered pick counts individually). Enforced at submission time:

1. **Per-tournament entry fee:** between $20 and $50, in whole dollars. Set when the participant joins the tournament.
2. **Picks per phase:** minimum 5, maximum 10 pick-placements, in any phase the participant bets in. **Each wagered pick counts individually** — $3 on three "Win Tournament" picks is 3 toward the count. If someone is still under the minimum when the phase closes, admins chase them first (as Pat does today by text); if they stay short, their placed bets simply stand as-is — no voiding, no penalty. *(Resolved: Q3.)*
3. **Bet amounts:** whole dollars only, $1 minimum.
4. **Maximum single bet:** half the participant's entry fee, capped at $20 — applies to every individual pick placement, in either phase. (Example: $40 entry → max $20 single bet. $20 entry → max $10 single bet.) *(Resolved: Q4.)*
5. **Maximum total bet on yourself:** one quarter of the participant's entry fee, capped at $10 — totaled **across the whole tournament**, both phases combined. *(Resolved: Q4.)*
6. **Total wagered:** must equal exactly the participant's entry fee, **summed across both phases combined** — "$40 across the board": a $40 entry buys $40 of total wagering, not $40 per phase. The split between phases is the participant's choice, including wagering everything in Phase 1 and nothing in Phase 2. The exact total must be reached by the time Phase 2 closes. *(Resolved: Q1/Q2.)*
7. **One pick per Match / Group Match:** in the single-pick categories (§6), a participant may wager on only one pick of the bet. Top Finisher / Top X Finisher bets allow wagers on multiple picks.
8. **No betting on your opponent:** in a Match or Group Match where the participant is one of the players, placing on any *other* pick of that bet is **rejected outright** — "players are explicitly not allowed to bet on their opponent."

**Self-pick flagging:** picking *yourself* is allowed but flagged (`requires_admin_review`) for the admin team to eyeball, in every category. Detection uses the pick→player mapping built at import time: pick labels are name-matched against `users.display_name` after stripping stroke suffixes ("(E)", "(-5)"); unmatched picks carry no player link and are listed in the import report (ADR 0001 §11). Indirect self-interest that name-matching can't see remains admin discretion, as today.

### 7.1 Odds Integrity

**Odds are locked at placement time.** Each placement snapshots the pick's odds into `odds_at_placement` at the moment the wager is written, and payouts are computed from that snapshot — never from the current value on the pick. Admins remain free to reprice an open bet by re-uploading the sheet (e.g., odds drifting as golf unfolds), but a reprice only affects *future* placements. Without this, changing a pick's `american_odds` after money is down would silently change every existing bettor's theoretical payout — the classic sportsbook integrity failure.

---

## 8. Lifecycle of a Bet (admin-controlled, not time-based)

*(Rewritten per ADR 0001 §§4–7.)*

Each bet carries one of three statuses, set in the admin's spreadsheet and applied on upload:

```
hidden → open → closed
```

- `hidden`: a placeholder (the old "draft") — the app ignores the bet entirely. Phase 2 bets ship hidden in early uploads.
- `open`: visible to participants; they can place / edit / remove placements on its picks.
- `closed`: no more wagering. The bet and **everyone's placements** (participant, pick, amount) become visible, and stay visible for the rest of the tournament — even bets that drew no action.

**There is no stored "resolved" status.** Resolution lives per **pick** in its `result` column (`pending` / `hit` / `miss` / `push` / `void`), which arrives via the post-round upload. The UI derives a "resolved" presentation: a pick's result is displayed **only when it is not `pending`** — so nothing shows until the round has been completed and its results uploaded. Storing a resolved flag alongside per-pick results would force every upload to keep two representations in sync; deriving it removes that fat-finger class (which is also why the old `resolved ⇔ outcome` CHECK constraint is gone — there is nothing left to desynchronize).

**Phases are the betting windows.** There is no scheduled cutoff — admins flip statuses in the sheet and re-upload:

| When | What |
|---|---|
| Prior to tournament | Phase 1 bets open (Round 1 + Tournament) |
| Thursday morning | Phase 1 closes at Round 1 tee-off |
| Thursday night | Round 1 results uploaded → theoretical payouts + actual-as-it-stands computable |
| Friday night | Phase 2 bets open (Round 3 + updated Tournament odds) |
| Saturday morning | Phase 2 closes at Round 3 tee-off |
| Saturday night | Round 3 results uploaded → all payout calculations final |

### 8.1 Enforcement Timing

Not all of the §7 rules can be checked at the same moment. They split into two groups:

**Per-placement rules — hard-blocked at submission time** (the API rejects the write):

- Bet status must be `open`.
- Amount is a whole dollar, $1 minimum (rule 3).
- Amount ≤ max single bet (rule 4).
- Pick-placement count for the phase ≤ 10 (rule 2 upper bound).
- Running self-bet total across both phases ≤ self-bet cap (rule 5).
- Running wager total **across both phases** ≤ entry fee (rule 6 upper bound — a participant can never *over*-commit).
- Only one pick per Match / Group Match bet (rule 7).
- Not a pick on your opponent in a Match / Group Match you play in (rule 8).

**Phase-completeness rules — can only be evaluated at phase close**, because a participant is legitimately incomplete while still placing bets:

- At least 5 pick-placements in any phase the participant bets in (rule 2 lower bound).
- Total wagered across both phases equals exactly the entry fee — final check at Phase 2 close (rule 6).

**Intended UX for the completeness rules:** while a phase is `open`, the app shows the participant a running total, remaining tournament budget, and a prominent "incomplete" warning (e.g., "You've wagered $23 of $40 — Phase 2 must bring you to exactly $40"). The app never silently fixes anything. Admins get a view of non-compliant participants before closing each phase so they can chase stragglers, exactly as Pat does today by text.

**Consequence of closing with a non-compliant participant** *(resolved: Q3)*: their placed bets stand as-is. No voiding, no auto-adjustment — the chase-then-accept approach mirrors how the pool already works.

### 8.2 Spreadsheet Ingestion (the publishing pipeline)

The bet menu is published and updated by **uploading the admin's spreadsheet** to `/admin/import`, a single admin-gated page — the one exception to the "Supabase Studio is the CMS" convention (ADR 0001 §7). Studio remains the CMS for users, participants, tournament parameters, and data fixes.

**Column contract** (one row per pick; the reference sheet is `docs/import/bets-sample.xlsx`):

`phase` (1|2) · `status` (open|closed|hidden) · `round` (Tournament|Round 1|Round 3) · `category` (the five in §6) · `bet_id` (stable int, not displayed) · `pick_id` (stable int, not displayed) · `bet` (title) · `pick` (label) · `american_odds` · `fractional_odds` · `probability` · `total_probability` · `result` (Pending|Hit|Miss|Push|Void). Helper columns to the right are ignored.

**Behavior:**

- **Upsert, keyed on the sheet's IDs** — `bet_id` for bets, `pick_id` for picks. Re-uploading is the normal workflow (Thursday-night results, Friday-night Phase 2 release, Saturday-night results) and is idempotent.
- **Order-independent** — the importer must not care how rows are sorted; the UI orders by phase → round → category.
- **Pick→player mapping** happens at import: pick labels are name-matched to `users.display_name` (stroke suffixes stripped). Unmatched picks get no player link.
- **Import report** after every upload: rows processed / bets and picks created or updated, unmatched pick names, and warnings — most importantly *odds changed on a bet that already has placements* (harmless for payouts thanks to §7.1, but the admin should know).
- Uploads never touch placements. Wagers are only ever written by participants through the app.

---

## 9. User Stories by Phase

See `ROADMAP.md` for the phased build plan and acceptance criteria. At a high level:

**Participant-facing:**
- As a participant, I can log in via a magic link sent to my email.
- As a participant, I can see the active bet menu — bets grouped by phase, round, and category, each with its picks, odds, and total probability.
- As a participant, I can place wagers on picks totaling exactly my entry fee, respecting all rules in §7.
- As a participant, I can edit or remove my placements while the bet is `open`.
- As a participant, I can see everyone's wagers — who took which pick, and for how much — after the bet closes. (This is the social heart of the pool; it's a first-class feature, not a side effect of visibility rules.)
- As a participant, I can see a personalized rules card: my entry fee, my max single bet, my max self-bet, and my progress toward the 5-pick minimum and exact total.
- As a participant, I can see the current pool total on the dashboard.
- As a participant, I can see each of my picks' results once the round's results are uploaded (never a raw "Pending").
- As a participant, I can see my running theoretical payout and (after the tournament) my final actual share.
- As a participant, I can see the leaderboard pulled from the scoring workbook.

**Admin-facing:**
- As an admin, I can mark a user as a tournament participant for a given year and set their entry fee.
- As an admin, I can publish and update the entire bet menu — bets, picks, odds, statuses, results — by uploading my spreadsheet to `/admin/import`, and read the import report.
- As an admin, I can open, close, and hide bets by editing `status` in the sheet and re-uploading.
- As an admin, I can enter results in my workbook (which computes them) and re-upload after each betting round.
- As an admin, I can review flagged self-picks and approve or reject them.
- As an admin, I can trigger / view the final payout calculation.

---

## 10. Out-of-Scope Decisions Already Made

- **Authentication:** magic-link email via Supabase Auth. No shared passwords. No social SSO. **Email delivery goes through custom SMTP (Resend free tier)** — Supabase's built-in email service is rate-limited to a handful of messages per hour and is for development only; 24 people requesting magic links on tournament morning would fail. Session duration is extended so anyone who logs in during dry-run week stays logged in through the tournament.
- **Odds integrity:** odds are snapshotted onto each placement at write time (`odds_at_placement`, from the pick); payouts use the snapshot. See §7.1.
- **Admin UI:** Supabase Studio is the CMS — **except** `/admin/import`, the spreadsheet upload page (ADR 0001 §7). That page is the only custom admin surface in v1.
- **Audit trail:** placements are soft-deleted (`deleted_at` timestamp), never hard-deleted. When there's a payout dispute, the history exists.
- **Identity:** evergreen accounts across years. One user, many tournaments.
- **Visibility:** strictly behind login.
- **Admins:** Pat, Jake, Steve, Andrew. Stored as a role flag on the user record.
- **Cutoffs:** admin-controlled, not time-based.
- **Payments:** out of scope. App does not track Venmo handles or payment status.
- **Scoring math:** stays in the Excel workbook; app reads via Google Sheets API for display only.

---

## 11. Timeline

- **Tournament:** September 24–26, 2026 (Round 1 Thu · Round 2 Fri · Round 3 Sat; end date pending final confirmation — `OUTSTANDING_DECISIONS.md`).
- **Feature freeze:** ~August 28, 2026 — everything after is testing, bugs, and polish.
- **Fully wrapped:** September 10, 2026 at the latest (two weeks before tee-off), with a group dry run before then.

**Operational risks to manage around the timeline:**

- **Supabase free-tier projects pause after ~1 week of inactivity.** A paused project means login is down. The pre-tournament checklist verifies the project is awake (or we spend $25 on Pro for September and skip the worry).
- **Free tier has no automated backups — and this is money data.** A CSV/`pg_dump` export runs before Round 1 opens and after final payouts, minimum.

Sprint-by-sprint dates live in `ROADMAP.md`.

---

## 12. Stakeholder Decision Log

Three layers, newest governs: Jake's July 9 answers → Pat's July 11 PRD review → **the July 15 architecture rev (this section's A-block + ADR 0001), which is the current source of truth.** Pat's July 11 review anticipated much of the architecture rev (his §6.1 taxonomy proposal became the five categories; his void ruling is A7). The handful of his revisions the July 15 rev did *not* carry (per-tournament 5–10 span, leaderboard drop, user-set display names, betting_enabled/non-player max) are queued for confirmation in `OUTSTANDING_DECISIONS.md`, not silently adopted or discarded.

### Betting architecture rev (July 15, 2026 — ADR 0001)

Pat & Jake's new architecture memo, plus implementation decisions confirmed by Andrew. Full record in `docs/adr/0001-bet-pick-architecture.md`.

| # | Decision |
|---|---|
| A1 | **Bets have picks; wagers attach to picks.** Odds and results live per pick. Five categories (Top Finisher, Top X Finisher, Match, Group Match, Prop Bet) replace the seven resolution types. |
| A2 | **The app never adjudicates.** Results are computed in the admin's Excel workbook and uploaded per pick (`pending`/`hit`/`miss`/`push`/`void`). |
| A3 | **Phases replace betting rounds** as the wagering windows; a bet's `round` is its golf scope (Tournament / Round 1 / Round 3 — nothing released for Round 2). Supersedes Q9. |
| A4 | Bet statuses are **hidden / open / closed** (hidden = the old draft). No stored "resolved" — derived from pick results. Pick results display only when not `pending`. |
| A5 | **Publishing pipeline = spreadsheet upload** to `/admin/import` (the one custom admin page); upsert keyed on the sheet's `bet_id`/`pick_id`; import report; unsorted rows tolerated. Studio remains the CMS for everything else. |
| A6 | **The sheet is authoritative for odds display values** — `fractional_odds`, `probability`, `total_probability` ingested and shown verbatim; `american_odds` drives payout math only. |
| A7 | **Void = stake refunded and removed from the pool** (excluded from theoretical totals; pool = entry fees − voided stakes). Push unchanged (stake returned inside the math). Supersedes the void half of Q6. |
| A8 | **§7 money rules carry over** renamed to phases, counted **per wagered pick** (3 picks on one bet = 3 toward the 5–10 count). |
| A9 | **Match/Group Match:** one pick per participant; betting on your opponent **hard-blocked**; self-picks allowed but flagged — in every category. |
| A10 | **Pick→player mapping by display-name matching at import** (stroke suffixes stripped); unmatched picks reported for admin follow-up. Replaces `bet_subjects`. |
| A11 | **Self-serve identity is a cosmetic nickname, not an editable `display_name`** (Andrew, Jul 19, 2026 — Sprint 15). Members set their own `nickname` + `avatar_url` on `/profile`; `display_name` stays admin-set (Q13) because import name-matching (A10) depends on it. Resolves the `OUTSTANDING_DECISIONS.md` §1 display-name item without touching the matching field. **Refined by A12.** |
| A12 | **Members set their own `display_name` once, at required onboarding; the admin verifies it at approval** (Andrew, Jul 20, 2026 — Sprint 16). Reopens A11's "admin-set only" in a controlled way: the DB guard permits the self-set only while `onboarded_at IS NULL`, then pins `display_name` again (admin-owned for import matching, A10). A member can view the menu on registration but can only **place bets after an admin approves them** on `/admin/participants` — and that approval, which also confirms/corrects the name, is what **creates the `tournament_participants` row** (eligibility stays "row exists," A11's model; no `betting_enabled` column — the `OUTSTANDING_DECISIONS.md` §1 toggle is superseded). |

### Original fifteen questions (Jake, July 9, 2026)

All fifteen questions from Draft v2 were answered by Jake on July 9, 2026 (Q1/Q2 explicitly; Q3–Q15 adopting the proposed defaults); Pat's July 11 review then revised several — where a revision was carried forward it's noted on the row, and the unadopted ones are tracked in `OUTSTANDING_DECISIONS.md`. Read "round" as **phase** throughout (A3/A8).

| # | Decision |
|---|---|
| Q1 | **Entry fee funds both phases combined** — "$40 across the board." A $40 entry buys $40 of total wagering, not $40 per phase. |
| Q2 | Split between phases is the **participant's choice**; wagering $0 in Phase 2 is allowed (each phase they bet in needs ≥5 picks); exact total must be reached by Phase 2 close. |
| Q3 | Under-minimum or off-total at close: **admins chase first; whatever stands, stands.** No voiding, no auto-adjustment. |
| Q4 | Max single bet: **per placement**, either phase. Self-bet cap: **per tournament** (both phases combined). |
| Q5 | App **displays cents**; payment rounding is the payer's business. |
| Q6 | ~~Pushes and voids return the stake and count toward the theoretical total.~~ **Superseded in part by A7** (first revised by Pat, Jul 11): still true for pushes; voids now leave the pool. |
| Q7 | Voids that retroactively drop someone below the 5-pick minimum: **no adjustment.** |
| Q8 | Menu sizing, re-scoped by A1: the reference sheet runs **~13 bets / ~57 picks in Phase 1** — build for that order of magnitude per phase. |
| Q9 | ~~Round mapping: Round 1 → Day 1 + Day 2; Round 2 → Saturday.~~ **Superseded by A3:** phases are the windows; bets scope to Tournament / Round 1 / Round 3. |
| Q10 | **"The field" picks exist**; displayed like any other pick, no player link — so backing the field is never flagged as a self-pick, even if you're in the field *(Pat, Jul 11)*. |
| Q11 | Aggregate money per bet is **hidden while the bet is open**; visible after close. |
| Q12 | After close, **everyone's individual amounts are visible** — not just who bet on what. |
| Q13 | Display names are **admin-set in Studio** for v1 — they feed the importer's name-matching (ADR 0001 §11), so they stay admin-controlled. **Refined by A11, then A12** (member sets it once at onboarding; admin verifies at approval and owns it thereafter). |
| Q14 | **Non-playing bettors are supported** (exempt from the self-bet rule); expect 0–2. |
| Q15 | Leaderboard mirrors **one Google Sheets tab, "Sportsbook Leaderboard," updated after each day.** ~~Original columns: player, thru, score, position.~~ **Revised (Pat, Jul 21):** the tab Pat built has eight columns — Position, Player, Round 1 Points, Round 2 Points, Total Points, Starting Strokes, Round 3 Score, Final Score. The last three are to-par values displayed with the sheet's `+0;-0;"E"` number format (positive `+N`, negative `-N`, zero `E`, blank when not yet scored). The app reads the tab read-only and renders it verbatim — it never computes standings. |

### Defaults already taken (not blocking — speak up only to change)

- No career P/L across tournaments in v1 — per-tournament only.
- No notifications when Phase 2 bets are released — Pat texts the group chat, as today.
