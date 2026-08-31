// Unit tests for lib/format.ts — probability display, the relative/absolute
// timestamp pair /admin/roster renders, and the compact stamp the activity feed
// puts at the end of a chat row. Zero-dependency: node:test via npm test.

import test from "node:test"
import assert from "node:assert/strict"
import {
  formatElapsedShort,
  formatProbability,
  formatRelativeTime,
  formatTimestamp,
} from "./format.ts"

const NOW = new Date("2026-07-25T12:00:00Z")

/** A stamp `ms` before NOW. */
function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString()
}

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

test("formatProbability renders one decimal place", () => {
  assert.equal(formatProbability(0.4761), "47.6%")
})

// ---------------------------------------------------------------------------
// formatRelativeTime — bucket boundaries
// ---------------------------------------------------------------------------

test("formatRelativeTime walks the bucket ladder", () => {
  const cases: [number, string][] = [
    [59 * SECOND, "just now"],
    [MINUTE, "1 minute ago"],
    [2 * MINUTE, "2 minutes ago"],
    [59 * MINUTE, "59 minutes ago"],
    [HOUR, "1 hour ago"],
    [23 * HOUR, "23 hours ago"],
    [DAY, "1 day ago"],
    [6 * DAY, "6 days ago"],
    [7 * DAY, "1 week ago"],
    [34 * DAY, "4 weeks ago"],
    [35 * DAY, "1 month ago"],
    [364 * DAY, "12 months ago"],
    [365 * DAY, "1 year ago"],
    [800 * DAY, "2 years ago"],
  ]
  for (const [elapsed, expected] of cases) {
    assert.equal(formatRelativeTime(ago(elapsed), NOW), expected)
  }
})

test("formatRelativeTime accepts a numeric now", () => {
  assert.equal(formatRelativeTime(ago(2 * DAY), NOW.getTime()), "2 days ago")
})

test("a future timestamp reads 'just now', never a negative duration", () => {
  assert.equal(formatRelativeTime(ago(-5 * DAY), NOW), "just now")
})

test("a missing or unparseable stamp reads 'Never'", () => {
  assert.equal(formatRelativeTime(null, NOW), "Never")
  assert.equal(formatRelativeTime(undefined, NOW), "Never")
  assert.equal(formatRelativeTime("", NOW), "Never")
  assert.equal(formatRelativeTime("garbage", NOW), "Never")
})

// ---------------------------------------------------------------------------
// formatTimestamp — the hover title
// ---------------------------------------------------------------------------

test("formatTimestamp renders the tournament's clock", () => {
  // 12:00 UTC is 07:00 CDT on July 4.
  const out = formatTimestamp("2026-07-04T12:00:00Z")
  assert.match(out, /Jul 4, 2026/)
  assert.match(out, /7:00\s?AM/)
  assert.match(out, /CT$/)
})

test("formatTimestamp is empty for a missing or unparseable stamp", () => {
  assert.equal(formatTimestamp(null), "")
  assert.equal(formatTimestamp(undefined), "")
  assert.equal(formatTimestamp(""), "")
  assert.equal(formatTimestamp("garbage"), "")
})

// ---------------------------------------------------------------------------
// formatElapsedShort — the activity feed's chat-row stamp
// ---------------------------------------------------------------------------

test("formatElapsedShort buckets to now / m / h / d", () => {
  assert.equal(formatElapsedShort(ago(5 * SECOND), NOW), "now")
  assert.equal(formatElapsedShort(ago(59 * SECOND), NOW), "now")
  assert.equal(formatElapsedShort(ago(MINUTE), NOW), "1m")
  assert.equal(formatElapsedShort(ago(59 * MINUTE), NOW), "59m")
  assert.equal(formatElapsedShort(ago(HOUR), NOW), "1h")
  assert.equal(formatElapsedShort(ago(23 * HOUR), NOW), "23h")
  assert.equal(formatElapsedShort(ago(DAY), NOW), "1d")
  assert.equal(formatElapsedShort(ago(9 * DAY), NOW), "9d")
})

test("formatElapsedShort reads a future stamp as now, never as a negative age", () => {
  const ahead = new Date(NOW.getTime() + 30 * SECOND).toISOString()
  assert.equal(formatElapsedShort(ahead, NOW), "now")
})

test("formatElapsedShort is empty for a missing or unparseable stamp", () => {
  assert.equal(formatElapsedShort(null, NOW), "")
  assert.equal(formatElapsedShort(undefined, NOW), "")
  assert.equal(formatElapsedShort("garbage", NOW), "")
})
