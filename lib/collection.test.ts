// Unit tests for lib/collection.ts — entry collection, recorded and never
// adjudicated (PRD §12 A17), owed per phase since Sprint 30 (ADR 0002).

import test from "node:test"
import assert from "node:assert/strict"
import {
  MAX_RECORDED_PAYMENT,
  collectionStanding,
  entryOwed,
  isPaidInFull,
  parsePaidAmount,
} from "./collection.ts"

function person(
  display_name: string,
  entries: { p1?: number | string | null; p2?: number | string | null },
  paid_amount?: number | null
) {
  return {
    display_name,
    phase1_entry_fee: entries.p1 ?? null,
    phase2_entry_fee: entries.p2 ?? null,
    paid_amount,
  }
}

test("entryOwed is the sum of the phases the member is in", () => {
  assert.equal(entryOwed({ phase1_entry_fee: 20, phase2_entry_fee: 30 }), 50)
  assert.equal(entryOwed({ phase1_entry_fee: 20, phase2_entry_fee: null }), 20)
  assert.equal(entryOwed({ phase1_entry_fee: null, phase2_entry_fee: null }), 0)
  // PostgREST strings, and a zero that is not an entry.
  assert.equal(entryOwed({ phase1_entry_fee: "25", phase2_entry_fee: "0" }), 25)
})

test("the standing sums what is owed, caps what was collected, and lists the gaps biggest first", () => {
  const standing = collectionStanding([
    person("Paid Pat", { p1: 30, p2: 20 }, 50),
    person("Half Hayden", { p1: 30 }, 12),
    person("Owes Olivia", { p1: 20, p2: 20 }, 0),
    person("Over Oscar", { p1: 20 }, 40),
  ])
  assert.equal(standing.expected, 50 + 30 + 40 + 20)
  // Oscar's extra $20 is NOT collected against Olivia's gap.
  assert.equal(standing.collected, 50 + 12 + 0 + 20)
  assert.deepEqual(standing.outstanding, [
    { name: "Owes Olivia", owed: 40 },
    { name: "Half Hayden", owed: 18 },
  ])
  assert.deepEqual(standing.overpaid, [{ name: "Over Oscar", amount: 20 }])
})

test("a member who paid up front for a phase they later left is listed as a refund", () => {
  // Paid $40 for both phases; the admin cleared Phase 2 when they sat it out.
  const standing = collectionStanding([person("Skipped Sam", { p1: 20, p2: null }, 40)])
  assert.equal(standing.expected, 20)
  assert.equal(standing.collected, 20)
  assert.deepEqual(standing.overpaid, [{ name: "Skipped Sam", amount: 20 }])
})

test("a member with no entry recorded owes nothing and is not listed", () => {
  const standing = collectionStanding([person("Not Yet Nia", {}, 0)])
  assert.equal(standing.expected, 0)
  assert.deepEqual(standing.outstanding, [])
  assert.deepEqual(standing.overpaid, [])
})

test("a missing paid_amount column reads as nothing paid", () => {
  const standing = collectionStanding([person("Legacy Lee", { p1: 20 })])
  assert.deepEqual(standing.outstanding, [{ name: "Legacy Lee", owed: 20 }])
})

test("isPaidInFull is derived, never stored, and false with nothing to pay for", () => {
  assert.equal(isPaidInFull(person("A", { p1: 20, p2: 20 }, 40)), true)
  assert.equal(isPaidInFull(person("B", { p1: 20, p2: 20 }, 39)), false)
  assert.equal(isPaidInFull(person("C", { p1: 20 }, 25)), true)
  assert.equal(isPaidInFull(person("D", {}, 0)), false)
})

test("parsePaidAmount takes whole dollars from 0 up to the typo guard", () => {
  assert.deepEqual(parsePaidAmount(0), { ok: true, amount: 0 })
  assert.deepEqual(parsePaidAmount("40"), { ok: true, amount: 40 })
  assert.deepEqual(parsePaidAmount(MAX_RECORDED_PAYMENT), { ok: true, amount: MAX_RECORDED_PAYMENT })
  assert.equal(parsePaidAmount("").ok, false)
  assert.equal(parsePaidAmount(null).ok, false)
  assert.equal(parsePaidAmount(12.5).ok, false)
  assert.equal(parsePaidAmount(-1).ok, false)
  const typo = parsePaidAmount(MAX_RECORDED_PAYMENT + 1)
  assert.equal(typo.ok, false)
  if (!typo.ok) assert.match(typo.error, /looks like a typo/)
})
