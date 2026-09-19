// Unit tests for lib/validation.ts against the PRD worked examples
// (§7 rules 1–8, §8.1 enforcement split, §12 Q3/Q10/Q14, and Sprint 30's
// per-phase model — ADR 0002, A25).
// Zero-dependency by design: node:test via
//   npm run test  →  node --experimental-strip-types --test lib/validation.test.ts

import test from "node:test"
import assert from "node:assert/strict"
import {
  isSelfPick,
  maxSelfBet,
  maxSingleBet,
  phaseEntry,
  phaseStanding,
  phaseStandings,
  validateAmount,
  validateBetOpen,
  validateEntryFee,
  validateMaxSingleBet,
  validateOpponentBlock,
  validatePhaseEntry,
  validatePlacement,
  validateRunningTotal,
  validateSelfBetTotal,
  validateSinglePickCategory,
  type Bettor,
  type ExistingPlacement,
  type PlacementContext,
  type TournamentRules,
} from "./validation.ts"

// The 2026 values after migration 20260914000000 (Pat's Sept 2026 rules).
const rules: TournamentRules = {
  entry_fee_min: 20,
  entry_fee_max: 50,
  min_picks_per_phase: 5,
  max_single_bet: 10,
  max_self_bet_pct: 0.25,
}

const ME = "user-me"
const OPPONENT = "user-opponent"

function bettor(overrides: Partial<Bettor> = {}): Bettor {
  return {
    user_id: ME,
    is_player: true,
    phase1_entry_fee: 40,
    phase2_entry_fee: 40,
    ...overrides,
  }
}

function ctx(overrides: {
  bettor?: Partial<Bettor>
  pick?: Partial<PlacementContext["pick"]>
  bet?: Partial<PlacementContext["bet"]>
  existing?: ExistingPlacement[]
}): PlacementContext {
  return {
    bettor: bettor(overrides.bettor),
    pick: { id: "pick-target", player_user_id: null, ...overrides.pick },
    bet: {
      id: "bet-target",
      status: "open",
      phase: 1,
      // The clock is stamped by buildPlacementContext in the real path; here
      // the default is "deadline not reached" so every other rule is tested
      // against a live phase (Sprint 25 / #106).
      phase_closed: false,
      allows_multiple_picks: true,
      pick_player_user_ids: [null],
      ...overrides.bet,
    },
    existing: overrides.existing ?? [],
  }
}

function placement(overrides: Partial<ExistingPlacement>): ExistingPlacement {
  return {
    pick_id: "pick-x",
    bet_id: "bet-x",
    phase: 1,
    amount: 1,
    pick_player_user_id: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Rule 1 — a phase entry
// ---------------------------------------------------------------------------

test("entry fee: whole dollars within tournament bounds, per phase", () => {
  assert.equal(validateEntryFee(20, rules), null)
  assert.equal(validateEntryFee(40, rules), null)
  assert.equal(validateEntryFee(50, rules), null)
  assert.match(validateEntryFee(19, rules)!, /between \$20 and \$50/)
  assert.match(validateEntryFee(51, rules)!, /between \$20 and \$50/)
  assert.match(validateEntryFee(40.5, rules)!, /whole-dollar/)
  // Named when the caller says which phase — the people console has two boxes.
  assert.equal(validateEntryFee(15, rules, 2), "Phase 2 entry must be between $20 and $50.")
})

test("phaseEntry reads the right column and treats a missing one as not entered", () => {
  const b = bettor({ phase1_entry_fee: 30, phase2_entry_fee: null })
  assert.equal(phaseEntry(b, 1), 30)
  assert.equal(phaseEntry(b, 2), null)
  // PostgREST may hand back strings; coerced, and a zero is "not entered".
  assert.equal(phaseEntry({ phase1_entry_fee: "25" as unknown as number, phase2_entry_fee: 0 }, 1), 25)
  assert.equal(phaseEntry({ phase1_entry_fee: 25, phase2_entry_fee: 0 }, 2), null)
})

// ---------------------------------------------------------------------------
// Rule 3 — whole dollars, $1 minimum
// ---------------------------------------------------------------------------

test("amount: whole dollars only, $1 minimum", () => {
  assert.equal(validateAmount(1), null)
  assert.equal(validateAmount(20), null)
  assert.match(validateAmount(2.5)!, /whole dollars/)
  assert.match(validateAmount(0)!, /Minimum bet is \$1/)
  assert.match(validateAmount(-3)!, /Minimum bet is \$1/)
})

// ---------------------------------------------------------------------------
// Rule 4 — the flat max single bet ("simplify maximum single bet to $10")
// ---------------------------------------------------------------------------

test("max single bet: $10 flat at every entry", () => {
  assert.equal(maxSingleBet(rules), 10)
  assert.equal(validateMaxSingleBet(10, rules), null)
  assert.equal(validateMaxSingleBet(11, rules), "Max single bet is $10.")
  // The rule is a parameter, not a constant.
  assert.equal(validateMaxSingleBet(11, { ...rules, max_single_bet: 15 }), null)
})

// ---------------------------------------------------------------------------
// Sprint 30 — you can only wager in a phase you are entered in
// ---------------------------------------------------------------------------

test("phase entry: a Phase 2 pick with no Phase 2 entry is refused", () => {
  const c = ctx({ bettor: { phase2_entry_fee: null }, bet: { phase: 2 } })
  assert.equal(validatePhaseEntry(c), "You're not entered in Phase 2.")
  // …and the same bettor is fine in Phase 1.
  assert.equal(validatePhaseEntry(ctx({ bettor: { phase2_entry_fee: null } })), null)
})

test("phase entry: the caps stand aside when there is no entry (one complaint, not three)", () => {
  const c = ctx({
    bettor: { phase2_entry_fee: null },
    bet: { phase: 2 },
    pick: { player_user_id: ME },
  })
  assert.equal(validateSelfBetTotal(c, 5, rules), null)
  assert.equal(validateRunningTotal(c, 5), null)
  const result = validatePlacement(c, 5, rules)
  assert.ok(!result.ok)
  assert.deepEqual(result.errors, ["You're not entered in Phase 2."])
})

// ---------------------------------------------------------------------------
// Rule 5 — self-bet total per phase, a quarter of the PHASE entry, no cap
// ---------------------------------------------------------------------------

test("self-bet cap: $40 entry allows $10 total on yourself", () => {
  assert.equal(maxSelfBet(40, rules), 10)
  const c = ctx({ pick: { player_user_id: ME } })
  assert.equal(validateSelfBetTotal(c, 10, rules), null)
  assert.equal(
    validateSelfBetTotal(c, 11, rules),
    "Max total on yourself is $10 for your $40 Phase 1 entry — this would put you at $11."
  )
})

test("self-bet cap: no hard cap any more — $50 allows $12, $20 allows $5", () => {
  assert.equal(maxSelfBet(50, rules), 12)
  assert.equal(maxSelfBet(20, rules), 5)
  const c = ctx({ bettor: { phase1_entry_fee: 50 }, pick: { player_user_id: ME } })
  assert.equal(validateSelfBetTotal(c, 12, rules), null)
  assert.match(validateSelfBetTotal(c, 13, rules)!, /\$12 for your \$50 Phase 1 entry/)
})

test("self-bet cap: counts only THIS phase — the other phase has its own", () => {
  const existing = [
    placement({ pick_id: "self-1", phase: 1, amount: 6, pick_player_user_id: ME }),
    placement({ pick_id: "self-2", phase: 2, amount: 9, pick_player_user_id: ME }),
    placement({ pick_id: "other", phase: 1, amount: 10, pick_player_user_id: OPPONENT }),
  ]
  const c = ctx({ pick: { player_user_id: ME }, existing })
  assert.equal(validateSelfBetTotal(c, 4, rules), null) // 6 + 4 = 10 in Phase 1
  assert.match(validateSelfBetTotal(c, 5, rules)!, /at \$11/)
  // Phase 2 already carries $9 of its own $10.
  const c2 = ctx({ pick: { player_user_id: ME }, existing, bet: { phase: 2 } })
  assert.equal(validateSelfBetTotal(c2, 1, rules), null)
  assert.match(validateSelfBetTotal(c2, 2, rules)!, /Phase 2 entry — this would put you at \$11/)
})

test("self-bet cap: editing a self placement replaces its amount", () => {
  const existing = [
    placement({ pick_id: "pick-target", amount: 8, pick_player_user_id: ME }),
  ]
  const c = ctx({ pick: { id: "pick-target", player_user_id: ME }, existing })
  assert.equal(validateSelfBetTotal(c, 10, rules), null)
})

test("self-bet cap: non-playing bettors are exempt (Q14)", () => {
  const c = ctx({ bettor: { is_player: false }, pick: { player_user_id: ME } })
  assert.equal(validateSelfBetTotal(c, 40, rules), null)
})

test("self-pick flag: never for unlinked picks like Field (Q10)", () => {
  assert.equal(isSelfPick(null, ME), false)
  assert.equal(isSelfPick(ME, ME), true)
  assert.equal(isSelfPick(OPPONENT, ME), false)
})

// ---------------------------------------------------------------------------
// Rule 6 upper bound — running total per phase ≤ that phase's entry
// ---------------------------------------------------------------------------

test("running total: capped at the PHASE entry; the other phase doesn't count", () => {
  const existing = [
    placement({ pick_id: "p1", phase: 1, amount: 20 }),
    placement({ pick_id: "p2", phase: 1, amount: 15 }),
    placement({ pick_id: "p3", phase: 2, amount: 35 }),
  ]
  const c = ctx({ existing })
  assert.equal(validateRunningTotal(c, 5), null) // exactly $40 in Phase 1
  assert.equal(
    validateRunningTotal(c, 6),
    "Over your $40 Phase 1 entry — that's the most you can wager in Phase 1."
  )
  const c2 = ctx({ existing, bet: { phase: 2 } })
  assert.equal(validateRunningTotal(c2, 5), null)
  assert.match(validateRunningTotal(c2, 6)!, /Over your \$40 Phase 2 entry/)
})

test("running total: same-pick edit replaces the old amount", () => {
  const existing = [
    placement({ pick_id: "pick-target", amount: 10 }),
    placement({ pick_id: "p2", amount: 25 }),
  ]
  const c = ctx({ pick: { id: "pick-target" }, existing })
  assert.equal(validateRunningTotal(c, 15), null) // 25 + 15 = 40
  assert.notEqual(validateRunningTotal(c, 16), null)
})

test("running total: the sentence matches the trigger's, word for word", () => {
  // migration 20260914000000 raises OZ001 with this text; lib/placement-write.ts
  // maps it to the same 400. If either side changes, both must.
  const c = ctx({ bettor: { phase1_entry_fee: 20 }, existing: [placement({ pick_id: "p1", amount: 15 })] })
  assert.equal(
    validateRunningTotal(c, 15),
    "Over your $20 Phase 1 entry — that's the most you can wager in Phase 1."
  )
})

// ---------------------------------------------------------------------------
// Rule 7 — one pick per Match / Group Match
// ---------------------------------------------------------------------------

test("single-pick category: second pick of the same Match is rejected", () => {
  const existing = [placement({ pick_id: "pick-a", bet_id: "bet-target" })]
  const c = ctx({
    bet: { allows_multiple_picks: false },
    existing,
  })
  assert.equal(
    validateSinglePickCategory(c),
    "This bet allows only one pick per participant."
  )
})

test("single-pick category: editing your one pick is fine", () => {
  const existing = [placement({ pick_id: "pick-target", bet_id: "bet-target" })]
  const c = ctx({ bet: { allows_multiple_picks: false }, existing })
  assert.equal(validateSinglePickCategory(c), null)
})

test("multi-pick category: several picks of one Top X bet are fine", () => {
  const existing = [
    placement({ pick_id: "pick-a", bet_id: "bet-target" }),
    placement({ pick_id: "pick-b", bet_id: "bet-target" }),
  ]
  const c = ctx({ existing })
  assert.equal(validateSinglePickCategory(c), null)
})

// ---------------------------------------------------------------------------
// Rule 8 — opponent hard-block
// ---------------------------------------------------------------------------

test("opponent block: betting on the other pick of your Match is rejected", () => {
  const c = ctx({
    pick: { player_user_id: OPPONENT },
    bet: {
      allows_multiple_picks: false,
      pick_player_user_ids: [ME, OPPONENT],
    },
  })
  assert.equal(
    validateOpponentBlock(c),
    "You can't bet on your opponent in a match you're playing in."
  )
})

test("opponent block: your own pick in your Match is allowed (and flagged)", () => {
  const c = ctx({
    pick: { player_user_id: ME },
    bet: { allows_multiple_picks: false, pick_player_user_ids: [ME, OPPONENT] },
  })
  assert.equal(validateOpponentBlock(c), null)
  const result = validatePlacement(c, 5, rules)
  assert.deepEqual(result, { ok: true, requires_admin_review: true })
})

test("opponent block: a Group Match you're not in is open to you", () => {
  const c = ctx({
    pick: { player_user_id: OPPONENT },
    bet: {
      allows_multiple_picks: false,
      pick_player_user_ids: [OPPONENT, "user-third", "user-fourth"],
    },
  })
  assert.equal(validateOpponentBlock(c), null)
})

test("opponent block: doesn't apply in multi-pick categories", () => {
  // Top Finisher listing the bettor among its picks — betting on someone else is fine
  const c = ctx({
    pick: { player_user_id: OPPONENT },
    bet: { allows_multiple_picks: true, pick_player_user_ids: [ME, OPPONENT] },
  })
  assert.equal(validateOpponentBlock(c), null)
})

// ---------------------------------------------------------------------------
// §8.1 — bet must be open; orchestrator
// ---------------------------------------------------------------------------

test("bet status: hidden and closed bets reject wagers", () => {
  const live = { phase: 1, phase_closed: false } as const
  assert.equal(validateBetOpen({ status: "open", ...live }), null)
  assert.match(validateBetOpen({ status: "closed", ...live })!, /not open/)
  assert.match(validateBetOpen({ status: "hidden", ...live })!, /not open/)

  // The deadline closes wagering even on a bet the sheet still calls open —
  // the two gates are independent, and the message says which one bit.
  assert.match(
    validateBetOpen({ status: "open", phase: 1, phase_closed: true })!,
    /^Phase 1 is closed — the deadline has passed\.$/
  )
  assert.match(
    validateBetOpen({ status: "open", phase: 2, phase_closed: true })!,
    /^Phase 2 is closed/
  )
})

test("validatePlacement: a legal wager passes with no review flag", () => {
  const c = ctx({ existing: [placement({ pick_id: "p1", amount: 5 })] })
  assert.deepEqual(validatePlacement(c, 10, rules), {
    ok: true,
    requires_admin_review: false,
  })
})

test("validatePlacement: no pick maximum any more — an 11th pick in a phase is fine", () => {
  const eleven = Array.from({ length: 11 }, (_, i) =>
    placement({ pick_id: `pick-${i}`, phase: 1, amount: 1 })
  )
  const c = ctx({ existing: eleven })
  assert.deepEqual(validatePlacement(c, 1, rules), { ok: true, requires_admin_review: false })
})

test("validatePlacement: collects every violated rule", () => {
  const c = ctx({
    bettor: { phase1_entry_fee: 20 },
    pick: { player_user_id: OPPONENT },
    bet: {
      status: "closed",
      allows_multiple_picks: false,
      pick_player_user_ids: [ME, OPPONENT],
    },
    existing: [placement({ pick_id: "pick-a", bet_id: "bet-target", amount: 10 })],
  })
  const result = validatePlacement(c, 11, rules)
  assert.equal(result.ok, false)
  assert.ok(!result.ok)
  assert.deepEqual(result.errors, [
    "This bet is not open for wagering.",
    "Max single bet is $10.",
    "Over your $20 Phase 1 entry — that's the most you can wager in Phase 1.",
    "This bet allows only one pick per participant.",
    "You can't bet on your opponent in a match you're playing in.",
  ])
})

// ---------------------------------------------------------------------------
// The phase standing (§8.1 second group — never blocking; ADR 0002's money)
// ---------------------------------------------------------------------------

function picks(count: number, phase: 1 | 2, amount = 1, player: string | null = null): ExistingPlacement[] {
  return Array.from({ length: count }, (_, i) =>
    placement({ pick_id: `p${phase}-${i}`, bet_id: `b${phase}-${i}`, phase, amount, pick_player_user_id: player })
  )
}

test("standing: a complete phase — the minimum met, the entry wagered, nothing forfeited", () => {
  const s = phaseStanding(picks(5, 1, 8), 40, 1, rules)
  assert.equal(s.wagered, 40)
  assert.equal(s.pick_count, 5)
  assert.equal(s.committed, 40)
  assert.equal(s.forfeit, 0)
  assert.equal(s.refund, 0)
  assert.equal(s.complete, true)
  assert.deepEqual(s.issues, [])
})

test("standing: the other phase's wagers never count", () => {
  const s = phaseStanding([...picks(5, 1, 8), ...picks(3, 2, 10)], 40, 1, rules)
  assert.equal(s.wagered, 40)
  assert.equal(s.pick_count, 5)
})

test("standing: Pat's example — $50 entered, $20 wagered, $12 on yourself → $5 counts, $30 back", () => {
  const existing = [
    placement({ pick_id: "self", phase: 1, amount: 12, pick_player_user_id: ME }),
    ...picks(4, 1, 2),
  ]
  const s = phaseStanding(existing, 50, 1, rules, { bettor_user_id: ME })
  assert.equal(s.wagered, 20)
  assert.equal(s.self_total, 12)
  assert.equal(s.self_cap, 12) // legal at placement time: floor(0.25 × 50)
  assert.equal(s.self_cap_effective, 5) // floor(0.25 × 20)
  assert.equal(s.self_recognized, 5)
  assert.equal(s.self_forfeit, 7)
  assert.equal(s.committed, 20)
  assert.equal(s.forfeit, 0)
  assert.equal(s.refund, 30)
  assert.equal(s.complete, false)
  assert.deepEqual(
    s.issues.map((i) => [i.code, i.tone]),
    [
      ["self", "warning"],
      ["refund", "info"],
    ]
  )
  assert.equal(
    s.issues[0].message,
    "Only $5 of your $12 on yourself counts until you've wagered $48 in Phase 1."
  )
  assert.equal(s.issues[1].message, "$30 of your Phase 1 entry comes back unless you wager it.")
})

test("standing: under the $20 minimum — the gap forfeits, the rest comes back", () => {
  // $50 entered, $12 wagered: $20 committed ($8 with no wager behind it),
  // $30 refunded.
  const s = phaseStanding(picks(3, 1, 4), 50, 1, rules)
  assert.equal(s.wagered, 12)
  assert.equal(s.committed, 20)
  assert.equal(s.forfeit, 8)
  assert.equal(s.refund, 30)
  assert.deepEqual(
    s.issues.map((i) => i.code),
    ["picks", "forfeit"]
  )
  assert.equal(s.issues[0].message, "2 more picks needed in Phase 1 (3 of 5).")
  assert.equal(
    s.issues[1].message,
    "$8 forfeits to the Phase 1 pot unless you wager it — once you've wagered anything, the first $20 of an entry is committed."
  )
})

test("standing: entered and never wagered — the whole entry comes back (A28)", () => {
  // Wagering nothing at all is never having entered: the floor needs a wager
  // behind it, so nothing is committed and nothing forfeits.
  const s = phaseStanding([], 50, 1, rules)
  assert.equal(s.committed, 0)
  assert.equal(s.forfeit, 0)
  assert.equal(s.refund, 50)
  assert.equal(s.issues[0].message, "5 more picks needed in Phase 1 (0 of 5).")
  // At the minimum entry the whole thing comes back too — there is no floor
  // to keep when no wager was placed against it.
  const min = phaseStanding([], 20, 1, rules)
  assert.equal(min.committed, 0)
  assert.equal(min.forfeit, 0)
  assert.equal(min.refund, 20)
})

test("standing: the first wagered dollar commits the floor — the A28 cliff", () => {
  // $1 wagered against a $50 entry: the floor bites in full, so $19 forfeits
  // and $30 comes back. One dollar less and the whole $50 would come back.
  // Deliberate (PRD §12 A28), not an accident of the arithmetic.
  const s = phaseStanding(picks(1, 1, 1), 50, 1, rules)
  assert.equal(s.wagered, 1)
  assert.equal(s.committed, 20)
  assert.equal(s.forfeit, 19)
  assert.equal(s.refund, 30)
})

test("standing: over the $20 minimum but under the entry — refunded, no forfeit", () => {
  const s = phaseStanding(picks(5, 1, 5), 40, 1, rules)
  assert.equal(s.wagered, 25)
  assert.equal(s.committed, 25)
  assert.equal(s.forfeit, 0)
  assert.equal(s.refund, 15)
  assert.equal(s.complete, false)
  assert.deepEqual(s.issues.map((i) => [i.code, i.tone]), [["refund", "info"]])
})

test("standing: the self cap at close is a share of what was WAGERED, even under $20", () => {
  // $6 on yourself was legal at a $40 entry ($10 cap); with only $12 wagered,
  // floor(0.25 × 12) = $3 counts.
  const existing = [
    placement({ pick_id: "self", phase: 1, amount: 6, pick_player_user_id: ME }),
    ...picks(3, 1, 2),
  ]
  const s = phaseStanding(existing, 40, 1, rules, { bettor_user_id: ME })
  assert.equal(s.self_cap_effective, 3)
  assert.equal(s.self_recognized, 3)
  assert.equal(s.self_forfeit, 3)
})

test("standing: the self picks of a non-player never count as self (A15)", () => {
  const existing = [placement({ pick_id: "self", phase: 1, amount: 12, pick_player_user_id: ME }), ...picks(4, 1, 2)]
  const s = phaseStanding(existing, 50, 1, rules, { bettor_user_id: ME, is_player: false })
  assert.equal(s.self_total, 0)
  assert.equal(s.self_forfeit, 0)
})

test("standing: a hand-edited row over its entry is flagged, never negative", () => {
  const s = phaseStanding(picks(5, 1, 10), 40, 1, rules)
  assert.equal(s.wagered, 50)
  assert.equal(s.over_entry, true)
  assert.equal(s.committed, 40)
  assert.equal(s.forfeit, 0)
  assert.equal(s.refund, 0)
  assert.equal(s.complete, false)
  assert.equal(s.issues[0].code, "over")
})

test("standing: pick shortfall costs no money — the minimum is chase-only (Q3)", () => {
  const s = phaseStanding(picks(2, 1, 20), 40, 1, rules)
  assert.equal(s.wagered, 40)
  assert.equal(s.forfeit, 0)
  assert.equal(s.refund, 0)
  assert.equal(s.meets_pick_minimum, false)
  assert.equal(s.complete, false)
  assert.deepEqual(s.issues.map((i) => i.code), ["picks"])
})

test("phaseStandings: one standing per entered phase, none for a phase sat out", () => {
  const b = bettor({ phase1_entry_fee: 20, phase2_entry_fee: null })
  const all = phaseStandings(picks(5, 1, 4), b, rules)
  assert.equal(all[1]?.complete, true)
  assert.equal(all[2], undefined)
})
