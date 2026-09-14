// Unit tests for lib/rules.ts — the house-rules editor's server-side half
// (Sprint 23 / #100; five parameters since Sprint 30 / ADR 0002).
//
// The interesting cases are the ones an admin can reach by typing a plausible
// number: a minimum above the maximum, a percentage entered as "25" instead
// of "0.25", and the one derived trap that leaves every value individually
// legal and the tournament unplayable.

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
  min_picks_per_phase: 5,
  max_single_bet: 10,
  max_self_bet_pct: 0.25,
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
  const { max_single_bet: _omitted, ...rest } = LIVE
  void _omitted
  const parsed = parseRulesBody(rest)
  assert.equal(parsed.ok, false)
  if (!parsed.ok) assert.match(parsed.error, /Max single bet/)
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

test("parseRulesBody ignores the retired eight-parameter fields", () => {
  // A stale form posting the old shape still needs the five that exist.
  const parsed = parseRulesBody({ ...LIVE, max_single_bet_cap: 20, max_self_bet_cap: 10 })
  assert.equal(parsed.ok, true)
  if (parsed.ok) assert.deepEqual(parsed.value, LIVE)
})

// ---------------------------------------------------------------------------
// validateTournamentRules
// ---------------------------------------------------------------------------

test("the live 2026 rules validate", () => {
  assert.deepEqual(validateTournamentRules(LIVE), [])
})

test("a fractional pick count is refused", () => {
  const errors = validateTournamentRules(withRules({ min_picks_per_phase: 5.5 }))
  assert.equal(errors.length, 1)
  assert.match(errors[0], /whole number/)
})

test("a zero or negative parameter is refused", () => {
  assert.match(
    validateTournamentRules(withRules({ max_single_bet: 0 }))[0],
    /at least 1/
  )
})

test("a percentage typed as 25 instead of 0.25 is refused", () => {
  const errors = validateTournamentRules(withRules({ max_self_bet_pct: 25 }))
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

// The one derived trap: a pick is at least $1, so the per-phase minimum has to
// fit inside the smallest entry.
test("a pick minimum no minimum entry could hold at $1 a pick is refused", () => {
  const errors = validateTournamentRules(
    withRules({ min_picks_per_phase: 25, entry_fee_min: 20 })
  )
  assert.equal(errors.length, 1)
  assert.match(errors[0], /at least \$25/)
})

test("a pick minimum exactly equal to the minimum entry is allowed", () => {
  assert.deepEqual(
    validateTournamentRules(withRules({ min_picks_per_phase: 20, entry_fee_min: 20 })),
    []
  )
})

test("a self-bet share that floors to $0 at the minimum entry is allowed — self-bets off is a legal house rule", () => {
  assert.deepEqual(validateTournamentRules(withRules({ max_self_bet_pct: 0.01 })), [])
})

test("shape errors short-circuit the derived checks", () => {
  const errors = validateTournamentRules(withRules({ max_self_bet_pct: -1, min_picks_per_phase: 25 }))
  assert.equal(errors.length, 1)
  assert.match(errors[0], /between 0 and 1/)
})

// ---------------------------------------------------------------------------
// ruleLimitsPreview — the numbers Pat actually reasons about
// ---------------------------------------------------------------------------

test("the preview reproduces the self-bet figures at each entry, floored", () => {
  const { rows } = ruleLimitsPreview(LIVE)
  const at = (fee: number) => rows.find((r) => r.entry_fee === fee)
  assert.equal(at(20)?.max_self_bet, 5)
  assert.equal(at(30)?.max_self_bet, 7) // floor(7.5)
  assert.equal(at(50)?.max_self_bet, 12) // floor(12.5), no cap
})

test("the preview names the flat single-bet cap once", () => {
  assert.equal(ruleLimitsPreview(LIVE).max_single_bet, 10)
})

test("the preview samples both bounds and the $5 steps between", () => {
  const { rows } = ruleLimitsPreview(LIVE)
  assert.deepEqual(
    rows.map((r) => r.entry_fee),
    [20, 25, 30, 35, 40, 45, 50]
  )
})

// Regression: ruleLimitsPreview runs on every keystroke in the rules form,
// against half-typed values. A fat-fingered max entry used to pass validation
// and then build a ~200,000-row table with a per-dollar loop behind it,
// hanging the tab.
test("a mistyped entry fee can't build an enormous preview table", () => {
  const huge = withRules({ entry_fee_max: 1_000_000 })
  const started = Date.now()
  const { rows } = ruleLimitsPreview(huge)
  assert.ok(rows.length <= 12, `got ${rows.length} rows`)
  assert.ok(Date.now() - started < 100, "preview must not walk every dollar")
  assert.equal(rows[0].entry_fee, 20)
  assert.equal(rows.at(-1)?.entry_fee, 1_000_000)
})

test("validation refuses the stray zero before it ever reaches the row", () => {
  assert.match(
    validateTournamentRules(withRules({ entry_fee_max: 1_000_000 }))[0],
    /looks like a typo/
  )
  assert.match(
    validateTournamentRules(withRules({ min_picks_per_phase: 1000 }))[0],
    /looks like a typo/
  )
})

test("the generous ceiling doesn't reject a plausible house rule", () => {
  assert.deepEqual(
    validateTournamentRules(withRules({ entry_fee_max: 500, max_single_bet: 50 })),
    []
  )
})

test("a single fixed entry fee previews one row", () => {
  const { rows } = ruleLimitsPreview(
    withRules({ entry_fee_min: 40, entry_fee_max: 40 })
  )
  assert.deepEqual(rows, [{ entry_fee: 40, max_self_bet: 10 }])
})
