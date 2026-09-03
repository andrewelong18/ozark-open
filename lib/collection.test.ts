// Unit tests for lib/collection.ts — entry money in against entry money owed.
//
// The property worth defending is the capped sum: an overpayment must never be
// able to hide someone else's shortfall in the headline, because the headline
// is what tells an admin the pool is short.

import test from "node:test"
import assert from "node:assert/strict"

import {
  collectionStanding,
  isPaidInFull,
  parsePaidAmount,
  MAX_RECORDED_PAYMENT,
  type CollectionParticipant,
} from "./collection.ts"

const roster: CollectionParticipant[] = [
  { display_name: "Paid Pat", entry_fee: 30, paid_amount: 30 },
  { display_name: "Half Hayden", entry_fee: 30, paid_amount: 12 },
  { display_name: "Owes Olivia", entry_fee: 20, paid_amount: 0 },
]

test("collectionStanding totals what was owed and what came in", () => {
  const standing = collectionStanding(roster)
  assert.equal(standing.expected, 80)
  assert.equal(standing.collected, 42)
})

test("outstanding lists only the short, biggest gap first", () => {
  const standing = collectionStanding(roster)
  assert.deepEqual(standing.outstanding, [
    { name: "Owes Olivia", owed: 20 },
    { name: "Half Hayden", owed: 18 },
  ])
})

test("an overpayment cannot disguise someone else's shortfall", () => {
  // The reason `collected` caps per person. Uncapped, this roster sums to $80
  // of $80 and reads fully collected while $20 is genuinely missing.
  const standing = collectionStanding([
    { display_name: "Generous Gary", entry_fee: 30, paid_amount: 50 },
    { display_name: "Owes Olivia", entry_fee: 20, paid_amount: 0 },
  ])
  assert.equal(standing.expected, 50)
  assert.equal(standing.collected, 30)
  assert.deepEqual(standing.outstanding, [{ name: "Owes Olivia", owed: 20 }])
})

test("a missing column reads as unpaid, never as an error", () => {
  // What a row looks like on a database that predates the migration.
  const standing = collectionStanding([
    { display_name: "Legacy Larry", entry_fee: 40 },
  ])
  assert.equal(standing.collected, 0)
  assert.deepEqual(standing.outstanding, [{ name: "Legacy Larry", owed: 40 }])
})

test("an empty roster is a zero standing, not a crash", () => {
  assert.deepEqual(collectionStanding([]), {
    expected: 0,
    collected: 0,
    outstanding: [],
  })
})

test("isPaidInFull is >=, so an overpayment still counts as settled", () => {
  assert.equal(isPaidInFull({ display_name: "a", entry_fee: 30, paid_amount: 30 }), true)
  assert.equal(isPaidInFull({ display_name: "a", entry_fee: 30, paid_amount: 45 }), true)
  assert.equal(isPaidInFull({ display_name: "a", entry_fee: 30, paid_amount: 29 }), false)
  assert.equal(isPaidInFull({ display_name: "a", entry_fee: 30 }), false)
})

// ---------------------------------------------------------------------------
// parsePaidAmount
// ---------------------------------------------------------------------------

test("parsePaidAmount takes whole dollars, including zero", () => {
  assert.deepEqual(parsePaidAmount(30), { ok: true, amount: 30 })
  assert.deepEqual(parsePaidAmount("30"), { ok: true, amount: 30 })
  assert.deepEqual(parsePaidAmount(0), { ok: true, amount: 0 })
})

test("parsePaidAmount refuses cents, negatives and nonsense", () => {
  assert.equal(parsePaidAmount(30.5).ok, false)
  assert.equal(parsePaidAmount(-5).ok, false)
  assert.equal(parsePaidAmount("thirty").ok, false)
  assert.equal(parsePaidAmount(null).ok, false)
  assert.equal(parsePaidAmount("").ok, false)
})

test("parsePaidAmount guards the slipped keystroke but allows overpayment", () => {
  assert.equal(parsePaidAmount(MAX_RECORDED_PAYMENT).ok, true)
  assert.equal(parsePaidAmount(MAX_RECORDED_PAYMENT + 1).ok, false)
  // $45 against a $30 entry is a real thing that happens, not a typo.
  assert.deepEqual(parsePaidAmount(45), { ok: true, amount: 45 })
})
