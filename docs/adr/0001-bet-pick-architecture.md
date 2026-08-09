# ADR 0001 — Two-Level Bet/Pick Architecture, Phases, and Spreadsheet Ingestion

- **Status:** Accepted
- **Date:** 2026-07-15
- **Deciders:** Pat & Jake (betting structure); Andrew (implementation choices)
- **Sources:** "Sportsbook New Betting Architecture.docx" (Pat & Jake's memo, July 2026) and `bets.xlsx` (the reference spreadsheet — checked in as `docs/import/bets-sample.xlsx`)

---

## Context

The original PRD modeled each bet as a single row with one set of American odds and one bet-level outcome, resolved by the app according to seven `resolution_type` rules. Pat and Jake have since hashed out how the betting will actually run and delivered (1) a memo defining the structure and (2) a spreadsheet showing exactly what the admin will maintain and submit to the app.

The spreadsheet is the admin's native tool — odds, probabilities, and results are all computed there (helper columns adjudicate outcomes). The app's job shifts from *adjudicating bets* to *collecting wagers and faithfully displaying what the spreadsheet says*.

This memo is the design meeting that Pat's July 11 PRD review called for: his proposed category/subcategory/`group_id` taxonomy (old PRD §6.1, "Spike A") evolved into the structure below, and his void ruling is confirmed in §9. Pat's July 11 revisions that this rev did **not** carry forward (5–10 count span, leaderboard drop, user-set display names, `betting_enabled`) were queued in `OUTSTANDING_DECISIONS.md` #1 for explicit confirm-or-supersede; all but the leaderboard have since been resolved — see §10 below and PRD §12 A12–A15.

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

#### 5a. The phase clock — amended Aug 2026 (Sprint 25 / [#106](https://github.com/andrewelong18/ozark-open/issues/106))

This rev made the spreadsheet upload the **only** writer of `bets.status`, deliberately. The Jul 31 dry run found the cost: the tournament's clock lives outside the app, so Phase 1 closes when Pat is at a tee box with his phone, by hand. Sprint 25 adds scheduled and manual closes — which would be a second and third writer to one field, and that is the part worth getting right.

**The scheduler does not write `bets.status`. Nothing but the upload ever does.** Instead, the `tournaments` row carries a deadline per phase, and wagering is gated on both:

```
wagering allowed on a bet  ⇔  bet.status = 'open'  AND  its phase's deadline hasn't passed
```

Three consequences, which are the three questions this amendment exists to answer:

- **A sheet that says `open` after the deadline does not reopen betting.** The upload still only ever *opens* a bet; the clock only ever *closes* a phase. They cannot contradict each other because they aren't the same field — closed wins, and the admin's upload is not silently reverted either. The importer's stale-open warning (Sprint 22 / [#97](https://github.com/andrewelong18/ozark-open/issues/97)) already flags that sheet shape from the sheet's own evidence; it gains the clock-informed case alongside it.
- **The blast radius is one row, not thirteen.** A phase-level timestamp gives the countdown and the dashboard indicator something real to read, instead of both re-deriving "is betting open" from every bet row and disagreeing with each other — which is exactly the [#107](https://github.com/andrewelong18/ozark-open/issues/107) bug.
- **A close is reversible, because it is a timestamp and not a mutation.** Push the deadline out or clear it and the phase reopens; no bet row was touched, so nothing has to be reconstructed. Closing early is the same operation with the deadline set to now.

There is **no scheduler process, no cron, no job runner**. A phase "closes itself" because every read compares `now()` to a stored timestamp — the feature is two timestamps and a flag on `tournaments`, and adding machinery to it would be the mistake.

`tournaments.status` remains what it always was: a lifecycle flag that lights the dashboard badge and unlocks `/results`. It has never gated betting and still doesn't (gameplan landmine #2). Flipping it to `completed` is now guarded — see PRD §8.1.

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

- ~~Min 5 / max 10 **pick-placements per phase**~~ — **amended Jul 31, 2026 (PRD §12 A14, Sprint 22):** the two bounds have different spans. **Minimum 5 across both phases combined**, evaluated only before Phase 2 closes; **maximum 10 per phase**, hard-blocked at submission. Reading both as per-phase made a bettor who used both phases owe ≥10 picks, contradicting Q2's promise that the split is theirs. Either way each pick wagered on counts individually ($3 on three "Win Tournament" picks = 3 bets toward the count).
- Entry fee funds **both phases combined**; exact total due by Phase 2 close.
- Single-bet cap applies **per pick placement**; self-bet cap totals across the tournament. (Both unchanged.)

### 11. Pick→player mapping by name-match on import

To flag self-picks and hard-block opponent picks, the importer maps each pick to a player: strip stroke suffixes (`(E)`, `(-5)`, `(-10)`) and match the remaining text against `users.display_name`. Unmatched picks ("Field", "Yes"/"No", typos, players without accounts yet) get no player link and are listed in the import report for admin follow-up in Studio. This replaces the `bet_subjects` table with a nullable `player_user_id` on each pick.

- **Self-pick** = placing on a pick whose player is you → allowed, sets `requires_admin_review`.
- **Opponent pick** (Match/Group Match) = you are one of the bet's players and you place on a *different* pick's player → **rejected server-side**.

### 12. Odds snapshot at placement is unchanged

Each placement still snapshots odds at write time (`odds_at_placement`, now from the pick), and payouts compute from the snapshot — never from the live pick row. Admins repricing an open bet via re-upload affects future placements only (PRD §7.1).

### 13. Admin-placed wagers — added Aug 2026 (Sprint 23 / [#101](https://github.com/andrewelong18/ozark-open/issues/101))

Some members will not get through the magic-link flow. Pat asked to enter their wagers himself, and every §7 rule then has two candidate identities where it used to have one. This section fixes which is which **before** the code exists, because the failure mode is silent: a wager that passes validation and is wrong.

**Bettor and actor are separate, and only one of them is the subject of the rules.**

```
bettor  = whose money it is   → every §7 rule, every limit, requires_admin_review
actor   = who typed it in     → recorded, and nothing else
```

`bet_placements.user_id` stays the bettor, unchanged — it is what the pool math, the payout view and every compliance read already mean by "whose wager is this". A new nullable `placed_by_user_id` records the actor, and **NULL means the bettor entered it themselves**, which is the truth for every row written before this section existed. No backfill, and no second meaning for `user_id`.

Four things follow, none of them negotiable:

- **The rules evaluate against the bettor.** `validatePlacement` already takes a `PlacementContext` built from a `Bettor`, so the shape was right; what was wrong is that the identity came from `auth.getUser()` at the call site. Identity becomes an explicit parameter of one shared write path, used by both routes. The entry fee, the running total, the self-bet cap, the opponent block and `requires_admin_review` are all identity-sensitive, and a §7 message that says "your" refers to the **bettor's** entry, not the admin's.
- **Writing for another user is a server route behind an admin gate, never a loosened member policy.** The own-rows `user_id = auth.uid()` policies are untouched. A separate, admin-scoped INSERT/UPDATE policy pair carries `public.is_admin() AND placed_by_user_id = auth.uid()` — so the database itself refuses a forged attribution, rather than trusting the route to be honest about who acted. `is_admin()` is the same boundary that already lets admins read every placement.
- **Odds still snapshot at write.** Nothing about acting on behalf touches §12 or PRD §7.1. The admin path reuses the same `planWrite` that the member path does, including the insert/update/revive semantics and the soft delete.
- **Eligibility is still the bettor's.** A revoked participant cannot be wagered for (`revoked_at IS NULL`, PRD §12 A13), and a phase that has closed by the clock stays closed for admins too (§5a) — an admin gate is permission to act *for* someone, not permission to break the tournament's own rules.

**What this does not add:** admin creation of member accounts. `public.users.id` references `auth.users(id)` and the app holds only the anon key, so an account with no email round-trip needs either a service-role key in the runtime or a definer function writing GoTrue's own tables. That is a security-posture decision of its own and is deliberately not made here. **Made in §14 below (Aug 9, 2026).**

### 14. Admin-created accounts — added Aug 2026 (Sprint 23 / [#124](https://github.com/andrewelong18/ozark-open/issues/124))

§13 deferred exactly one thing, and this is it. §13 gave Pat the ability to *bet* for a member; it did nothing for a member who has no account, which is the same person §13 was written for. The Thursday-morning failure is concrete: ~32 people, three of them can't get through magic-link, and the admin has the wager tool and no way to create them.

**Decision: an admin-gated server route creates a real Supabase auth account with a service-role key.** `POST /api/admin/members` → `auth.admin.createUser({ email, email_confirm: true })`. `email_confirm` marks the address confirmed **without sending anything**, which is what "no email round-trip" means here.

**The three rejected alternatives**, because each fails on something specific rather than on taste:

| Option | Fails on |
|---|---|
| `SECURITY DEFINER` function inserting `auth.users` + `auth.identities`, gated on `is_admin()` | Hand-writing GoTrue's internal schema. It cannot be verified anywhere we can run it — every local harness stubs `auth` with a fake schema, so a green round trip proves nothing about real GoTrue — and a Supabase auth upgrade can break it silently, mid-tournament. No new secret was the only thing it had going for it. |
| Shadow users — drop the `auth.users` FK, generate a uuid | **The member can never cleanly claim the account.** Their real login would hit the `email` UNIQUE constraint and make `handle_new_user()` throw, breaking their sign-in outright. A merge path means `ON UPDATE CASCADE` on all five FKs to `users.id`, including `bet_placements` — surgery on money data, six weeks out. |
| Admin-triggered invite (the app sends the magic link) | It is still an email round-trip. It doesn't solve the stated problem. |

**Why A wins on the thing that matters: claiming is free.** The account genuinely *is* the member's. If they later work out the magic link, they sign in to that same account and their entry fee, display name and wagers are all there. Every other option strands something.

**The integrity properties of §13 all carry over, because nothing about the *wagering* path changes.** The rules still evaluate against the bettor, `placed_by_user_id` still records the actor, RLS is not loosened — an admin-created member is an ordinary member from the moment the account exists.

Three things this decision adds on its own:

- **Creating an account grants nothing.** Approval remains a separate call to `POST /api/admin/participants`, which owns the entry fee and creates the `tournament_participants` row whose existence — with `revoked_at IS NULL` — *is* betting eligibility (PRD §12 A12/A13). The pool math has one source of truth, and it isn't this route.
- **An account-level audit trail**, mirroring `placed_by_user_id`: `users.created_by_user_id` records which admin created the account. NULL means self-registered, true of every pre-existing row. No backfill.
- **`onboarded_at` is stamped at creation.** Left NULL, the member would land in the first-run onboarding gate, where `guard_users_self_update` permits a one-time self-set of `display_name` — mid-tournament, on the field `lib/import.ts` matches picks by (§11, PRD §12 A10). The admin has already named them, so onboarding is done and the name stays admin-owned.

**The cost, recorded rather than buried.** This puts a full-bypass credential in the production runtime for the first time. `DATA_MODEL.md` §5 argued against it and Sprint 11 chose pg_cron over Vercel Cron specifically to avoid it; that reasoning stands and is overridden once, for the one feature with no alternative. The containment is four properties (`server-only`, a single importer asserted by a test, one call, never `NEXT_PUBLIC_`) and is documented in `DATA_MODEL.md` §5.1 and `lib/supabase/admin.ts`.

**The residual risk, stated plainly: a typo'd email is a real, confirmed account.** If an admin creates `dna@x.com` and that address exists, its owner could request a magic link and reach that member's wagers. This is inherent to any model where the account is claimable by email — it is the same exposure the ordinary registration flow has, moved from the member to the admin. Mitigated by making the email admin-correctable and by the form's copy saying so, not by a mechanism.

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
