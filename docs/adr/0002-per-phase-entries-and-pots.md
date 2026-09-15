# ADR 0002 — Per-Phase Entries, Per-Phase Pots, and the Entry Request

- **Status:** Accepted
- **Date:** 2026-09-14
- **Deciders:** Pat (the rules); Andrew (the money model's edge rulings and every implementation choice)
- **Sources:** Pat's rewritten rules after the Sept 4, 2026 user test; Andrew's answers to the Sprint 30 planning questions (recorded in `docs/sprints/sprint-30.md`)
- **Supersedes:** PRD §7 rules 1, 2, 4, 5 and 6 as they stood; §12 Q1, Q2 (money half), Q4 (self-bet half), A8's per-phase restatement, A14, and A18's single-entry trigger. ADR 0001 §10's money rules.

---

## Context

Under ADR 0001 one entry fee funded both phases ("$40 across the board", Q1), the split between phases was the bettor's choice (Q2), the pick minimum spanned the tournament (A14), and one pari-mutuel split paid out the whole pool.

The Sept 4 user test broke that model in practice. Most testers (Ethan, Alex, Devin, …) spent their whole $20 in Phase 1. That was legal, and it left them nothing for Phase 2 — the half of the weekend with the most information in it — and, for anyone short of five picks, a minimum they could no longer reach. Pat's rewrite:

> Phases 1 and 2 are now more separated. $20 minimum and $50 maximum for each phase. 5 bet minimum for each phase, no maximum. Phase 1 and Phase 2 will now become separate pots. […] Any money left on the table that is below the minimum $20 bet amount will be forfeited to the pool. […] If someone exceeds the $20 minimum but doesn't reach their entry, that difference will be refunded. […] Simplify maximum single bet to $10. Simplify maximum total bet on yourself to a quarter of your total phase entry if that total entry is fully submitted.

Two asks rode along: refuse an upload whose `Match` bet doesn't have exactly two picks ("that's usually a mistake on my end"), and a one-time in-app entry request so entries stop being a text to Pat.

---

## Decision

### 1. Each phase is its own entry and its own pot

A member has an entry **per phase** — `tournament_participants.phase1_entry_fee` and `phase2_entry_fee`, whole dollars, NULL meaning *not entered in that phase*. The bounds (`tournaments.entry_fee_min` / `entry_fee_max`, $20 / $50) apply to each phase separately, and a member may enter one phase, the other, or both.

Eligibility to wager on a bet is **a live participant row** (A13) **and** a non-null entry for that bet's phase. A bet in a phase the bettor isn't entered in renders read-only with a sentence, and the API refuses it by name (403).

Each phase has its own pari-mutuel split. There is no combined split: the **Combined** standings are the per-person sum of the two phase results.

### 2. The money model, per bettor *i*, per phase *p*

```
E        the phase entry (NULL → not in pot p)
W        Σ live placement amounts in p, voids included
C        min(E, max(W, entry_fee_min))       committed — funds the pot
R        E − C                               refunded, unwagered (out of band)
F        max(0, C − W)                       forfeited — in the pot, no wager behind it
S        Σ live self-pick amounts in p       (0 for a non-player, Q14/A15)
cap      floor(max_self_bet_pct × W)         the self line AT CLOSE
k        S > 0 ? min(1, cap / S) : 1
F_self   S × (1 − k)                         self stake over the line — in the pot, earns nothing
theo'_j  theoretical_j × (self_j ? k : 1)
ref'_j   refunded_j    × (self_j ? k : 1)
pool_p   Σ_i C_i − Σ_i ref'_i
actual_i Σ theo' > 0 ? theo'_i / Σ theo' × pool_p : 0
cash_i   actual_i + ref'_i + R_i
P/L_i    cash_i − E_i
```

Three identities hold per pot **and** combined, and `lib/payouts.test.ts`, `scripts/dry-run-verify.ts` and `scripts/sim-pool-verify.ts` assert all three:

1. `Σ E = pool + Σ ref' + Σ R` — every dollar in is the pool or comes back.
2. `Σ actual = pool` whenever `Σ theo' > 0` — every dollar in the pool is paid out.
3. `E + P/L = cash` on every row.

Pat's worked example is the model's acceptance test: a **$50 entry, $20 wagered, $12 on yourself** commits $20, refunds $30, recognises $5 of the self-bets (a quarter of $20) and forfeits $7 of them to the pot. A **$50 entry with nothing wagered** forfeits $20 and refunds $30.

Edge rulings (Andrew, Sept 14):

- **The $20 floor is committed either way.** Money under it left unwagered forfeits; money above it comes back. This is Andrew's reading of "left on the table below the minimum" — the first `entry_fee_min` of an entry is in the pot the moment it's entered.
- **The self-bet line at close is a quarter of what was actually wagered**, not of the entry — "if that total entry is fully submitted" read as: the full quarter-of-entry only counts once the entry is fully wagered. Under $20 wagered it is still 25 % of wagered.
- **Placement-time self cap is a quarter of the phase entry, floored, with no hard cap** ($20 → $5, $25 → $6, $40 → $10, $50 → $12). `max_self_bet_cap` is dropped. A bettor can therefore place self-bets that don't fully count until they wager the rest; the slip bar, `/my-bets` and the chase list all say so.
- **Several self picks are scaled pro-rata** by `k`. Theoretical payout is linear in stake, so scaling each self pick's theoretical and void refund by `k` is exact. A void on a scaled self pick refunds `amount × k`: the forfeit is fixed at close and results never reopen it (Q7's spirit).
- **A pick-minimum shortfall costs nothing by itself** — warn, chase, and whatever stands, stands (Q3).
- **A pot where nothing hit** (`Σ theo' = 0`) has nothing to divide by; the board says so and the money's fate is an open question for Pat (`OUTSTANDING_DECISIONS.md`).
- **Revoked** members leave both pots, entries and wagers together (A13). **A wager in a phase with no entry** belongs to no pot; it is dropped from the split and badged on `/admin/view`.

### 3. The rules, as the app enforces them

Per placement, hard-blocked (`lib/validation.ts`):

1. The bet is open and its phase's deadline hasn't passed.
2. The bettor has an entry for the bet's phase.
3. Whole dollars, $1 minimum.
4. **At most `tournaments.max_single_bet` ($10), flat** — the same at every entry.
5. Self-pick total **in the phase** ≤ `floor(max_self_bet_pct × phase entry)` (players only).
6. Running total **in the phase** ≤ the phase entry.
7. One pick per Match / Group Match; never on your opponent (unchanged).

There is **no pick maximum** any more. `min_picks_per_phase` (5) is a completeness rule, evaluated per phase, never blocking.

`phaseStanding()` is the one source of truth for where a bettor stands in a phase — wagered, pick count, committed, forfeit, refund, the self-bet line, and an ordered list of issues. The `/bets` slip bar, `/my-bets` banners, the dashboard alerts, the chase list (`lib/chase.ts`, mirrored by `docs/admin/phase-compliance.sql`) and the payout split all read it.

### 4. Two triggers, both locked

A18's lesson stands: an aggregate rule enforced by read-sum-write is a race. Migration `20260914000000` rewrites `enforce_placement_total()` to re-sum **per phase** under the same `FOR UPDATE` lock on the participant row, raising `OZ001`: *"Over your $N Phase P entry — that's the most you can wager in Phase P."* — the exact sentence `validateRunningTotal()` returns.

Per-phase entries open a second race A18 couldn't have: an admin lowering an entry while a wager lands. A new `enforce_participant_entry()` (BEFORE INSERT OR UPDATE OF the two entry columns) refuses an entry below what is already wagered in that phase, raising `OZ002`: *"Can't set the Phase P entry to $N — they already have $W wagered in Phase P. Remove those wagers first."* The UPDATE's own row lock serialises it against the placement trigger's `FOR UPDATE` in either order. Both honour `ozark.restoring` so a snapshot restore isn't refused mid-transaction.

### 5. The entry request

A member asks for their entry **once**, in the app: a total, a slider splitting it between the phases (snapping to splits both halves of which are within bounds, or $0 to sit a phase out), and "I'm playing in the tournament". A phase whose deadline has passed can't be asked for. The form confirms with a warning that it can't be changed, then hands off to Venmo — `https://venmo.com/u/AndrewLong99`, memo **golf**. It is offered after the walkthrough in onboarding (skippable), and from the dashboard's entry tile and the My Bets budget, both of which carry a warning icon until money is asked for or recorded.

The request is its **own table**, `entry_requests`, not columns on the participant row. A12 makes the participant row *the* eligibility record and admins its only writers; a request is what the member asked for, the participant row is what an admin recorded. "Once" is the database's promise — `UNIQUE (tournament_id, user_id)` and no member UPDATE or DELETE policy — not the form's. The dollar bounds are app-validated (rules are data): a hand-crafted insert can produce an odd request, never money, because the admin approves what actually arrived. `/admin/people` shows the request on the row and prefills both entries and the playing flag from it.

**"Money added"** means a request exists **or** the participant row carries any entry, so an admin recording a Venmo that arrived without a request also clears the warning and closes the form.

**Payment is entirely by Venmo to Andrew.** The tournament-deposit deduction in PRD §1 is retired, which closes `OUTSTANDING_DECISIONS.md` §3. The app still moves no money; the link is a constant.

### 6. Where the standings live

**`/standings`, labelled "Leaderboard" in the nav**, between My Bets and Roster. The route is not `/leaderboard`: that is the Google-Sheets golf board, kept deliberately (`OUTSTANDING_DECISIONS.md` §2b.4), and reusing it would reverse that call silently. The page and the completed dashboard (A20) render the **same** board, with a Phase 1 / Phase 2 / Combined toggle.

**A phase's standings render only once every published bet in it is closed** (`phaseRevealed()`). RLS hides other members' open-bet rows (Q11), so a split computed before then is computed from the rows a viewer happens to be allowed to see — wrong money. Until then the tab shows the pot (Σ entries, readable by everyone) and says when the standings arrive.

### 7. The importer

- **A `Match` bet with anything other than two picks rejects the upload**, naming the bet and its rows. Group Match is deliberately not counted (open question for Pat).
- **A bet or pick carrying wagers that the sheet moves to the other phase rejects the upload.** A wager moving pots is a change to two pools that no trigger can see.

### 8. Rollout: expand → migrate → contract

Per the doctrine in `20260812000000_drop_min_picks_per_phase.sql`:

- **A** `20260914000000_per_phase_entries.sql` and **A2** `20260914000001_entry_requests.sql` are additive and go to production **before** the merge.
- Production's entries and wagers were placed under the old rules. They are **reset, not migrated** (Andrew): snapshot, delete the 2026 wagers, clear every entry and recorded payment, keep participant rows and verified names, snapshot again. Members then go through the request form.
- **B** `20260914000002_drop_single_entry_columns.sql` drops `entry_fee` and the five retired rule columns **after** the deploy is green. A save state taken before A carries `entry_fee` and no phase columns; restoring one after B brings participants back with no entries (`docs/DATA_SAFETY.md`).

---

## Consequences

- **Two pots are two reconciliations.** Every money surface — the standings board, `/admin/view`, the backup manifest, the restore script, the dry run and the 32-member simulation — reports per phase, and the identities are asserted per pot and combined.
- **Forfeits are real money the app now computes.** Before this ADR the app never decided that anyone lost money for something they didn't do; now an entry left unwagered costs up to $20 and the self-bet line can cost more. That is why every surface that shows a shortfall names its price while the phase is still open, and why the chase list at each close covers everyone entered in that phase — including the member who paid and never opened the menu.
- **The self-bet line moves.** A bettor within their placement cap can still see "only $5 of your $12 on yourself counts" until they wager more. It is a warning, not a refusal, by design.
- **An admin can't quietly change a phase's money after it's wagered.** Lowering an entry below its wagers (OZ002) and moving a wagered bet between phases (the importer) are both refused; the fix is explicit — remove the wagers first.
- **Entries stop being a text.** The request is the audit trail of what a member asked for; `paid_amount` (A17) stays what an admin says came in; neither is an input to the split.
