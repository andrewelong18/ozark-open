// Unit tests for lib/validation.ts against the PRD worked examples
// (§7 rules 1–8, §8.1 enforcement split, §12 Q2/Q3/Q4/Q10/Q14).
// Zero-dependency by design: node:test via
//   npm run test  →  node --experimental-strip-types --test lib/validation.test.ts

import test from "node:test"
import assert from "node:assert/strict"
import {
  checkPhaseMinimums,
  checkTournamentTotal,
  isSelfPick,
  maxSelfBet,
  maxSingleBet,
  validateAmount,
  validateBetOpen,
  validateEntryFee,
  validateMaxSingleBet,
  validateOpponentBlock,
  validatePhasePickCount,
  validatePlacement,
  validateRunningTotal,
  validateSelfBetTotal,
  validateSinglePickCategory,
  type ExistingPlacement,
  type PlacementContext,
  type TournamentRules,
} from "./validation.ts"

// The 2026 seed values (supabase/migrations/20260507000001_tournaments.sql)
const rules: TournamentRules = {
  entry_fee_min: 20,
  entry_fee_max: 50,
  min_picks_per_phase: 5,
  max_picks_per_phase: 10,
  max_single_bet_pct: 0.5,
  max_single_bet_cap: 20,
  max_self_bet_pct: 0.25,
  max_self_bet_cap: 10,
}

const ME = "user-me"
const OPPONENT = "user-opponent"

function ctx(overrides: {
  entry_fee?: number
  is_player?: boolean
  pick?: Partial<PlacementContext["pick"]>
  bet?: Partial<PlacementContext["bet"]>
  existing?: ExistingPlacement[]
}): PlacementContext {
  return {
    bettor: {
      user_id: ME,
      entry_fee: overrides.entry_fee ?? 40,
      is_player: overrides.is_player ?? true,
    },
    pick: { id: "pick-target", player_user_id: null, ...overrides.pick },
    bet: {
      id: "bet-target",
      status: "open",
      phase: 1,
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
// Rule 1 — entry fee
// ---------------------------------------------------------------------------

test("entry fee: whole dollars within tournament bounds", () => {
  assert.equal(validateEntryFee(20, rules), null)
  assert.equal(validateEntryFee(40, rules), null)
  assert.equal(validateEntryFee(50, rules), null)
  assert.match(validateEntryFee(19, rules)!, /between \$20 and \$50/)
  assert.match(validateEntryFee(51, rules)!, /between \$20 and \$50/)
  assert.match(validateEntryFee(40.5, rules)!, /whole-dollar/)
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
// Rule 4 — max single bet (PRD §7 worked figures: $40 → $20, $20 → $10)
// ---------------------------------------------------------------------------

test("max single bet: $40 entry allows $20", () => {
  assert.equal(maxSingleBet(40, rules), 20)
  assert.equal(validateMaxSingleBet(20, 40, rules), null)
  assert.equal(
    validateMaxSingleBet(21, 40, rules),
    "Max single bet is $20 for your $40 entry."
  )
})

test("max single bet: $20 entry allows $10", () => {
  assert.equal(maxSingleBet(20, rules), 10)
  assert.equal(validateMaxSingleBet(10, 20, rules), null)
  assert.equal(
    validateMaxSingleBet(11, 20, rules),
    "Max single bet is $10 for your $20 entry."
  )
})

test("max single bet: $50 entry hits the $20 hard cap", () => {
  assert.equal(maxSingleBet(50, rules), 20)
  assert.match(validateMaxSingleBet(25, 50, rules)!, /\$20 for your \$50 entry/)
})

test("max single bet: fractional midpoint floors ($25 entry → $12)", () => {
  assert.equal(maxSingleBet(25, rules), 12)
  assert.equal(validateMaxSingleBet(12, 25, rules), null)
  assert.notEqual(validateMaxSingleBet(13, 25, rules), null)
})

// ---------------------------------------------------------------------------
// Rule 2 upper bound — picks per phase, each wagered pick counts (A8)
// ---------------------------------------------------------------------------

test("phase pick count: 11th pick in a phase is rejected", () => {
  const ten = Array.from({ length: 10 }, (_, i) =>
    placement({ pick_id: `pick-${i}`, phase: 1 })
  )
  const c = ctx({ existing: ten })
  assert.match(validatePhasePickCount(c, rules)!, /Phase 1 is full — 10 picks max/)
})

test("phase pick count: the other phase doesn't count", () => {
  const ten = Array.from({ length: 10 }, (_, i) =>
    placement({ pick_id: `pick-${i}`, phase: 1 })
  )
  const c = ctx({ existing: ten, bet: { phase: 2 } })
  assert.equal(validatePhasePickCount(c, rules), null)
})

test("phase pick count: editing an already-wagered pick is not an 11th", () => {
  const ten = Array.from({ length: 10 }, (_, i) =>
    placement({ pick_id: `pick-${i}`, phase: 1 })
  )
  const c = ctx({ existing: ten, pick: { id: "pick-3" } })
  assert.equal(validatePhasePickCount(c, rules), null)
})

test("multi-pick counting: $3 on three picks of one bet = 3 toward the count", () => {
  // Seven other picks + three picks of the same "Win Tournament" bet = 10
  const existing = [
    ...Array.from({ length: 7 }, (_, i) => placement({ pick_id: `pick-${i}` })),
    ...Array.from({ length: 3 }, (_, i) =>
      placement({ pick_id: `win-${i}`, bet_id: "bet-win", amount: 3 })
    ),
  ]
  const c = ctx({ existing })
  assert.match(validatePhasePickCount(c, rules)!, /Phase 1 is full/)
})

// ---------------------------------------------------------------------------
// Rule 5 — self-bet total across the tournament ($40 → $10, $20 → $5)
// ---------------------------------------------------------------------------

test("self-bet cap: $40 entry allows $10 total on yourself", () => {
  assert.equal(maxSelfBet(40, rules), 10)
  const c = ctx({ pick: { player_user_id: ME } })
  assert.equal(validateSelfBetTotal(c, 10, rules), null)
  assert.equal(
    validateSelfBetTotal(c, 11, rules),
    "Max total on yourself is $10 for your $40 entry — this would put you at $11."
  )
})

test("self-bet cap: totals across both phases combined", () => {
  const existing = [
    placement({ pick_id: "self-1", phase: 1, amount: 4, pick_player_user_id: ME }),
    placement({ pick_id: "self-2", phase: 2, amount: 4, pick_player_user_id: ME }),
    placement({ pick_id: "other", phase: 1, amount: 10, pick_player_user_id: OPPONENT }),
  ]
  const c = ctx({ pick: { player_user_id: ME }, existing })
  assert.equal(validateSelfBetTotal(c, 2, rules), null) // 4 + 4 + 2 = 10
  assert.match(validateSelfBetTotal(c, 3, rules)!, /at \$11/)
})

test("self-bet cap: $20 entry allows $5", () => {
  assert.equal(maxSelfBet(20, rules), 5)
  const c = ctx({ entry_fee: 20, pick: { player_user_id: ME } })
  assert.equal(validateSelfBetTotal(c, 5, rules), null)
  assert.notEqual(validateSelfBetTotal(c, 6, rules), null)
})

test("self-bet cap: editing a self placement replaces its amount", () => {
  const existing = [
    placement({ pick_id: "pick-target", amount: 8, pick_player_user_id: ME }),
  ]
  const c = ctx({ pick: { id: "pick-target", player_user_id: ME }, existing })
  assert.equal(validateSelfBetTotal(c, 10, rules), null)
})

test("self-bet cap: non-playing bettors are exempt (Q14)", () => {
  const c = ctx({ is_player: false, pick: { player_user_id: ME } })
  assert.equal(validateSelfBetTotal(c, 40, rules), null)
})

test("self-pick flag: never for unlinked picks like Field (Q10)", () => {
  assert.equal(isSelfPick(null, ME), false)
  assert.equal(isSelfPick(ME, ME), true)
  assert.equal(isSelfPick(OPPONENT, ME), false)
})

// ---------------------------------------------------------------------------
// Rule 6 upper bound — running total across both phases ≤ entry fee
// ---------------------------------------------------------------------------

test("running total: capped at the entry fee across both phases", () => {
  const existing = [
    placement({ pick_id: "p1", phase: 1, amount: 20 }),
    placement({ pick_id: "p2", phase: 2, amount: 15 }),
  ]
  const c = ctx({ existing })
  assert.equal(validateRunningTotal(c, 5), null) // exactly $40
  assert.match(validateRunningTotal(c, 6)!, /Over your \$40 entry/)
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
  assert.equal(validateBetOpen("open"), null)
  assert.match(validateBetOpen("closed")!, /not open/)
  assert.match(validateBetOpen("hidden")!, /not open/)
})

test("validatePlacement: a legal wager passes with no review flag", () => {
  const c = ctx({ existing: [placement({ pick_id: "p1", amount: 5 })] })
  assert.deepEqual(validatePlacement(c, 10, rules), {
    ok: true,
    requires_admin_review: false,
  })
})

test("validatePlacement: collects every violated rule", () => {
  const c = ctx({
    entry_fee: 20,
    pick: { player_user_id: OPPONENT },
    bet: {
      status: "closed",
      allows_multiple_picks: false,
      pick_player_user_ids: [ME, OPPONENT],
    },
    existing: [placement({ pick_id: "pick-a", bet_id: "bet-target", amount: 15 })],
  })
  const result = validatePlacement(c, 11, rules)
  assert.equal(result.ok, false)
  assert.ok(!result.ok)
  assert.deepEqual(result.errors, [
    "This bet is not open for wagering.",
    "Max single bet is $10 for your $20 entry.",
    "Over your $20 entry — that's the most you can wager across both phases.",
    "This bet allows only one pick per participant.",
    "You can't bet on your opponent in a match you're playing in.",
  ])
})

// ---------------------------------------------------------------------------
// Phase-completeness (§8.1 second group — never blocking)
// ---------------------------------------------------------------------------

test("phase minimums: under 5 picks in a phase you bet in is reported", () => {
  const existing = [
    ...Array.from({ length: 3 }, (_, i) => placement({ pick_id: `p1-${i}`, phase: 1 })),
    ...Array.from({ length: 5 }, (_, i) =>
      placement({ pick_id: `p2-${i}`, phase: 2 as const })
    ),
  ]
  const report = checkPhaseMinimums(existing, rules)
  assert.equal(report.length, 2)
  assert.deepEqual(report[0], {
    phase: 1,
    pick_count: 3,
    meets_minimum: false,
    message: "Only 3 of the 5 minimum picks in Phase 1.",
  })
  assert.equal(report[1].meets_minimum, true)
  assert.equal(report[1].message, null)
})

test("phase minimums: a phase with zero placements is fine (Q2)", () => {
  const existing = Array.from({ length: 5 }, (_, i) =>
    placement({ pick_id: `p-${i}`, phase: 1 })
  )
  const report = checkPhaseMinimums(existing, rules)
  assert.equal(report.length, 1)
  assert.equal(report[0].phase, 1)
  assert.equal(report[0].meets_minimum, true)
})

test("tournament total: $23 of $40 is incomplete with the §8.1 banner text", () => {
  const existing = [
    placement({ pick_id: "p1", amount: 20 }),
    placement({ pick_id: "p2", amount: 3 }),
  ]
  assert.deepEqual(checkTournamentTotal(existing, 40), {
    total: 23,
    remaining: 17,
    exact: false,
    message: "You've wagered $23 of $40 — Phase 2 must bring you to exactly $40.",
  })
})

test("tournament total: exactly the entry fee is compliant", () => {
  const existing = [
    placement({ pick_id: "p1", phase: 1, amount: 25 }),
    placement({ pick_id: "p2", phase: 2, amount: 15 }),
  ]
  assert.deepEqual(checkTournamentTotal(existing, 40), {
    total: 40,
    remaining: 0,
    exact: true,
    message: null,
  })
})
