// Unit tests for lib/phases.ts — the phase clock (Sprint 25 / #106, #107).
//
// `now` is a parameter everywhere, so every state below is reachable without
// waiting for September or stubbing the system clock.

import test from "node:test"
import assert from "node:assert/strict"
import {
  bettingBadge,
  deadlineFor,
  formatDeadline,
  nextDeadline,
  phaseClosedByClock,
  phaseState,
  wageringOpen,
  type PhaseBet,
  type PhaseClock,
} from "./phases.ts"

// The 2026 deadlines as seeded by the migration: Round 1 and Round 3 tee-off,
// 11:00 America/Chicago = 16:00Z in September (CDT).
const CLOCK: PhaseClock = {
  phase1_closes_at: "2026-09-24T16:00:00Z",
  phase2_closes_at: "2026-09-26T16:00:00Z",
  show_countdown: true,
}
const NO_CLOCK: PhaseClock = {
  phase1_closes_at: null,
  phase2_closes_at: null,
  show_countdown: true,
}

const BEFORE_P1 = new Date("2026-09-24T15:59:59Z")
const AT_P1 = new Date("2026-09-24T16:00:00Z")
const BETWEEN = new Date("2026-09-25T12:00:00Z")
const AFTER_P2 = new Date("2026-09-26T16:00:01Z")

const bet = (phase: number, status: string): PhaseBet => ({ phase, status })

// ---------------------------------------------------------------------------
// Reading the clock
// ---------------------------------------------------------------------------

test("deadlineFor parses each phase, and null means no deadline", () => {
  assert.equal(deadlineFor(1, CLOCK)!.toISOString(), "2026-09-24T16:00:00.000Z")
  assert.equal(deadlineFor(2, CLOCK)!.toISOString(), "2026-09-26T16:00:00.000Z")
  assert.equal(deadlineFor(1, NO_CLOCK), null)
})

test("deadlineFor treats an unparseable timestamp as no deadline, not as passed", () => {
  const junk: PhaseClock = { ...CLOCK, phase1_closes_at: "not a date" }
  assert.equal(deadlineFor(1, junk), null)
  // Failing open matters: a bad value must not close betting on everyone.
  assert.equal(phaseClosedByClock(1, junk, AFTER_P2), false)
})

test("the deadline boundary is inclusive — at 11:00:00 the phase is closed", () => {
  assert.equal(phaseClosedByClock(1, CLOCK, BEFORE_P1), false)
  assert.equal(phaseClosedByClock(1, CLOCK, AT_P1), true)
})

test("no deadline set means the phase never closes on the clock", () => {
  assert.equal(phaseClosedByClock(1, NO_CLOCK, AFTER_P2), false)
  assert.equal(phaseClosedByClock(2, NO_CLOCK, AFTER_P2), false)
})

test("the phases close independently", () => {
  assert.equal(phaseClosedByClock(1, CLOCK, BETWEEN), true)
  assert.equal(phaseClosedByClock(2, CLOCK, BETWEEN), false)
})

// ---------------------------------------------------------------------------
// wageringOpen — the one gate
// ---------------------------------------------------------------------------

test("wagering needs the bet open AND the deadline unpassed", () => {
  assert.equal(wageringOpen(bet(1, "open"), CLOCK, BEFORE_P1), true)
  assert.equal(wageringOpen(bet(1, "closed"), CLOCK, BEFORE_P1), false)
  assert.equal(wageringOpen(bet(1, "hidden"), CLOCK, BEFORE_P1), false)
})

test("a sheet that still says `open` after the deadline does not reopen betting", () => {
  // The exact interaction ADR 0001 §5a exists to settle: the upload only ever
  // opens a bet, the clock only ever closes a phase.
  assert.equal(wageringOpen(bet(1, "open"), CLOCK, AT_P1), false)
  // ...and Phase 2 is untouched by Phase 1's deadline.
  assert.equal(wageringOpen(bet(2, "open"), CLOCK, AT_P1), true)
})

// ---------------------------------------------------------------------------
// phaseState — what the dashboard and /bets both read
// ---------------------------------------------------------------------------

test("a phase with no visible bets is unpublished (hidden doesn't count)", () => {
  assert.equal(phaseState(2, CLOCK, [], BEFORE_P1), "unpublished")
  assert.equal(
    phaseState(2, CLOCK, [bet(2, "hidden"), bet(2, "hidden")], BEFORE_P1),
    "unpublished"
  )
})

test("a phase whose bets are all closed reads closed, deadline or not", () => {
  // This is how a phase closed before Sprint 25, and how the dry run closed
  // one — the clock is an ADDITIONAL way to be closed, never the only one.
  assert.equal(phaseState(1, NO_CLOCK, [bet(1, "closed")], BEFORE_P1), "closed")
})

test("the deadline closes a phase whose bets still read open", () => {
  const bets = [bet(1, "open"), bet(1, "open")]
  assert.equal(phaseState(1, CLOCK, bets, BEFORE_P1), "open")
  assert.equal(phaseState(1, CLOCK, bets, AT_P1), "closed")
})

// ---------------------------------------------------------------------------
// bettingBadge — the #107 fix, across the four states the sprint enumerates
// ---------------------------------------------------------------------------

test("badge: nothing published — the #107 bug, which showed 'Betting Open' here", () => {
  const badge = bettingBadge(CLOCK, [bet(1, "hidden"), bet(2, "hidden")], BEFORE_P1)
  assert.deepEqual(badge, { label: "Not open yet", open: false })
})

test("badge: Phase 1 open", () => {
  const bets = [bet(1, "open"), bet(2, "hidden")]
  assert.deepEqual(bettingBadge(CLOCK, bets, BEFORE_P1), {
    label: "Phase 1 open",
    open: true,
  })
})

test("badge: Phase 1 closed, Phase 2 not released yet", () => {
  const bets = [bet(1, "open"), bet(2, "hidden")]
  assert.deepEqual(bettingBadge(CLOCK, bets, AT_P1), {
    label: "Phase 1 closed",
    open: false,
  })
})

test("badge: Phase 2 open", () => {
  const bets = [bet(1, "closed"), bet(2, "open")]
  assert.deepEqual(bettingBadge(CLOCK, bets, BETWEEN), {
    label: "Phase 2 open",
    open: true,
  })
})

test("badge: both closed", () => {
  const bets = [bet(1, "closed"), bet(2, "closed")]
  assert.deepEqual(bettingBadge(CLOCK, bets, AFTER_P2), {
    label: "Betting closed",
    open: false,
  })
})

test("badge: the deadline alone closes it, even with every bet still open", () => {
  // The sheet hasn't been re-uploaded yet — the badge must not claim betting
  // is open, because /api/placements is already refusing wagers.
  const bets = [bet(1, "open"), bet(2, "open")]
  assert.equal(bettingBadge(CLOCK, bets, AFTER_P2).open, false)
})

// ---------------------------------------------------------------------------
// nextDeadline — what the countdown targets
// ---------------------------------------------------------------------------

test("nextDeadline walks the phases in order and skips ones already passed", () => {
  assert.deepEqual(nextDeadline(CLOCK, BEFORE_P1), {
    phase: 1,
    at: new Date("2026-09-24T16:00:00Z"),
  })
  assert.deepEqual(nextDeadline(CLOCK, BETWEEN), {
    phase: 2,
    at: new Date("2026-09-26T16:00:00Z"),
  })
  assert.equal(nextDeadline(CLOCK, AFTER_P2), null)
  assert.equal(nextDeadline(NO_CLOCK, BEFORE_P1), null)
})

test("formatDeadline renders in the tournament's timezone, not the reader's", () => {
  // The deadline is a tee time in Missouri. 16:00Z is 11:00 CDT.
  const text = formatDeadline(new Date("2026-09-24T16:00:00Z"))
  assert.match(text, /Thu/)
  assert.match(text, /Sep 24/)
  assert.match(text, /11:00/)
  assert.match(text, /CDT/)
})
