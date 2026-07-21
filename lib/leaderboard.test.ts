// Unit tests for lib/leaderboard.ts — the pure half: the `+0;-0;"E"` par
// formatter and the raw-values → typed-rows parser. Zero-dependency by design:
// node:test via npm run test. The network fetch (getLeaderboard) isn't covered
// here — it hits the live Sheets API.

import test from "node:test"
import assert from "node:assert/strict"
import { formatToPar, parseLeaderboard } from "./leaderboard.ts"

test("formatToPar renders the sheet's +0;-0;\"E\" format", () => {
  assert.equal(formatToPar(3), "+3")
  assert.equal(formatToPar(12), "+12")
  assert.equal(formatToPar(-2), "-2")
  assert.equal(formatToPar(0), "E")
  assert.equal(formatToPar(null), "") // not yet scored → blank
  assert.equal(formatToPar(NaN), "")
  assert.equal(formatToPar(2.4), "+2") // format uses `0` — rounds to integer
  assert.equal(formatToPar(-0.4), "E") // rounds to 0 → even par
})

test("parseLeaderboard drops the header and maps columns A–H", () => {
  const header = [
    "Position",
    "Player",
    "Round 1 Points",
    "Round 2 Points",
    "Total Points",
    "Starting Strokes",
    "Round 3 Score",
    "Final Score",
  ]
  const rows = parseLeaderboard([
    header,
    ["T1", "Dan Mercer", 34, 30, 64, -2, -3, -5],
    ["3", "Jake Long", 28, 31, 59, 0, 1, 1],
  ])
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], {
    position: "T1",
    player: "Dan Mercer",
    round1Points: 34,
    round2Points: 30,
    totalPoints: 64,
    startingStrokes: -2,
    round3Score: -3,
    finalScore: -5,
  })
  assert.equal(rows[1].position, "3") // numeric position kept as text
  assert.equal(rows[1].startingStrokes, 0) // real zero, not null
})

test("parseLeaderboard treats blank and truncated cells as null", () => {
  const header = ["Position", "Player", "R1", "R2", "Total", "Start", "R3", "Final"]
  const rows = parseLeaderboard([
    header,
    // Round 3 not played yet: sheet truncates trailing empties → short row.
    ["1", "Sam Pin", 40, 35, 75, 1],
    // Explicit empty strings mid-row.
    ["2", "Al Green", "", 20, 20, "", "", ""],
  ])
  assert.equal(rows[0].round3Score, null)
  assert.equal(rows[0].finalScore, null)
  assert.equal(rows[0].startingStrokes, 1)
  assert.equal(rows[1].round1Points, null)
  assert.equal(rows[1].startingStrokes, null)
  assert.equal(rows[1].finalScore, null)
})

test("parseLeaderboard returns [] for empty or header-only sheets", () => {
  assert.deepEqual(parseLeaderboard([]), [])
  assert.deepEqual(parseLeaderboard([["Position", "Player"]]), [])
})
