import { test } from "node:test"
import assert from "node:assert/strict"

import {
  DEFAULT_SNAPSHOT_RETENTION,
  SNAPSHOT_TABLES,
  describeDelta,
  snapshotRetention,
} from "./snapshots.ts"

// Sprint 11. The only branching logic on the app side of snapshots is how the
// retention env var is read, and it's worth pinning because every wrong answer
// is destructive in the same direction: a value that reaches the database as 0
// or a negative asks it to prune the entire history, including the snapshot
// just written. The migration guards that too (p_keep > 0), but a typo in a
// Vercel env var should be caught before it becomes a DELETE.

test("an unset variable falls back to the generous default", () => {
  assert.equal(snapshotRetention(undefined), DEFAULT_SNAPSHOT_RETENTION)
})

test("an empty or whitespace value is treated as unset", () => {
  assert.equal(snapshotRetention(""), DEFAULT_SNAPSHOT_RETENTION)
  assert.equal(snapshotRetention("   "), DEFAULT_SNAPSHOT_RETENTION)
})

test("a plain integer is used as-is, surrounding whitespace and all", () => {
  assert.equal(snapshotRetention("7"), 7)
  assert.equal(snapshotRetention(" 120 "), 120)
})

test("zero and negatives fall back rather than asking the database to prune everything", () => {
  assert.equal(snapshotRetention("0"), DEFAULT_SNAPSHOT_RETENTION)
  assert.equal(snapshotRetention("-5"), DEFAULT_SNAPSHOT_RETENTION)
})

test("non-numeric and non-integer values fall back", () => {
  assert.equal(snapshotRetention("lots"), DEFAULT_SNAPSHOT_RETENTION)
  assert.equal(snapshotRetention("10.5"), DEFAULT_SNAPSHOT_RETENTION)
  assert.equal(snapshotRetention("1e3"), 1000) // Number() accepts it; it is an integer
})

test("the default is generous — a tournament weekend of history at any sane interval", () => {
  assert.ok(DEFAULT_SNAPSHOT_RETENTION >= 24)
})

// Sprint 27. describeDelta is the only piece of the restore confirmation a unit
// test can reach, and it is worth reaching: it is the sentence that tells an
// admin how much they are about to throw away, and the two directions mean
// opposite things. Getting the sign backwards would read as reassuring
// ("2 will come back") at the moment it should read as a warning.
//
// The strings are word for word what scripts/restore-snapshot.ts prints, so an
// admin who has run the script and an admin reading the console are told the
// same thing in the same words.

test("more rows now than in the save state means they are discarded", () => {
  assert.equal(describeDelta(10, 7), "(3 will be discarded)")
  assert.equal(describeDelta(1, 0), "(1 will be discarded)")
})

test("fewer rows now than in the save state means they come back", () => {
  assert.equal(describeDelta(7, 10), "(3 will come back)")
  assert.equal(describeDelta(0, 1), "(1 will come back)")
})

test("no difference says nothing at all, rather than '(0 will be discarded)'", () => {
  assert.equal(describeDelta(0, 0), "")
  assert.equal(describeDelta(87, 87), "")
})

// The count is always the SIZE of the change, never a negative number — the
// direction is carried by the words. "(-3 will come back)" would be the shape
// of the bug, and it is the one a sign slip produces.
test("neither direction ever prints a negative", () => {
  assert.ok(!describeDelta(7, 10).includes("-"))
  assert.ok(!describeDelta(10, 7).includes("-"))
})

test("the five money tables are listed parent-first, matching the SQL", () => {
  // Same set and order as take_snapshot()'s payload and restore_snapshot()'s
  // inserts. If these ever disagree, the console's deltas line up against the
  // wrong table names.
  assert.deepEqual(SNAPSHOT_TABLES, [
    "tournaments",
    "tournament_participants",
    "bets",
    "bet_picks",
    "bet_placements",
  ])
})
