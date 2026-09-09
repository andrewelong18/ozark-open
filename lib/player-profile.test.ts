// Unit tests for lib/player-profile.ts — the pure half of the profile modal:
// row normalization + null fallbacks, and past_performance parsing/sorting.
// Zero-dependency by design: node:test via npm run test.
//
// Sprint 26 rewrote the series half of this file. The old cases covered a
// score, a deterministic dummy filler and bar geometry; the data is now a
// finishing PLACE, an absent series is meant to render nothing, and there are
// no bars. What survives from the old suite is what still describes the
// module: sorting, malformed-point tolerance, and the null-row fallbacks.

import test from "node:test"
import assert from "node:assert/strict"
import { normalizeProfileRow, parsePastPerformance } from "./player-profile.ts"

// ---------------------------------------------------------------------------
// parsePastPerformance
// ---------------------------------------------------------------------------

test("parsePastPerformance sorts oldest→newest", () => {
  const out = parsePastPerformance([
    { year: 2025, place: "6" },
    { year: 2022, place: "1" },
    { year: 2024, place: "2" },
  ])
  assert.deepEqual(
    out.map((p) => p.year),
    [2022, 2024, 2025]
  )
})

test("parsePastPerformance reads a tie as rank + tied, and keeps the label", () => {
  const [p] = parsePastPerformance([{ year: 2024, place: "T15" }])
  assert.deepEqual(p, { year: 2024, place: "T15", rank: 15, tied: true })
})

test("parsePastPerformance normalizes sloppy place cells", () => {
  // Lowercase t, a trailing .0 from the spreadsheet, a numeric cell, padding.
  assert.deepEqual(parsePastPerformance([{ year: 2023, place: "t9" }])[0].place, "T9")
  assert.deepEqual(parsePastPerformance([{ year: 2023, place: "12.0" }])[0].place, "12")
  assert.deepEqual(parsePastPerformance([{ year: 2023, place: 4 }])[0].place, "4")
  assert.deepEqual(parsePastPerformance([{ year: 2023, place: " 7 " }])[0].place, "7")
})

test("parsePastPerformance drops malformed points, not the whole series", () => {
  const out = parsePastPerformance([
    { year: 2023, place: "5" },
    { year: null, place: "6" },
    { place: "6" },
    { year: 2024 },
    { year: 2024, place: "" },
    { year: 2024, place: "0" }, // there is no 0th place
    { year: 2024, place: "DNF" },
    "nope",
    null,
  ])
  assert.deepEqual(out, [{ year: 2023, place: "5", rank: 5, tied: false }])
})

test("parsePastPerformance ignores the Sprint 18 {year, value} shape", () => {
  // A database that predates the migration renders an empty section rather
  // than scores relabelled as finishes.
  assert.deepEqual(parsePastPerformance([{ year: 2024, value: 61 }]), [])
})

test("parsePastPerformance accepts a JSON string and rejects junk", () => {
  assert.deepEqual(parsePastPerformance('[{"year":2024,"place":"12"}]'), [
    { year: 2024, place: "12", rank: 12, tied: false },
  ])
  assert.deepEqual(parsePastPerformance("not json"), [])
  assert.deepEqual(parsePastPerformance(null), [])
  assert.deepEqual(parsePastPerformance({ year: 2024 }), [])
})

// ---------------------------------------------------------------------------
// normalizeProfileRow
// ---------------------------------------------------------------------------

test("normalizeProfileRow keeps real values and parses finishes", () => {
  const p = normalizeProfileRow({
    display_name: "Dan Mercer",
    nickname: "Boom",
    avatar_url: "https://x/y",
    bio: "A legend.",
    hometown: "Union, MO",
    member_since: "2024",
    strength: "Organizing side bets",
    weakness: "Cock",
    past_performance: [
      { year: 2025, place: "1" },
      { year: 2024, place: "T8" },
    ],
  })
  assert.equal(p.display_name, "Dan Mercer")
  assert.equal(p.member_since, 2024)
  assert.deepEqual(p.past_performance, [
    { year: 2024, place: "T8", rank: 8, tied: true },
    { year: 2025, place: "1", rank: 1, tied: false },
  ])
})

test("normalizeProfileRow blanks/nulls fall back cleanly", () => {
  const p = normalizeProfileRow({
    display_name: "  ",
    bio: "   ",
    member_since: null,
    past_performance: [],
  })
  assert.equal(p.display_name, "Unknown member")
  assert.equal(p.bio, null)
  assert.equal(p.member_since, null)
  // Stays empty — the modal drops the Past Finishes section entirely for a
  // debutant rather than inventing a history for them.
  assert.deepEqual(p.past_performance, [])
})

test("normalizeProfileRow tolerates a null row", () => {
  const p = normalizeProfileRow(null)
  assert.equal(p.display_name, "Unknown member")
  assert.deepEqual(p.past_performance, [])
})
