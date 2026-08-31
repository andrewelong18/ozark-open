// The dashboard activity feed — a timeline of three event kinds.
//
// Pure module by design — no Supabase, no "@/" alias imports — so the
// node:test suite exercises the exact code the API route and the dashboard
// run. `now` is always a parameter, the same rule lib/phases.ts follows, so
// every state below is reachable without waiting for September.
//
// The house lines are fiction and are meant to read as fact — same row shape as
// a wager, same linked name, same stamp (lib/activity-quips.ts). Nothing about
// them is derived from data, which is why they cost the section below nothing.
//
// WHAT THE FEED SAYS, and the line it does not cross: a bet event carries the
// bettor's NAME and the MOMENT, and nothing else. No pick, no amount, no odds,
// no bet title. PRD §8 gates (participant, pick, amount) together behind a bet
// closing; naming the bettor while withholding the position is the agreed
// refinement of COMPETITIVE_ANALYSIS §2.4, recorded in PRD §12. The column list
// in public.activity_placements() is where that is enforced — this module never
// receives the position half in the first place.

import {
  deadlineFor,
  phaseState,
  type PhaseBet,
  type PhaseClock,
} from "./phases.ts"
import { ACTIVITY_QUIPS, type Quip } from "./activity-quips.ts"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Someone put money on something. Which something is deliberately absent. */
export type BetEvent = {
  kind: "bet"
  id: string
  at: string
  userId: string
  name: string
  avatarUrl: string | null
}

/** A betting window opened or closed. */
export type PhaseEvent = {
  kind: "phase_open" | "phase_close"
  id: string
  at: string
  phase: 1 | 2
}

/**
 * A house line, dressed as an event: the member it names, what it claims they
 * did, and the profile it links to when that member has an account. Fiction —
 * nothing here is read from a placement (lib/activity-quips.ts).
 */
export type QuipEvent = {
  kind: "quip"
  id: string
  at: string
  name: string
  line: string
  /** Null when the name matches no member — the row renders as plain text. */
  userId: string | null
  avatarUrl: string | null
}

/** Events that actually happened — everything except the quips. */
export type RealEvent = BetEvent | PhaseEvent

export type ActivityEvent = RealEvent | QuipEvent

/** One row of public.activity_placements(), verbatim. */
export type PlacementActivityRow = {
  id: string
  user_id: string
  display_name: string | null
  avatar_url: string | null
  created_at: string
}

/** A member, for matching a house line's name to a profile. */
export type FeedMember = {
  id: string
  display_name: string | null
  avatar_url?: string | null
}

/** The minimum a bet has to expose for the phase events. A superset of
 *  PhaseBet, so the same rows drive lib/phases.ts's state machine. */
export type FeedBet = PhaseBet & { opened_at?: string | null }

// ---------------------------------------------------------------------------
// Real events
// ---------------------------------------------------------------------------

/**
 * RPC rows → bet events. A row with no readable name is dropped rather than
 * rendered as "someone": the feed's whole shape is a linked profile name, and a
 * nameless row is a data fault worth noticing on /admin/people, not a mystery
 * to display on the dashboard.
 */
export function placementEvents(rows: PlacementActivityRow[]): BetEvent[] {
  const events: BetEvent[] = []
  for (const row of rows) {
    const name = (row.display_name ?? "").trim()
    if (!row.id || !row.user_id || !name || !row.created_at) continue
    if (Number.isNaN(new Date(row.created_at).getTime())) continue
    events.push({
      kind: "bet",
      id: `bet-${row.id}`,
      at: row.created_at,
      userId: row.user_id,
      name,
      avatarUrl: row.avatar_url ?? null,
    })
  }
  return events
}

/**
 * The phase events, derived rather than stored.
 *
 * OPEN comes from the earliest `bets.opened_at` in the phase — the importer
 * stamps that on the transition into `open`, because created_at is the wrong
 * answer for Phase 2 (hidden in early uploads, upserted by sheet_bet_id, so the
 * row keeps a created_at from weeks before it opened).
 *
 * CLOSE comes from the phase deadline on the tournaments row — which IS the
 * Round 1 / Round 3 tee-off (supabase/migrations/20260810000000_phase_clock.sql)
 * — and only once it has passed. A phase that closed because every one of its
 * bets was flipped to `closed` with no deadline set emits nothing: there is no
 * timestamp for it, and inventing one would put a lie in a timeline.
 *
 * Both are gated on the phase being published at all, so an unreleased Phase 2
 * whose deadline slid by never announces itself.
 */
export function phaseEvents(
  bets: FeedBet[],
  clock: PhaseClock,
  now: Date
): PhaseEvent[] {
  const events: PhaseEvent[] = []

  for (const phase of [1, 2] as const) {
    if (phaseState(phase, clock, bets, now) === "unpublished") continue

    const openedAt = bets
      .filter((b) => b.phase === phase && b.status !== "hidden")
      .map((b) => b.opened_at)
      .filter((at): at is string => {
        if (!at) return false
        return !Number.isNaN(new Date(at).getTime())
      })
      .sort()[0]

    if (openedAt && new Date(openedAt).getTime() <= now.getTime()) {
      events.push({
        kind: "phase_open",
        id: `phase-${phase}-open`,
        at: openedAt,
        phase,
      })
    }

    const deadline = deadlineFor(phase, clock)
    if (deadline && now.getTime() >= deadline.getTime()) {
      events.push({
        kind: "phase_close",
        id: `phase-${phase}-close`,
        at: deadline.toISOString(),
        phase,
      })
    }
  }

  return events
}

// ---------------------------------------------------------------------------
// The feed
// ---------------------------------------------------------------------------

/** Chance of a quip after any given real event, in percent. */
const QUIP_CHANCE = 25
/** …and the guarantee: never more than this many real events without one. */
const QUIP_FORCE_EVERY = 5

/**
 * FNV-1a, 32-bit. A hash and not Math.random() for the reason the whole
 * interleave hangs on: the feed is recomputed from scratch on every 20-second
 * poll, and a random roll would deal a different hand each time — quips
 * appearing, vanishing and swapping places under the reader, every item
 * re-animating as its id changed. Seeded off the preceding event's id, the same
 * feed always produces the same quips, on every poll and for every member.
 */
function hash(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** Oldest first, ties broken by id so the order is total and stable. */
function ascending(a: RealEvent, b: RealEvent): number {
  const at = new Date(a.at).getTime() - new Date(b.at).getTime()
  return at !== 0 ? at : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * The feed: real events with quips interleaved, newest first.
 *
 * The scan runs OLDEST first, which is what makes the result stable as the feed
 * grows. New events arrive at the newest end, so every quip decision already
 * made is downstream of nothing that changed — poll after poll, the only
 * difference in the output is what got added on top.
 *
 * A quip lands after a real event when its id rolls under QUIP_CHANCE, or when
 * QUIP_FORCE_EVERY real events have passed without one — the "at least every
 * five messages" guarantee. It takes that event's timestamp so it sorts into
 * the same place forever, and its line is chosen by the same hash, stepped
 * forward if it would repeat the previous quip back to back.
 */
export function buildFeed(
  real: RealEvent[],
  quips: readonly Quip[] = ACTIVITY_QUIPS,
  members: FeedMember[] = []
): ActivityEvent[] {
  const ordered = [...real].sort(ascending)
  const byName = memberIndex(members)
  const out: ActivityEvent[] = []

  let sinceQuip = 0
  let lastLine: string | null = null

  for (const event of ordered) {
    out.push(event)
    sinceQuip++

    if (quips.length === 0) continue

    const roll = hash(event.id) % 100
    if (roll >= QUIP_CHANCE && sinceQuip < QUIP_FORCE_EVERY) continue

    let index = hash(`${event.id}:quip`) % quips.length
    // Never the same line twice running — with nineteen lines the collision is
    // rare, and back-to-back repetition is the one way a deterministic joke
    // reads as a bug.
    if (quips.length > 1 && quips[index].line === lastLine) {
      index = (index + 1) % quips.length
    }

    const quip = quips[index]
    const member = byName.get(matchKey(quip.name))

    out.push({
      kind: "quip",
      id: `quip-${event.id}`,
      // The preceding event's moment, which is what drops the line BETWEEN the
      // real ones and keeps it there. A generated-at-render stamp would move on
      // every 20-second poll, and the row would re-animate each time.
      at: event.at,
      name: quip.name,
      line: quip.line,
      userId: member?.id ?? null,
      avatarUrl: member?.avatar_url ?? null,
    })
    lastLine = quip.line
    sinceQuip = 0
  }

  return out.reverse()
}

/**
 * The name a house line is matched to a member by: trimmed and lowercased,
 * the same key lib/import.ts matches pick labels to display names with (ADR
 * 0001 §11). Sharing the convention is the point — a member who links from a
 * pick links from a joke, and neither has to be maintained separately.
 */
function matchKey(name: string): string {
  return name.trim().toLowerCase()
}

/** First row wins on a duplicate display name: two members with one name is a
 *  data fault for /admin/people, and picking one is better than dropping the
 *  link. */
function memberIndex(members: FeedMember[]): Map<string, FeedMember> {
  const index = new Map<string, FeedMember>()
  for (const member of members) {
    const key = matchKey(member.display_name ?? "")
    if (!key || !member.id || index.has(key)) continue
    index.set(key, member)
  }
  return index
}

/** The line as written, for a plain-text render or an assertion. */
export function quipText(event: QuipEvent): string {
  return `${event.name} ${event.line}`
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/**
 * What a phase event says. The close line names the round because that is what
 * the deadline actually is — Phase 1 closes at Round 1's tee-off, Phase 2 at
 * Round 3's (PRD §8) — and "betting is closed" alone reads like the tournament
 * ended.
 */
export function phaseEventText(event: PhaseEvent): string {
  const round = event.phase === 1 ? "Round 1" : "Round 3"
  return event.kind === "phase_open"
    ? `Phase ${event.phase} is open — the board is live.`
    : `Phase ${event.phase} betting is closed. ${round} is under way.`
}
