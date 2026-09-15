// Unit tests for lib/entry-request.ts — the one-time entry request (Sprint
// 30 / A26): the window, the money rules, the slider's snapping and the
// member's status.

import test from "node:test"
import assert from "node:assert/strict"
import {
  VENMO_MEMO,
  VENMO_URL,
  describeRequest,
  entryStatus,
  legalSplits,
  parseEntryRequestBody,
  requestWindow,
  snapSplit,
  totalBounds,
  validateEntryRequest,
} from "./entry-request.ts"
import type { PhaseClock } from "./phases.ts"
import type { TournamentRules } from "./validation.ts"

const RULES: TournamentRules = {
  entry_fee_min: 20,
  entry_fee_max: 50,
  min_picks_per_phase: 5,
  max_single_bet: 10,
  max_self_bet_pct: 0.25,
}

const CLOCK: PhaseClock = {
  phase1_closes_at: "2026-09-24T16:00:00Z",
  phase2_closes_at: "2026-09-26T16:00:00Z",
  show_countdown: true,
}
const BEFORE = new Date("2026-09-14T12:00:00Z")
const BETWEEN = new Date("2026-09-25T12:00:00Z")
const AFTER = new Date("2026-09-27T12:00:00Z")

const OPEN = requestWindow(CLOCK, BEFORE)

test("the Venmo hand-off is a constant, not stored per member", () => {
  assert.equal(VENMO_URL, "https://venmo.com/u/AndrewLong99")
  assert.equal(VENMO_MEMO, "golf")
})

// ---------------------------------------------------------------------------
// The window
// ---------------------------------------------------------------------------

test("before Phase 1 closes both phases can be requested", () => {
  assert.deepEqual(OPEN, { phases: [1, 2], state: "open" })
})

test("after Phase 1 closes only Phase 2 can be requested", () => {
  assert.deepEqual(requestWindow(CLOCK, BETWEEN), { phases: [2], state: "phase2_only" })
})

test("after Phase 2 closes, or once the tournament is completed, the form is closed", () => {
  assert.deepEqual(requestWindow(CLOCK, AFTER), { phases: [], state: "closed" })
  assert.deepEqual(requestWindow(CLOCK, BEFORE, { completed: true }), { phases: [], state: "closed" })
})

test("no deadlines set means both phases stay open (the pre-Sprint-25 clock)", () => {
  const noClock: PhaseClock = { phase1_closes_at: null, phase2_closes_at: null, show_countdown: true }
  assert.equal(requestWindow(noClock, AFTER).state, "open")
})

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

test("a legal request: both phases in range, or one phase and $0", () => {
  assert.deepEqual(validateEntryRequest({ phase1: 30, phase2: 30, isPlayer: true }, RULES, OPEN), [])
  assert.deepEqual(validateEntryRequest({ phase1: 20, phase2: 0, isPlayer: true }, RULES, OPEN), [])
  assert.deepEqual(validateEntryRequest({ phase1: 0, phase2: 50, isPlayer: false }, RULES, OPEN), [])
})

test("a phase amount under the minimum or over the maximum is refused by name", () => {
  assert.deepEqual(validateEntryRequest({ phase1: 15, phase2: 20, isPlayer: true }, RULES, OPEN), [
    "Phase 1 entry must be between $20 and $50, or $0 to sit Phase 1 out.",
  ])
  assert.deepEqual(validateEntryRequest({ phase1: 20, phase2: 60, isPlayer: true }, RULES, OPEN), [
    "Phase 2 entry must be between $20 and $50, or $0 to sit Phase 2 out.",
  ])
})

test("fractional dollars and negatives are refused", () => {
  assert.match(validateEntryRequest({ phase1: 20.5, phase2: 0, isPlayer: true }, RULES, OPEN)[0], /whole-dollar/)
  assert.match(validateEntryRequest({ phase1: -20, phase2: 20, isPlayer: true }, RULES, OPEN)[0], /whole-dollar/)
})

test("asking for nothing at all is refused", () => {
  assert.deepEqual(validateEntryRequest({ phase1: 0, phase2: 0, isPlayer: true }, RULES, OPEN), [
    "Request at least one phase.",
  ])
})

test("a closed phase can't be requested; a closed window refuses everything", () => {
  const phase2Only = requestWindow(CLOCK, BETWEEN)
  assert.deepEqual(validateEntryRequest({ phase1: 20, phase2: 20, isPlayer: true }, RULES, phase2Only), [
    "Phase 1 has closed — it can't be requested any more.",
  ])
  assert.deepEqual(validateEntryRequest({ phase1: 0, phase2: 20, isPlayer: true }, RULES, phase2Only), [])
  assert.deepEqual(
    validateEntryRequest({ phase1: 0, phase2: 20, isPlayer: true }, RULES, requestWindow(CLOCK, AFTER)),
    ["Entry requests are closed — talk to an admin."]
  )
})

// ---------------------------------------------------------------------------
// The slider
// ---------------------------------------------------------------------------

test("totalBounds run from one minimum entry to two maximums", () => {
  assert.deepEqual(totalBounds(RULES, OPEN), { min: 20, max: 100 })
  assert.deepEqual(totalBounds(RULES, requestWindow(CLOCK, BETWEEN)), { min: 20, max: 50 })
  assert.deepEqual(totalBounds(RULES, requestWindow(CLOCK, AFTER)), { min: 0, max: 0 })
})

test("legalSplits: a total that fits one phase can go all to either, and split only if both halves fit", () => {
  assert.deepEqual(legalSplits(20, RULES, OPEN), [0, 20])
  assert.deepEqual(legalSplits(30, RULES, OPEN), [0, 30]) // $10/$20 is not a legal split
  assert.deepEqual(legalSplits(40, RULES, OPEN), [0, 20, 40])
  assert.deepEqual(legalSplits(70, RULES, OPEN), [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50])
  assert.deepEqual(legalSplits(100, RULES, OPEN), [50])
  assert.deepEqual(legalSplits(15, RULES, OPEN), [])
  assert.deepEqual(legalSplits(101, RULES, OPEN), [])
})

test("legalSplits: with Phase 1 closed the only legal Phase 1 amount is $0", () => {
  const phase2Only = requestWindow(CLOCK, BETWEEN)
  assert.deepEqual(legalSplits(30, RULES, phase2Only), [0])
  assert.deepEqual(legalSplits(60, RULES, phase2Only), [])
})

test("snapSplit lands the slider on the nearest legal split, lower on ties", () => {
  assert.equal(snapSplit(30, 12, RULES, OPEN), 0)
  assert.equal(snapSplit(30, 16, RULES, OPEN), 30)
  assert.equal(snapSplit(30, 15, RULES, OPEN), 0) // tie → lower
  assert.equal(snapSplit(60, 33, RULES, OPEN), 33)
  assert.equal(snapSplit(60, 5, RULES, OPEN), 20)
  assert.equal(snapSplit(60, 58, RULES, OPEN), 40)
  assert.equal(snapSplit(15, 10, RULES, OPEN), 0) // nothing legal
})

// ---------------------------------------------------------------------------
// Status and wording
// ---------------------------------------------------------------------------

test("entryStatus: entered beats requested beats none", () => {
  assert.equal(entryStatus(null, null), "none")
  assert.equal(entryStatus({ phase1_entry_fee: null, phase2_entry_fee: null }, null), "none")
  assert.equal(entryStatus(null, { phase1_amount: 20 }), "requested")
  assert.equal(entryStatus({ phase1_entry_fee: null, phase2_entry_fee: null }, { phase1_amount: 20 }), "requested")
  assert.equal(entryStatus({ phase1_entry_fee: "20", phase2_entry_fee: null }, null), "entered")
  assert.equal(entryStatus({ phase1_entry_fee: null, phase2_entry_fee: 30 }, { phase1_amount: 20 }), "entered")
})

test("describeRequest reads like the split", () => {
  assert.equal(describeRequest({ phase1_amount: 30, phase2_amount: 30 }), "Phase 1 $30 · Phase 2 $30")
  assert.equal(describeRequest({ phase1_amount: 20, phase2_amount: 0 }), "Phase 1 $20 only")
  assert.equal(describeRequest({ phase1_amount: 0, phase2_amount: 50 }), "Phase 2 $50 only")
})

test("parseEntryRequestBody shapes the body and defaults isPlayer to true", () => {
  assert.deepEqual(parseEntryRequestBody({ phase1: "30", phase2: 30 }), {
    ok: true,
    value: { phase1: 30, phase2: 30, isPlayer: true },
  })
  assert.deepEqual(parseEntryRequestBody({ phase1: 20, isPlayer: false }), {
    ok: true,
    value: { phase1: 20, phase2: 0, isPlayer: false },
  })
  assert.equal(parseEntryRequestBody(null).ok, false)
  assert.equal(parseEntryRequestBody({ phase1: "twenty" }).ok, false)
  assert.equal(parseEntryRequestBody({ phase1: 20, isPlayer: "yes" }).ok, false)
})
