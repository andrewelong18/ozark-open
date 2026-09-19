// Unit tests for lib/chase.ts (Sprint 25 / #108, per phase since Sprint 30) —
// the chase list as a page.
//
// The cases still mirror the dry-run dataset, because that's the one everybody
// has already argued about: Devin Arand short of his Phase 1 entry, with
// people around him who are fine. What changed (ADR 0002) is that each close
// is its own reckoning — Phase 1's money is decided on Thursday, whether or
// not Phase 2 exists yet.

import test from "node:test"
import assert from "node:assert/strict"
import { buildChaseList, closingPhase, type ChaseParticipant } from "./chase.ts"
import type { ExistingPlacement, TournamentRules } from "./validation.ts"

const rules: TournamentRules = {
  entry_fee_min: 20,
  entry_fee_max: 50,
  min_picks_per_phase: 5,
  max_single_bet: 10,
  max_self_bet_pct: 0.25,
}

function picks(
  count: number,
  phase: 1 | 2,
  amount: number,
  prefix = "p",
  player: string | null = null
): ExistingPlacement[] {
  return Array.from({ length: count }, (_, i) => ({
    pick_id: `${prefix}-${phase}-${i}`,
    bet_id: `b-${phase}-${i}`,
    phase,
    amount,
    pick_player_user_id: player,
  }))
}

const DEVIN: ChaseParticipant = {
  user_id: "devin",
  display_name: "Devin Arand",
  is_player: true,
  phase1_entry_fee: 20,
  phase2_entry_fee: 20,
}
const ALEX: ChaseParticipant = {
  user_id: "alex",
  display_name: "Alex Leslie",
  is_player: true,
  phase1_entry_fee: 40,
  phase2_entry_fee: null,
}

// ---------------------------------------------------------------------------
// Which close is it
// ---------------------------------------------------------------------------

test("closingPhase reads the menu: hidden Phase 2 means we're closing Phase 1", () => {
  assert.equal(
    closingPhase([
      { phase: 1, status: "open" },
      { phase: 2, status: "hidden" },
    ]),
    1
  )
})

test("closingPhase flips once Phase 2 is revealed, open or closed", () => {
  assert.equal(closingPhase([{ phase: 2, status: "open" }]), 2)
  assert.equal(closingPhase([{ phase: 2, status: "closed" }]), 2)
})

// ---------------------------------------------------------------------------
// Phase 1 close — everyone entered in Phase 1 who isn't complete
// ---------------------------------------------------------------------------

test("at Phase 1 close, the incomplete Phase 1 entrant is chased with the cost named", () => {
  // Devin: 3 picks, $9 of $20. Alex: 5 picks, $40 of $40 — done.
  const placements = new Map([
    ["devin", picks(3, 1, 3)],
    ["alex", picks(5, 1, 8)],
  ])
  const list = buildChaseList([DEVIN, ALEX], placements, rules, 1)

  assert.equal(list.closing_phase, 1)
  assert.equal(list.chase.length, 1)
  assert.equal(list.chase[0].display_name, "Devin Arand")
  assert.equal(list.chase[0].reason, "$9 of $20, 3 of 5 picks → $11 forfeits")
  assert.equal(list.chase[0].forfeit, 11)

  const alex = list.people.find((p) => p.user_id === "alex")!
  assert.equal(alex.complete, true)
  assert.equal(alex.needs_a_text, false)
})

test("the one-line answer names the chased and nobody else", () => {
  const placements = new Map([
    ["devin", picks(3, 1, 3)],
    ["alex", picks(5, 1, 8)],
  ])
  const list = buildChaseList([DEVIN, ALEX], placements, rules, 1)
  assert.equal(
    list.line,
    "Closing Phase 1 — text these people: Devin Arand ($9 of $20, 3 of 5 picks → $11 forfeits)"
  )
})

test("nobody to chase says so, rather than printing an empty list", () => {
  const placements = new Map([["alex", picks(5, 1, 8)]])
  const list = buildChaseList([ALEX], placements, rules, 1)
  assert.equal(list.chase.length, 0)
  assert.match(list.line, /nobody to chase, everyone entered is complete/)
})

test("an entrant who never wagered IS chased — the whole entry is about to come back", () => {
  // Under one pot this was Q2's exemption (betting entirely in the other
  // phase was fine). Under two pots the entry belongs to this pot — and since
  // A28 an untouched entry forfeits nothing, so the whole $40 comes back. The
  // text is about the picks they meant to make, not money they're losing.
  const list = buildChaseList([ALEX], new Map(), rules, 1)
  assert.equal(list.people[0].needs_a_text, true)
  assert.equal(list.people[0].pick_count, 0)
  assert.equal(list.people[0].forfeit, 0)
  assert.equal(list.people[0].reason, "$0 of $40, 0 of 5 picks → $40 comes back")
})

test("the chase list ranks on unwagered money, not on the forfeit (A28)", () => {
  // Untouched $40 entry vs. $38 of $40 wagered. The second forfeits $2 and the
  // first forfeits nothing, so the pre-A28 tiebreak on (forfeit > 0) would put
  // the $2 gap first. Unwagered money is the honest ranking.
  const near: ChaseParticipant = { ...ALEX, user_id: "near", display_name: "Aa Near" }
  const list = buildChaseList(
    [near, ALEX],
    new Map([["near", picks(5, 1, 3, "near")]]),
    rules,
    1
  )
  // Aa Near wagered $15 of $40 — under the floor, so $5 forfeits and $25 is
  // unwagered. Alex wagered nothing: $0 forfeits, $40 unwagered. The old
  // tiebreak on (forfeit > 0) put Aa Near first, and so would the name.
  assert.equal(list.chase[0].forfeit, 0)
  assert.equal(list.chase[1].forfeit, 5)
  assert.deepEqual(
    list.chase.map((p) => p.display_name),
    ["Alex Leslie", "Aa Near"]
  )
})

test("over the minimum but under the entry reads as money coming back", () => {
  const list = buildChaseList([ALEX], new Map([["alex", picks(5, 1, 5)]]), rules, 1)
  assert.equal(list.chase[0].reason, "$25 of $40 → $15 comes back")
  assert.equal(list.chase[0].refund, 15)
  assert.equal(list.chase[0].forfeit, 0)
})

test("a self-bet that won't fully count is named", () => {
  // $50 entered, $20 wagered, $12 on himself: only $5 counts (Pat's example).
  const fifty: ChaseParticipant = { ...ALEX, user_id: "fifty", display_name: "Fifty Fred", phase1_entry_fee: 50 }
  const placements = new Map([
    ["fifty", [...picks(1, 1, 12, "self", "fifty"), ...picks(4, 1, 2)]],
  ])
  const list = buildChaseList([fifty], placements, rules, 1)
  assert.equal(
    list.chase[0].reason,
    "$20 of $50 → $30 comes back, only $5 of $12 on themselves counts"
  )
  assert.equal(list.chase[0].self_forfeit, 7)
})

// ---------------------------------------------------------------------------
// Phase 2 close — its own reckoning
// ---------------------------------------------------------------------------

test("at Phase 2 close only Phase 2 entrants are judged, on Phase 2 alone", () => {
  // Devin: complete in Phase 2, whatever Phase 1 looked like. Alex: no Phase 2
  // entry — not on the list at all, counted as not entered.
  const placements = new Map([
    ["devin", [...picks(2, 1, 3), ...picks(5, 2, 4, "q")]], // Phase 1 short; Phase 2 $20 of $20
    ["alex", picks(5, 1, 8)],
  ])
  const list = buildChaseList([DEVIN, ALEX], placements, rules, 2)

  assert.equal(list.closing_phase, 2)
  assert.deepEqual(list.people.map((p) => p.user_id), ["devin"])
  assert.equal(list.chase.length, 0)
  assert.equal(list.not_entered, 1)
})

test("a Phase 2 shortfall is chased on Phase 2's numbers", () => {
  const placements = new Map([["devin", [...picks(5, 1, 4), ...picks(2, 2, 3, "q")]]])
  const list = buildChaseList([DEVIN], placements, rules, 2)
  assert.equal(list.chase[0].reason, "$6 of $20, 2 of 5 picks → $14 forfeits")
})

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

test("chased people sort first, forfeits before refunds, then by name", () => {
  const zed: ChaseParticipant = { ...ALEX, user_id: "z", display_name: "Zed", phase1_entry_fee: 20 }
  const placements = new Map([
    ["alex", picks(5, 1, 8)], // complete
    ["devin", picks(3, 1, 3)], // $9 of $20 — forfeits
    ["z", picks(5, 1, 3)], // $15 of $20 — forfeits, later name
  ])
  const list = buildChaseList([ALEX, DEVIN, zed], placements, rules, 1)
  assert.deepEqual(
    list.people.map((p) => p.display_name),
    ["Devin Arand", "Zed", "Alex Leslie"]
  )
})
