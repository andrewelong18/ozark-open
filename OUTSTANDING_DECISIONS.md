# Outstanding Decisions

Decisions still genuinely open after Pat's July 2026 PRD review. Everything Pat
answered outright is already folded into `PRD.md` §12 and the body docs; this
file holds only the items that still need a stakeholder call or a design meeting
before the affected code can be built. Keep it short — resolve items here, then
move the decision into `PRD.md` §12 and delete the row.

Legend: **Owner** = who needs to decide · **Blocks** = what can't proceed until then.

---

## 1. Bet taxonomy restructure (category / subcategory / group) — needs a design meeting
**Owner:** Pat + Jake · **Blocks:** any rework of the Phase 3 bet model; parts of Sprints 1–2 validation.

Pat proposed reorganizing bets (PRD §6.1) and said "there's a good chance we will
need to meet to talk this over." Recorded as a proposal only; the live schema and
the seven `resolution_type`s stand until this is settled. Still to decide:

- Final top-level category set — **Final Tournament / Round 1 / Round 3** — and the two-stage release (Stage 1: Final Tournament + Round 1; Stage 2: append Final Tournament + Round 3).
- The **subcategory** list and each one's selection rule (Winner-Top-Finisher & Top-X allow multiple picks; Head-to-Head-2/3+ allow one player; Prop = one bet per group).
- **`group_id`** semantics (multiple independent groups per subcategory) and how it maps onto the existing `bets` columns / spreadsheet.
- How the new subcategories map onto the existing seven `resolution_type`s (reuse, rename, or add).
- **Round naming:** reconcile "betting Round 2" (current schema `round_number ∈ {1,2}`) with Pat's golf-round "Round 3." Day 2 (Friday scramble) is excluded (Q9).
- The **full 2026 bet menu** — Pat and Jake still need to brainstorm the actual bets (the current seven are a dev-time sample).

**Decided so far:** two betting rounds, Day 1 → Round 1 and Day 3 → Round 2/"Round 3"; Day 2 not covered; ~70–100 bets/round (Q8, Q9).

---

## 2. Stricter betting maximum for non-playing bettors
**Owner:** Pat + Jake · **Blocks:** `lib/validation.ts` non-player path (Sprint 1); the `betting_enabled` / non-player limit modeling in `tournament_participants`.

Pat: non-playing participants "should have a stricter betting max limit." No number
or formula was given. Need: the actual cap (a flat dollar amount? a lower
`max_single`/`max_self`? a lower entry ceiling?) and whether it's a per-tournament
param or a per-participant override.

**Decided so far:** non-players are supported (any number; expect 0–5), exempt from
the self-bet rule, and admins can enable/disable betting per user (Q14).

---

## 3. How a void affects the pool math (money-critical)
**Owner:** Pat · **Blocks:** `placement_payouts_view` + `lib/payouts.ts` (Sprints 5–6).

Pat: a void means "the bet does not count and the entry for that bet is returned to
the bettor and removed from the pool." The docs encode this as: voided stake is
refunded to the bettor **and** subtracted from `pool_total`
(`pool_total = Σ(entry_fee) − Σ(void refunds)`), so voided dollars earn no share and
don't inflate the denominator (PRD §5, DATA_MODEL §4). This is the natural reading,
but the exact arithmetic wasn't spelled out — **confirm before Sprint 6** since it
changes everyone's final payout.

**Decided so far:** push counts (stake returned); void does not count; void stake is
refunded (Q6).

---

## 4. Entry collection mechanism
**Owner:** Pat (+ tournament treasurer) · **Blocks:** nothing in the app (payments are out of band) — documentation accuracy only.

Pat: "I would say the minimum entry ($20) can be deducted from the deposit. Extra
should prolly be collected by other means (Venmo/Cash)." Phrased tentatively.
Confirm the split is firm so `PRD.md` §1/§10 and `README.md` state it correctly.
The app tracks no payment status regardless.

---

## 5. "Non-Goals — see word doc for more" (Pat §3)
**Owner:** Pat · **Blocks:** nothing — clarification only.

Pat's section-3 note points to the Word doc "for more," but the stakeholder-questions
doc contains no Non-Goals content (verified — no tracked comments, no such section).
Ask Pat what he intended to add so `PRD.md` §3 can capture it.

---

## 6. Tournament end date — confirm Sept 26 (was 24–27)
**Owner:** Pat · **Blocks:** nothing — factual accuracy.

The PRD/ROADMAP previously read "September 24–27"; corrected to **24–26** to match the
three-day structure (Day 1 Thu 24 · Day 2 Fri 25 scramble · Day 3 Sat 26) and Pat's
own stakeholder-doc header ("September 24–26, 2026"). Confirm 26 is right — revert if
"27" was intentional (e.g., a travel/awards day).
