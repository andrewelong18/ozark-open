// Unit tests for lib/pick-order.ts (#105).
//
// The Done-when asks specifically for a comparator test, because the previous
// attempt at this shipped the logic inline in a page component where nothing
// could reach it.

import test from "node:test"
import assert from "node:assert/strict"
import {
  comparePicks,
  impliedProbability,
  sortPicks,
  type OrderablePick,
} from "./pick-order.ts"

const pick = (american_odds: number, sheet_pick_id: number): OrderablePick => ({
  american_odds,
  sheet_pick_id,
})

test("implied probability from a positive price", () => {
  // +110 → 100/210
  assert.equal(impliedProbability(110), 100 / 210)
  assert.ok(Math.abs(impliedProbability(110) - 0.476) < 0.001)
  assert.ok(Math.abs(impliedProbability(850) - 0.105) < 0.001)
})

test("implied probability from a negative price", () => {
  // -140 → 140/240
  assert.equal(impliedProbability(-140), 140 / 240)
  assert.ok(Math.abs(impliedProbability(-140) - 0.583) < 0.001)
})

test("an even-money-ish pair straddles 50%", () => {
  assert.ok(impliedProbability(-110) > 0.5)
  assert.ok(impliedProbability(110) < 0.5)
})

test("zero is treated as the longest shot rather than throwing", () => {
  // The importer rejects zero odds (§3.6); this only guards the render path.
  assert.equal(impliedProbability(0), 0)
})

test("the issue's worked example orders exactly as documented", () => {
  // Entered +110, +550, +850, +130 → displays +110, +130, +550, +850.
  const entered = [pick(110, 1), pick(550, 2), pick(850, 3), pick(130, 4)]
  assert.deepEqual(
    sortPicks(entered).map((p) => p.american_odds),
    [110, 130, 550, 850]
  )
})

test("negative prices sort ahead of positive ones — they're the favourites", () => {
  const picks = [pick(200, 1), pick(-150, 2), pick(100, 3), pick(-400, 4)]
  assert.deepEqual(
    sortPicks(picks).map((p) => p.american_odds),
    [-400, -150, 100, 200]
  )
})

test("equal prices fall back to sheet order, making the result deterministic", () => {
  // Three picks at the same price, handed in backwards.
  const picks = [pick(120, 9), pick(120, 3), pick(120, 7)]
  assert.deepEqual(
    sortPicks(picks).map((p) => p.sheet_pick_id),
    [3, 7, 9]
  )
})

test("the same input always gives the same output, whatever order it arrives in", () => {
  // This is the actual bug: an upsert reshuffling the rows Postgres returns
  // must not reshuffle the menu.
  const canonical = [pick(-200, 1), pick(150, 2), pick(150, 3), pick(600, 4)]
  const shuffled = [pick(150, 3), pick(600, 4), pick(-200, 1), pick(150, 2)]
  assert.deepEqual(
    sortPicks(shuffled).map((p) => p.sheet_pick_id),
    sortPicks(canonical).map((p) => p.sheet_pick_id)
  )
  assert.deepEqual(
    sortPicks(canonical).map((p) => p.sheet_pick_id),
    [1, 2, 3, 4]
  )
})

test("sortPicks does not mutate its input", () => {
  const picks = [pick(600, 1), pick(-200, 2)]
  const before = picks.map((p) => p.sheet_pick_id)
  sortPicks(picks)
  assert.deepEqual(
    picks.map((p) => p.sheet_pick_id),
    before
  )
})

test("comparePicks is a well-formed comparator (antisymmetric, reflexive-zero)", () => {
  const a = pick(110, 1)
  const b = pick(550, 2)
  assert.ok(comparePicks(a, b) < 0)
  assert.ok(comparePicks(b, a) > 0)
  assert.equal(comparePicks(a, a), 0)
})

test("extra fields survive the sort — it's generic over the pick shape", () => {
  const labelled = [
    { american_odds: 500, sheet_pick_id: 1, label: "Longshot" },
    { american_odds: -120, sheet_pick_id: 2, label: "Favourite" },
  ]
  assert.deepEqual(
    sortPicks(labelled).map((p) => p.label),
    ["Favourite", "Longshot"]
  )
})
