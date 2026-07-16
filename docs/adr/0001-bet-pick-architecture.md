# ADR 0001 — Two-Level Bet/Pick Architecture, Phases, and Spreadsheet Ingestion

- **Status:** Accepted
- **Date:** 2026-07-15
- **Deciders:** Pat & Jake (betting structure); Andrew (implementation choices)
- **Sources:** "Sportsbook New Betting Architecture.docx" (Pat & Jake's memo, July 2026) and `bets.xlsx` (the reference spreadsheet — checked in as `docs/import/bets-sample.xlsx`)

---

## Context

The original PRD modeled each bet as a single row with one set of American odds and one bet-level outcome, resolved by the app according to seven `resolution_type` rules. Pat and Jake have since hashed out how the betting will actually run and delivered (1) a memo defining the structure and (2) a spreadsheet showing exactly what the admin will maintain and submit to the app.

The spreadsheet is the admin's native tool — odds, probabilities, and results are all computed there (helper columns adjudicate outcomes). The app's job shifts from *adjudicating bets* to *collecting wagers and faithfully displaying what the spreadsheet says*.

This memo is the design meeting that Pat's July 11 PRD review called for: his proposed category/subcategory/`group_id` taxonomy (old PRD §6.1, "Spike A") evolved into the structure below, and his void ruling is confirmed in §9. Pat's July 11 revisions that this rev did **not** carry forward (5–10 count span, leaderboard drop, user-set display names, `betting_enabled`) are queued in `OUTSTANDING_DECISIONS.md` #1 for explicit confirm-or-supersede.

This ADR memorializes the resulting structure and the implementation decisions Andrew confirmed on July 15, 2026. It supersedes parts of PRD §6/§8 (Draft v3) and entries in the §12 decision log (noted below).

---

## Decision

### 1. Bets have picks; wagers attach to picks

A **bet** (e.g. "Win Tournament") is a menu heading with a shared question. Its **picks** are the individual options (each player, "Field", "Yes"/"No", …). Each pick carries its own odds and its own result. Participants wager on picks, not bets.

The spreadsheet contract (one row per pick):

| Column | Meaning |
|---|---|
| `phase` | 1 or 2 — which betting window the bet belongs to |
| `status` | `open` / `closed` / `hidden` — see §5 |
| `round` | Golf scope: `Tournament`, `Round 1`, or `Round 3` |
| `category` | One of the five categories — see §2 |
| `bet_id` | Stable integer ID of the bet (not displayed) |
| `pick_id` | Stable integer ID of the pick (not displayed) |
| `bet` | Bet title shown in the app (not necessarily unique) |
| `pick` | Pick label shown in the app, incl. stroke notation ("Steve Jones (-5)") |
| `american_odds` | e.g. `+400` / `-130` — the source of truth for payout math |
| `fractional_odds` | Display string, as formatted in the sheet |
| `probability` | Implied probability, as calculated in the sheet (display to 1 decimal place) |
| `total_probability` | Sum of pick probabilities for the bet — displayed per bet, informational |
| `result` | `Pending` / `Hit` / `Miss` / `Push` / `Void` — per pick |
| helper columns | Excel-internal; ignored on import |

### 2. Five bet categories replace the seven resolution types

| Category | Picks per participant | Ties | Self-pick | Opponent pick |
|---|---|---|---|---|
| **Top Finisher** (winner of round/tournament) | multiple allowed | hit | flagged for admin review | n/a |
| **Top X Finisher** (e.g. Top 4) | multiple allowed | hit | flagged for admin review | n/a |
| **Match** (head-to-head, straight up or with strokes) | **one only** | push | flagged for admin review | **prohibited — hard block** |
| **Group Match** (3+ players, straight up or with strokes) | **one only** | hit | flagged for admin review | **prohibited — hard block** |
| **Prop Bet** | per bet's option list | manual | n/a (usually no player subject) | n/a |

The tie rules are **informational**: the app never adjudicates. They document how Pat's Excel arrives at each pick's result.

### 3. Resolution math lives in Excel, not the app

Results (`hit`/`miss`/`push`/`void`) are computed in the admin's workbook (its helper columns) and arrive per pick via spreadsheet upload. The app stores and displays them; it contains **no resolution engine**. The `resolution_type` machinery (seven-category seed, planned per-type payout cases) is deleted. `bet_categories` survives only as display/constraint data (name, whether multiple picks are allowed).

### 4. Phases are the betting windows; "round" is the bet's golf scope

- **Phase 1:** opens before the tournament; closes at Round 1 tee-off (Thursday morning).
- **Phase 2:** opens Friday night after Round 2; closes at Round 3 tee-off (Saturday morning).
- **Round** (on each bet) is what the bet is about: the whole **Tournament**, **Round 1**, or **Round 3**. No bets are released for Round 2, by policy (the schema permits it; nothing else does).

This replaces the old "betting Round 1 / Round 2" concept and supersedes decision Q9's round mapping. Itinerary:

| When | What |
|---|---|
| Prior to tournament | Phase 1 bets open (Round 1 + Tournament) |
| Thursday morning | Phase 1 closes at Round 1 tee-off |
| Thursday night | Round 1 results uploaded; theoretical + as-it-stands payouts computable |
| Friday night | Phase 2 bets open (Round 3 + updated Tournament) |
| Saturday morning | Phase 2 closes at Round 3 tee-off |
| Saturday night | Round 3 results uploaded; all payout calculations final |

### 5. Bet status is `hidden` / `open` / `closed`; "resolved" is derived, not stored

- `hidden` — placeholder (the new "draft"); the app ignores the bet entirely. Phase 2 bets ship hidden in early uploads.
- `open` — participants can place/edit/remove wagers.
- `closed` — no more wagering; the bet and **everyone's placements** (participant, pick, amount) become visible, and stay visible for the rest of the tournament even if the bet drew no action.

There is **no stored `resolved` status**. Resolution lives per-pick in `result`; the UI derives a "resolved" presentation (bet closed + results non-pending). Storing it separately would force every upload to keep two representations in sync — the same fat-finger class the old `(status = 'resolved') = (outcome IS NOT NULL)` CHECK existed to prevent.

### 6. Result display gating

A pick's result is displayed **only when it is not `pending`**. Pending results are hidden — this satisfies the memo's "the app should not display the result if the round in question has not been completed and inputted," because non-pending results only ever arrive via the post-round upload.

### 7. Publishing pipeline: admin spreadsheet upload

Admins publish and update the bet menu by uploading the spreadsheet (xlsx/CSV) to a single admin-gated page, **`/admin/import`**. The app validates the column contract, **upserts** by the sheet-native keys (`bet_id` for bets, `pick_id` for picks), and shows an import report (row counts; unmatched pick names; warnings such as odds changed on a bet that already has placements). Re-uploads at each itinerary point (Thursday night results, Friday night Phase 2 release, Saturday night results) are the normal workflow and must be idempotent. The importer must tolerate unsorted rows; the UI orders by phase → round → category.

This is the **single exception** to the "Supabase Studio is the CMS, no custom admin UI" convention. Studio remains the CMS for users, participants, tournament parameters, and data fixes.

### 8. The sheet is authoritative for odds display values

`fractional_odds`, `probability`, and `total_probability` are calculated in the sheet and are ingested and displayed **verbatim** — the app does not recompute them. `american_odds` remains the source of truth for **payout math only** (it is what gets snapshotted into `odds_at_placement`). The `lib/odds.ts` display converters are retired.

### 9. Void semantics (supersedes decision Q6, void half)

- **Push:** stake is returned *inside* the theoretical-payout math (theoretical payout = stake); pool unchanged. (Q6 behavior, kept.)
- **Void:** stake is refunded and **removed from the pool**: it is excluded from theoretical totals and subtracted from the pool total — `pool_total = sum(entry fees) − sum(voided stakes)`. The refund itself is handled out of band (Venmo), like all money movement.

### 10. Money rules carry over, renamed to phases, counted per pick

The PRD §7 rules survive with "betting round" → "phase":

- Min 5 / max 10 **pick-placements per phase** — each pick wagered on counts individually ($3 on three "Win Tournament" picks = 3 bets toward the count).
- Entry fee funds **both phases combined**; exact total due by Phase 2 close.
- Single-bet cap applies **per pick placement**; self-bet cap totals across the tournament. (Both unchanged.)

### 11. Pick→player mapping by name-match on import

To flag self-picks and hard-block opponent picks, the importer maps each pick to a player: strip stroke suffixes (`(E)`, `(-5)`, `(-10)`) and match the remaining text against `users.display_name`. Unmatched picks ("Field", "Yes"/"No", typos, players without accounts yet) get no player link and are listed in the import report for admin follow-up in Studio. This replaces the `bet_subjects` table with a nullable `player_user_id` on each pick.

- **Self-pick** = placing on a pick whose player is you → allowed, sets `requires_admin_review`.
- **Opponent pick** (Match/Group Match) = you are one of the bet's players and you place on a *different* pick's player → **rejected server-side**.

### 12. Odds snapshot at placement is unchanged

Each placement still snapshots odds at write time (`odds_at_placement`, now from the pick), and payouts compute from the snapshot — never from the live pick row. Admins repricing an open bet via re-upload affects future placements only (PRD §7.1).

---

## Consequences

- **Schema rework** (new Sprint 1): `bets` is restructured (sheet IDs, phase, round scope, three statuses, `total_probability`; drops `american_odds`, `outcome`, `bet_number`); new `bet_picks` table; `bet_subjects` dropped; `bet_categories` re-seeded with the five categories; `tournaments` rule params renamed to per-phase.
- **`bet_placements`** (future) references picks, not bets.
- **One custom admin page** (`/admin/import`) enters scope — new Sprint 2 — amending the no-admin-UI convention.
- **The payout view** computes from `bet_picks.result` and `odds_at_placement`, with void stakes surfaced separately so `lib/payouts.ts` can shrink the pool.
- **Sprints 1–6 of the July roadmap are re-planned**; the Phase 3 bet menu (built on the one-odds-per-bet schema) needs rework.
- **PRD §12 decisions Q6 (void half) and Q9 (round mapping) are superseded**; Q8's menu sizing is re-scoped to bets-and-picks-per-phase.
- **The July 11 roadmap spikes are closed:** Spike A (bet-taxonomy meeting) by this ADR; Spike B (void → pool math) by §9. `OUTSTANDING_DECISIONS.md` shrinks accordingly; its #1 now tracks the Pat-review items awaiting confirm-or-supersede.
- The app never adjudicates a bet. If a result is wrong, the fix is in Excel and re-uploaded — not patched in the database.
