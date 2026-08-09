import { test } from "node:test"
import assert from "node:assert/strict"

import {
  DEFAULT_SNAPSHOT_RETENTION,
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
