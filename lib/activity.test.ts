// Unit tests for lib/activity.ts — the dashboard activity feed.
//
// The two properties worth defending here are the ones that don't announce
// themselves when they break: the quip interleave has to be STABLE (a poll
// every 20 seconds recomputes the whole feed, and a reshuffle would re-animate
// items under the reader), and it has to honour the every-five guarantee.

import test from "node:test"
import assert from "node:assert/strict"

import {
  buildFeed,
  phaseEventText,
  phaseEvents,
  placementEvents,
  type ActivityEvent,
  type FeedBet,
  type PlacementActivityRow,
  type RealEvent,
} from "./activity.ts"
import type { PhaseClock } from "./phases.ts"

// The 2026 deadlines as seeded by 20260810000000_phase_clock.sql: Round 1 and
// Round 3 tee-off, 11:00 America/Chicago = 16:00Z in September (CDT).
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

function betEvent(n: number, at: string): RealEvent {
  return {
    kind: "bet",
    id: `bet-${n}`,
    at,
    userId: `user-${n}`,
    name: `Member ${n}`,
    avatarUrl: null,
  }
}

/** A run of bet events one minute apart, oldest first. */
function betRun(count: number, from = Date.parse("2026-09-20T12:00:00Z")): RealEvent[] {
  return Array.from({ length: count }, (_, i) =>
    betEvent(i, new Date(from + i * 60_000).toISOString())
  )
}

const isQuip = (e: ActivityEvent) => e.kind === "quip"

// ---------------------------------------------------------------------------
// placementEvents
// ---------------------------------------------------------------------------

test("placementEvents maps rows to name-and-moment events, and nothing else", () => {
  const rows: PlacementActivityRow[] = [
    {
      id: "aaa",
      user_id: "u1",
      display_name: "Dan Mercer",
      avatar_url: "https://example.test/dan.png",
      created_at: "2026-09-20T12:00:00Z",
    },
  ]

  const [event] = placementEvents(rows)
  assert.deepEqual(event, {
    kind: "bet",
    id: "bet-aaa",
    at: "2026-09-20T12:00:00Z",
    userId: "u1",
    name: "Dan Mercer",
    avatarUrl: "https://example.test/dan.png",
  })
  // The position half never arrives here in the first place — the guarantee is
  // the column list in public.activity_placements(), and this asserts the shape
  // that depends on it.
  assert.deepEqual(Object.keys(event).sort(), [
    "at",
    "avatarUrl",
    "id",
    "kind",
    "name",
    "userId",
  ])
})

test("placementEvents drops rows it cannot render", () => {
  const rows = [
    { id: "a", user_id: "u1", display_name: "  ", avatar_url: null, created_at: "2026-09-20T12:00:00Z" },
    { id: "b", user_id: "u2", display_name: "Jake", avatar_url: null, created_at: "not-a-date" },
    { id: "c", user_id: "u3", display_name: "Pat", avatar_url: null, created_at: "2026-09-20T12:00:00Z" },
  ] as PlacementActivityRow[]

  assert.deepEqual(
    placementEvents(rows).map((e) => e.name),
    ["Pat"]
  )
})

// ---------------------------------------------------------------------------
// phaseEvents
// ---------------------------------------------------------------------------

const OPEN_P1: FeedBet[] = [
  { phase: 1, status: "open", opened_at: "2026-09-18T15:00:00Z" },
  { phase: 1, status: "open", opened_at: "2026-09-19T15:00:00Z" },
  { phase: 2, status: "hidden", opened_at: null },
]

test("phaseEvents opens a phase at its earliest opened_at", () => {
  const events = phaseEvents(OPEN_P1, CLOCK, new Date("2026-09-20T12:00:00Z"))
  assert.deepEqual(events, [
    {
      kind: "phase_open",
      id: "phase-1-open",
      at: "2026-09-18T15:00:00Z",
      phase: 1,
    },
  ])
})

test("phaseEvents closes a phase once its deadline has passed, at the deadline", () => {
  const events = phaseEvents(OPEN_P1, CLOCK, new Date("2026-09-24T18:00:00Z"))
  const close = events.find((e) => e.kind === "phase_close")
  // Normalised through Date.toISOString(), so it carries milliseconds — the
  // instant is what matters, and comparing instants says so.
  assert.equal(new Date(close!.at).getTime(), Date.parse("2026-09-24T16:00:00Z"))
  assert.equal(close?.phase, 1)
})

test("phaseEvents emits no close before the deadline", () => {
  const events = phaseEvents(OPEN_P1, CLOCK, new Date("2026-09-24T15:59:59Z"))
  assert.equal(events.some((e) => e.kind === "phase_close"), false)
})

test("phaseEvents says nothing about a phase nobody published", () => {
  const bets: FeedBet[] = [{ phase: 2, status: "hidden", opened_at: null }]
  assert.deepEqual(phaseEvents(bets, CLOCK, new Date("2026-09-27T12:00:00Z")), [])
})

test("phaseEvents invents no timestamp for a phase closed without a deadline", () => {
  // The pre-Sprint-25 way to close: flip every bet to closed in the sheet. It
  // leaves no moment to put in a timeline, so the feed stays quiet about it.
  const bets: FeedBet[] = [{ phase: 1, status: "closed", opened_at: null }]
  assert.deepEqual(phaseEvents(bets, NO_CLOCK, new Date("2026-09-25T12:00:00Z")), [])
})

test("phaseEvents skips an open whose stamp is missing or unparseable", () => {
  const bets: FeedBet[] = [
    { phase: 1, status: "open", opened_at: null },
    { phase: 1, status: "open", opened_at: "nonsense" },
  ]
  assert.deepEqual(phaseEvents(bets, NO_CLOCK, new Date("2026-09-20T12:00:00Z")), [])
})

// ---------------------------------------------------------------------------
// buildFeed — ordering
// ---------------------------------------------------------------------------

test("buildFeed returns newest first", () => {
  const feed = buildFeed(betRun(3))
  const times = feed.map((e) => new Date(e.at).getTime())
  assert.deepEqual([...times].sort((a, b) => b - a), times)
})

test("buildFeed interleaves phase events by time, not by kind", () => {
  const real: RealEvent[] = [
    betEvent(1, "2026-09-24T15:00:00Z"),
    { kind: "phase_close", id: "phase-1-close", at: "2026-09-24T16:00:00Z", phase: 1 },
    betEvent(2, "2026-09-24T17:00:00Z"),
  ]
  const kinds = buildFeed(real, []).map((e) => e.kind)
  assert.deepEqual(kinds, ["bet", "phase_close", "bet"])
})

// ---------------------------------------------------------------------------
// buildFeed — quips
// ---------------------------------------------------------------------------

test("buildFeed is deterministic: same input, same feed", () => {
  const real = betRun(20)
  assert.deepEqual(buildFeed(real), buildFeed(real))
})

test("buildFeed never leaves more than five real events without a quip", () => {
  const feed = buildFeed(betRun(60)).reverse() // oldest first, as the rule reads
  let gap = 0
  for (const event of feed) {
    if (isQuip(event)) {
      gap = 0
      continue
    }
    gap++
    assert.ok(gap <= 5, `went ${gap} real events without a quip`)
  }
})

test("buildFeed rolls quips in as well as forcing them", () => {
  // If the only quips were the forced ones, they would land on a perfect
  // 5-event cadence. The chance roll is what breaks that up.
  const feed = buildFeed(betRun(60)).reverse()
  const gaps: number[] = []
  let gap = 0
  for (const event of feed) {
    if (isQuip(event)) {
      gaps.push(gap)
      gap = 0
    } else gap++
  }
  assert.ok(gaps.length > 12, "expected a quip roughly every few events")
  assert.ok(
    gaps.some((g) => g < 5),
    "every quip was a forced one — the chance roll never fired"
  )
})

test("buildFeed keeps earlier quips exactly where they were as the feed grows", () => {
  // The property the 20-second poll depends on. The scan runs oldest-first, so
  // events arriving on top cannot re-decide anything already decided; a feed
  // that reshuffled here would re-animate items under the reader's thumb.
  const first = betRun(25)
  const later = [
    ...first,
    betEvent(100, "2026-09-20T14:00:00Z"),
    betEvent(101, "2026-09-20T14:01:00Z"),
  ]

  const before = buildFeed(first).reverse()
  const after = buildFeed(later).reverse()

  assert.deepEqual(after.slice(0, before.length), before)
})

test("buildFeed places no quip on an empty feed", () => {
  assert.deepEqual(buildFeed([]), [])
})

test("buildFeed survives an empty quip list", () => {
  const feed = buildFeed(betRun(12), [])
  assert.equal(feed.some(isQuip), false)
  assert.equal(feed.length, 12)
})

test("buildFeed never repeats a quip back to back", () => {
  const feed = buildFeed(betRun(80), ["one", "two"]).reverse()
  const lines = feed.filter(isQuip).map((e) => (e as { text: string }).text)
  for (let i = 1; i < lines.length; i++) {
    assert.notEqual(lines[i], lines[i - 1])
  }
})

test("buildFeed gives a quip the timestamp of the event it follows", () => {
  const feed = buildFeed(betRun(20)).reverse()
  for (let i = 1; i < feed.length; i++) {
    if (!isQuip(feed[i])) continue
    assert.equal(feed[i].at, feed[i - 1].at)
    assert.equal(feed[i].id, `quip-${feed[i - 1].id}`)
  }
})

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

test("phaseEventText names the round a close hands off to", () => {
  assert.match(
    phaseEventText({ kind: "phase_close", id: "x", at: "", phase: 1 }),
    /Round 1 is under way/
  )
  assert.match(
    phaseEventText({ kind: "phase_close", id: "x", at: "", phase: 2 }),
    /Round 3 is under way/
  )
  assert.match(
    phaseEventText({ kind: "phase_open", id: "x", at: "", phase: 2 }),
    /Phase 2 is open/
  )
})
