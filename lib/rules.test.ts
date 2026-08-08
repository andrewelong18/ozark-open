// Unit tests for lib/rules.ts — the house-rules editor's server-side half
// (Sprint 23 / #100).
//
// The interesting cases are the ones an admin can reach by typing a plausible
// number: a minimum above the maximum, a percentage entered as "50" instead of
// "0.5", and the two derived traps that leave every value individually legal
// and the tournament unplayable.

import test from "node:test"
import assert from "node:assert/strict"
import {
  parseRulesBody,
  ruleLimitsPreview,
  validateTournamentRules,
} from "./rules.ts"
import type { TournamentRules } from "./validation.ts"

/** The live 2026 values, as seeded by the migrations. */
const LIVE: TournamentRules = {
  entry_fee_min: 20,
  entry_fee_max: 50,
  min_picks_per_tournament: 5,
  max_picks_per_phase: 10,
  max_single_bet_pct: 0.5,
  max_single_bet_cap: 20,
  max_self_bet_pct: 0.25,
  max_self_bet_cap: 10,
}

const withRules = (patch: Partial<TournamentRules>): TournamentRules => ({
  ...LIVE,
  ...patch,
})

// ---------------------------------------------------------------------------
// parseRulesBody
// ---------------------------------------------------------------------------

test("parseRulesBody accepts numbers and numeric strings", () => {
  const body: Record<string, unknown> = { ...LIVE, entry_fee_min: "20" }
  const parsed = parseRulesBody(body)
  assert.equal(parsed.ok, true)
  if (parsed.ok) assert.deepEqual(parsed.value, LIVE)
})

test("parseRulesBody rejects a missing field by name", () => {
  const { max_picks_per_phase: _omitted, ...rest } = LIVE
  void _omitted
  const parsed = parseRulesBody(rest)
  assert.equal(parsed.ok, false)
  if (!parsed.ok) assert.match(parsed.error, /Maximum picks per phase/)
})

test("parseRulesBody rejects non-numeric input", () => {
  const parsed = parseRulesBody(withRules({ entry_fee_max: "fifty" as never }))
  assert.equal(parsed.ok, false)
  if (!parsed.ok) assert.match(parsed.error, /must be a number/)
})

test("parseRulesBody rejects a non-object body", () => {
  assert.equal(parseRulesBody(null).ok, false)
  assert.equal(parseRulesBody("rules").ok, false)
})

// ---------------------------------------------------------------------------
// validateTournamentRules
// ---------------------------------------------------------------------------

test("the live 2026 rules validate", () => {
  assert.deepEqual(validateTournamentRules(LIVE), [])
})

test("a fractional pick count is refused", () => {
  const errors = validateTournamentRules(withRules({ max_picks_per_phase: 10.5 }))
  assert.equal(errors.length, 1)
  assert.match(errors[0], /whole number/)
})

test("a zero or negative parameter is refused", () => {
  assert.match(
    validateTournamentRules(withRules({ max_single_bet_cap: 0 }))[0],
    /at least 1/
  )
})

test("a percentage typed as 50 instead of 0.5 is refused", () => {
  const errors = validateTournamentRules(withRules({ max_single_bet_pct: 50 }))
  assert.equal(errors.length, 1)
  assert.match(errors[0], /between 0 and 1/)
})

test("a percentage with more than two decimals is refused (numeric(3,2))", () => {
  assert.match(
    validateTournamentRules(withRules({ max_self_bet_pct: 0.255 }))[0],
    /two decimal places/
  )
})

test("two decimals is fine even when floating point is untidy", () => {
  assert.deepEqual(validateTournamentRules(withRules({ max_self_bet_pct: 0.29 })), [])
})

test("a minimum entry above the maximum is refused", () => {
  const errors = validateTournamentRules(
    withRules({ entry_fee_min: 60, entry_fee_max: 50 })
  )
  assert.equal(errors.length, 1)
  assert.match(errors[0], /can't be above the maximum/)
})

test("equal entry-fee bounds are legal — a single fixed entry", () => {
  assert.deepEqual(
    validateTournamentRules(withRules({ entry_fee_min: 40, entry_fee_max: 40 })),
    []
  )
})

// The asymmetry that Sprint 22 settled: the maximum is per phase, the minimum
// spans both phases combined. Lowering the max can strand the min.
test("a tournament minimum above two phases' worth of picks is refused", () => {
  const errors = validateTournamentRules(
    withRules({ min_picks_per_tournament: 9, max_picks_per_phase: 4 })
  )
  assert.equal(errors.length, 1)
  assert.match(errors[0], /8 across both is the ceiling/)
})

test("a tournament minimum exactly at the two-phase ceiling is allowed", () => {
  assert.deepEqual(
    validateTournamentRules(
      withRules({ min_picks_per_tournament: 8, max_picks_per_phase: 4 })
    ),
    []
  )
})

test("a max single bet that floors to $0 at the minimum entry is refused", () => {
  // 0.04 × $20 = $0.80, which floors to $0 — nobody could place any wager.
  // (Such a small percentage also strands the $50 entry, so both derived
  // traps report; the $0 one is the root cause and must be among them.)
  const errors = validateTournamentRules(withRules({ max_single_bet_pct: 0.04 }))
  assert.ok(errors.some((e) => /works out to \$0/.test(e)), errors.join(" | "))
})

test("an entry fee no legal slate can add up to is refused", () => {
  // 2 phases × 3 picks × $5 = $30, but the entry fee is $50 and rule 6 needs
  // the total to hit it exactly. 3 picks per phase still clears the 5-pick
  // tournament minimum, so this isolates the wagerable-total trap.
  const errors = validateTournamentRules(
    withRules({ max_picks_per_phase: 3, max_single_bet_cap: 5 })
  )
  assert.equal(errors.length, 1)
  assert.match(errors[0], /could never be wagered in full/)
})

test("shape errors short-circuit the derived checks", () => {
  // A negative percentage would otherwise also trip the $0 single-bet trap;
  // only the direct complaint should come back.
  const errors = validateTournamentRules(withRules({ max_single_bet_pct: -1 }))
  assert.equal(errors.length, 1)
  assert.match(errors[0], /between 0 and 1/)
})

// ---------------------------------------------------------------------------
// ruleLimitsPreview — the numbers Pat actually reasons about
// ---------------------------------------------------------------------------

test("the preview reproduces the two worked examples from #100", () => {
  const { rows } = ruleLimitsPreview(LIVE)
  const at = (fee: number) => rows.find((r) => r.entry_fee === fee)
  // $25 → $12 because maxSingleBet floors rather than rounds.
  assert.equal(at(25)?.max_single_bet, 12)
  // $50 → $20 because the hard cap binds before the percentage does.
  assert.equal(at(50)?.max_single_bet, 20)
})

test("the preview samples both bounds and the $5 steps between", () => {
  const { rows } = ruleLimitsPreview(LIVE)
  assert.deepEqual(
    rows.map((r) => r.entry_fee),
    [20, 25, 30, 35, 40, 45, 50]
  )
})

test("the preview reports where each cap starts binding", () => {
  const preview = ruleLimitsPreview(LIVE)
  // floor(0.50 × 40) = 20 = the cap.
  assert.equal(preview.single_cap_binds_at, 40)
  // floor(0.25 × 40) = 10 = the cap.
  assert.equal(preview.self_cap_binds_at, 40)
})

test("a cap that never binds in range reports null", () => {
  const preview = ruleLimitsPreview(withRules({ max_single_bet_cap: 999 }))
  assert.equal(preview.single_cap_binds_at, null)
})

test("the self-bet column tracks its own percentage and cap", () => {
  const { rows } = ruleLimitsPreview(LIVE)
  const at = (fee: number) => rows.find((r) => r.entry_fee === fee)
  assert.equal(at(20)?.max_self_bet, 5) // floor(0.25 × 20)
  assert.equal(at(50)?.max_self_bet, 10) // capped
})

test("a single fixed entry fee previews one row", () => {
  const { rows } = ruleLimitsPreview(
    withRules({ entry_fee_min: 40, entry_fee_max: 40 })
  )
  assert.deepEqual(rows, [{ entry_fee: 40, max_single_bet: 20, max_self_bet: 10 }])
})
