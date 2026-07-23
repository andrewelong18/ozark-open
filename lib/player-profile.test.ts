// Unit tests for lib/player-profile.ts — the pure half of the profile modal:
// row normalization + null fallbacks, past_performance parsing/sorting, the
// deterministic dummy series, and bar-geometry scaling. Zero-dependency by
// design: node:test via npm run test.

import test from "node:test"
import assert from "node:assert/strict"
import {
  chartBars,
  dummyPastPerformance,
  normalizeProfileRow,
  parsePastPerformance,
} from "./player-profile.ts"

// ---------------------------------------------------------------------------
// parsePastPerformance
// ---------------------------------------------------------------------------

test("parsePastPerformance sorts oldest→newest and coerces values", () => {
  const out = parsePastPerformance([
    { year: 2025, value: "70" },
    { year: 2022, value: 40 },
    { year: 2024, value: 55 },
  ])
  assert.deepEqual(
    out.map((p) => p.year),
    [2022, 2024, 2025]
  )
  assert.equal(out[2].value, 70)
})

test("parsePastPerformance drops malformed points, not the whole series", () => {
  const out = parsePastPerformance([
    { year: 2023, value: 50 },
    { year: null, value: 60 },
    { value: 60 },
    { year: 2024 },
    "nope",
    null,
  ])
  assert.deepEqual(out, [{ year: 2023, value: 50 }])
})

test("parsePastPerformance accepts a JSON string and rejects junk", () => {
  assert.deepEqual(parsePastPerformance('[{"year":2024,"value":12}]'), [
    { year: 2024, value: 12 },
  ])
  assert.deepEqual(parsePastPerformance("not json"), [])
  assert.deepEqual(parsePastPerformance(null), [])
  assert.deepEqual(parsePastPerformance({ year: 2024 }), [])
})

// ---------------------------------------------------------------------------
// dummyPastPerformance
// ---------------------------------------------------------------------------

test("dummyPastPerformance is deterministic, 4 points, in range", () => {
  const a = dummyPastPerformance("user-abc")
  const b = dummyPastPerformance("user-abc")
  assert.deepEqual(a, b)
  assert.equal(a.length, 4)
  assert.deepEqual(
    a.map((p) => p.year),
    [2022, 2023, 2024, 2025]
  )
  for (const p of a) {
    assert.ok(p.value >= 40 && p.value < 95, `value ${p.value} in range`)
  }
})

test("dummyPastPerformance differs across ids", () => {
  assert.notDeepEqual(dummyPastPerformance("aaa"), dummyPastPerformance("zzz"))
})

// ---------------------------------------------------------------------------
// normalizeProfileRow
// ---------------------------------------------------------------------------

test("normalizeProfileRow keeps real values and parses stats", () => {
  const p = normalizeProfileRow(
    {
      display_name: "Dan Mercer",
      nickname: "Merc",
      avatar_url: "https://x/y",
      bio: "A legend.",
      hometown: "Branson, MO",
      member_since: "2018",
      strength: "Putting",
      weakness: "Bunkers",
      past_performance: [{ year: 2024, value: 61 }],
    },
    "id-1"
  )
  assert.equal(p.display_name, "Dan Mercer")
  assert.equal(p.member_since, 2018)
  assert.deepEqual(p.past_performance, [{ year: 2024, value: 61 }])
})

test("normalizeProfileRow blanks/nulls fall back cleanly", () => {
  const p = normalizeProfileRow(
    { display_name: "  ", bio: "   ", member_since: null, past_performance: [] },
    "id-2"
  )
  assert.equal(p.display_name, "Unknown member")
  assert.equal(p.bio, null)
  assert.equal(p.member_since, null)
  // Empty series → deterministic dummy so the chart still draws.
  assert.equal(p.past_performance.length, 4)
  assert.deepEqual(p.past_performance, dummyPastPerformance("id-2"))
})

test("normalizeProfileRow tolerates a null row", () => {
  const p = normalizeProfileRow(null, "id-3")
  assert.equal(p.display_name, "Unknown member")
  assert.equal(p.past_performance.length, 4)
})

// ---------------------------------------------------------------------------
// chartBars
// ---------------------------------------------------------------------------

test("chartBars scales to the max and flags the best year once", () => {
  const bars = chartBars(
    [
      { year: 2022, value: 25 },
      { year: 2023, value: 50 },
      { year: 2024, value: 50 },
    ],
    100
  )
  assert.equal(bars[0].barHeight, 50) // 25/50 * 100
  assert.equal(bars[1].barHeight, 100) // max fills height
  assert.equal(bars[1].best, true)
  assert.equal(bars[2].best, false) // only the first peak is gold
})

test("chartBars handles empty + all-zero series without dividing by zero", () => {
  assert.deepEqual(chartBars([], 100), [])
  const zero = chartBars([{ year: 2024, value: 0 }], 100)
  assert.equal(zero[0].barHeight, 0)
  assert.equal(zero[0].best, true)
})
