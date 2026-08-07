// Unit tests for lib/chase.ts (Sprint 25 / #108) — the chase list as a page.
//
// The cases mirror the dry-run dataset, because that's the one everybody has
// already argued about: Devin Arand at 3 Phase 1 picks and $18 of $20, with
// thirteen other people who are legitimately mid-tournament.

import test from "node:test"
import assert from "node:assert/strict"
import { buildChaseList, closingPhase, type ChaseParticipant } from "./chase.ts"
import type { ExistingPlacement, TournamentRules } from "./validation.ts"

const rules: TournamentRules = {
  entry_fee_min: 20,
  entry_fee_max: 50,
  min_picks_per_tournament: 5,
  max_picks_per_phase: 10,
  max_single_bet_pct: 0.5,
  max_single_bet_cap: 20,
  max_self_bet_pct: 0.25,
  max_self_bet_cap: 10,
}

function picks(
  count: number,
  phase: 1 | 2,
  amount: number,
  prefix = "p"
): ExistingPlacement[] {
  return Array.from({ length: count }, (_, i) => ({
    pick_id: `${prefix}-${phase}-${i}`,
    bet_id: `b-${phase}-${i}`,
    phase,
    amount,
    pick_player_user_id: null,
  }))
}

const DEVIN: ChaseParticipant = {
  user_id: "devin",
  display_name: "Devin Arand",
  entry_fee: 20,
}
const ALEX: ChaseParticipant = {
  user_id: "alex",
  display_name: "Alex Leslie",
  entry_fee: 40,
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
// Phase 1 close — the #98 regression, as a page
// ---------------------------------------------------------------------------

test("at Phase 1 close, only the under-minimum bettor is chased", () => {
  // Devin: 3 picks, $8 of $20. Alex: 6 picks, $24 of $40 — mid-tournament and
  // perfectly fine, even though he's nowhere near his exact total.
  const placements = new Map([
    ["devin", picks(3, 1, 3)],
    ["alex", picks(6, 1, 4)],
  ])
  const list = buildChaseList([DEVIN, ALEX], placements, rules, 1)

  assert.equal(list.closing_phase, 1)
  assert.equal(list.chase.length, 1)
  assert.equal(list.chase[0].display_name, "Devin Arand")
  assert.equal(list.chase[0].reason, "3 of 5 picks")

  // Alex is off his exact total and is NOT chased — that's the whole fix.
  const alex = list.people.find((p) => p.user_id === "alex")!
  assert.equal(alex.off_exact_total, true)
  assert.equal(alex.needs_a_text, false)
})

test("the one-line answer names the chased and nobody else", () => {
  const placements = new Map([
    ["devin", picks(3, 1, 3)],
    ["alex", picks(6, 1, 4)],
  ])
  const list = buildChaseList([DEVIN, ALEX], placements, rules, 1)
  assert.equal(
    list.line,
    "Closing Phase 1 — text these people: Devin Arand (3 of 5 picks)"
  )
})

test("nobody to chase says so, rather than printing an empty list", () => {
  const placements = new Map([["alex", picks(6, 1, 4)]])
  const list = buildChaseList([ALEX], placements, rules, 1)
  assert.equal(list.chase.length, 0)
  assert.match(list.line, /nobody to chase, everyone is compliant/)
})

test("a bettor who hasn't wagered at all isn't chased on the minimum (Q2)", () => {
  const list = buildChaseList([ALEX], new Map(), rules, 1)
  assert.equal(list.people[0].under_minimum, false)
  assert.equal(list.people[0].needs_a_text, false)
  assert.equal(list.people[0].total_picks, 0)
})

// ---------------------------------------------------------------------------
// Phase 2 close — the exact total finally counts
// ---------------------------------------------------------------------------

test("at Phase 2 close the exact total becomes a reason to text", () => {
  // Devin's 3+5 = 8 picks clears the tournament-wide minimum (#96), so the
  // only thing left against him is the $2 he never placed.
  const placements = new Map([
    ["devin", [...picks(3, 1, 3), ...picks(5, 2, 1, "q")]], // $9 + $5 = $14
    ["alex", picks(10, 1, 4)], // $40 of $40 exactly
  ])
  const list = buildChaseList([DEVIN, ALEX], placements, rules, 2)

  assert.equal(list.chase.length, 1)
  assert.equal(list.chase[0].user_id, "devin")
  assert.equal(list.chase[0].under_minimum, false, "8 picks clears the minimum")
  assert.equal(list.chase[0].reason, "$14 of $20")
})

test("both reasons on one person read together", () => {
  const placements = new Map([["devin", picks(2, 1, 3)]])
  const list = buildChaseList([DEVIN], placements, rules, 2)
  assert.equal(list.chase[0].reason, "2 of 5 picks, $6 of $20")
})

test("someone who never wagered IS chased at Phase 2 close, on the total", () => {
  const list = buildChaseList([ALEX], new Map(), rules, 2)
  assert.equal(list.chase.length, 1)
  assert.equal(list.chase[0].reason, "$0 of $40")
})

// ---------------------------------------------------------------------------
// Ordering and counts
// ---------------------------------------------------------------------------

test("chased people sort first, then under-minimum, then by name", () => {
  const zed: ChaseParticipant = { user_id: "z", display_name: "Zed", entry_fee: 20 }
  const placements = new Map([
    ["alex", picks(6, 1, 4)], // fine
    ["devin", picks(3, 1, 3)], // under minimum
    ["z", picks(1, 1, 2)], // under minimum, later name
  ])
  const list = buildChaseList([ALEX, DEVIN, zed], placements, rules, 1)
  assert.deepEqual(
    list.people.map((p) => p.display_name),
    ["Devin Arand", "Zed", "Alex Leslie"]
  )
})

test("per-phase counts are reported even though the minimum spans both (#96)", () => {
  const placements = new Map([["devin", [...picks(3, 1, 2), ...picks(2, 2, 1, "q")]]])
  const list = buildChaseList([DEVIN], placements, rules, 2)
  const devin = list.people[0]
  assert.equal(devin.phase1_picks, 3)
  assert.equal(devin.phase2_picks, 2)
  assert.equal(devin.total_picks, 5)
  assert.equal(devin.under_minimum, false)
  assert.equal(devin.total_wagered, 8)
  assert.equal(devin.remaining, 12)
})
