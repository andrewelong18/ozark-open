// Unit tests for lib/bet-filters.ts — the bet menu's filter model (#104,
// re-cut in Sprint 26 / #193, re-cut again Sept 10 2026 / PRD §12 A23).
//
// THE FIXTURE IS THE POINT, AND IT HAS HAD TO BE FIXED TWICE.
//
// Before Sprint 26 `midTournament` had phase and status perfectly correlated —
// phase 1 was 100% closed, phase 2 was 100% open — so partitioning by status
// and partitioning by phase gave byte-identical answers, and an implementation
// that never switched axes would have passed the rewrite unchanged. Every
// fixture carries mixed statuses inside one phase now, and that stays.
//
// This cut adds the same trap one level down: if every round held exactly one
// category, "filter by round" and "filter by category" would be the same
// operation on this data and a filterPhases() that silently ignored one of them
// would go green. So the fixtures below guarantee BOTH of:
//
//   - a round holding TWO categories (Phase 1 · tournament · Top Finisher +
//     Prop Bet), and
//   - a category spanning TWO rounds (Phase 1 · Top Finisher · tournament +
//     round_1).
//
// Sabotage-checked rather than assumed sound: making filterPhases() ignore
// `filter.category` turns three tests red, ignoring `filter.round` turns three
// red, and ignoring `filter.phase` turns five red.

import test from "node:test"
import assert from "node:assert/strict"

import {
  ALL,
  allOf,
  filterPhases,
  flattenBets,
  isNarrowed,
  isOpenBet,
  phaseHasBets,
  reconcileFilter,
  roundInPhase,
  roundOptions,
  type BetFilter,
  type FilterablePhase,
} from "./bet-filters.ts"
import { CATEGORIES } from "./bet-taxonomy.ts"
import type { Phase } from "./phases.ts"

type Bet = { status: string; id: string }

/** Build a phase tree tersely: phase → round → category → bet statuses. */
function tree(
  spec: [number, string, string, string[]][]
): FilterablePhase<Bet>[] {
  const phases: FilterablePhase<Bet>[] = []
  let n = 0
  for (const [phase, round, category, statuses] of spec) {
    let p = phases.find((x) => x.phase === phase)
    if (!p) phases.push((p = { phase, rounds: [] }))
    let r = p.rounds.find((x) => x.round === round)
    if (!r) p.rounds.push((r = { round, categories: [] }))
    r.categories.push({
      name: category,
      bets: statuses.map((status) => ({ status, id: `b${n++}` })),
    })
  }
  return phases
}

/** A filter, spelled tersely. */
function f(
  phase: Phase,
  round: BetFilter["round"] = ALL,
  category: BetFilter["category"] = ALL
): BetFilter {
  return { phase, round, category }
}

const ids = (phases: FilterablePhase<Bet>[]) =>
  flattenBets(phases)
    .map((b) => b.id)
    .sort()

// Mid-tournament, DELIBERATELY NOT phase-correlated by status, and
// DELIBERATELY not round/category-correlated either (see the header). Phase 1
// has closed Round 1 bets sitting beside a Tournament bet the sheet still
// marks open, which is the real state on Thursday afternoon.
const midTournament = tree([
  [1, "tournament", "Top Finisher", ["open", "closed"]], // b0 b1
  [1, "tournament", "Prop Bet", ["open"]], //               b2
  [1, "round_1", "Top Finisher", ["closed"]], //            b3
  [1, "round_1", "Match", ["closed"]], //                   b4
  [2, "tournament", "Top Finisher", ["open"]], //           b5
  [2, "round_3", "Prop Bet", ["open", "closed"]], //        b6 b7
])

// Before Friday's upload: Phase 1 is published, Phase 2 does not exist on the
// page at all because every Phase 2 bet is still `hidden` and /bets filters
// those out in the query.
const phase2Unpublished = tree([
  [1, "tournament", "Top Finisher", ["open"]],
  [1, "round_1", "Match", ["closed", "closed"]],
])

// ---------------------------------------------------------------------------
// isOpenBet
// ---------------------------------------------------------------------------

test("anything that isn't open reads closed", () => {
  assert.equal(isOpenBet("open"), true)
  assert.equal(isOpenBet("closed"), false)
  // A bet's status is never "resolved" — that's derived per pick — but nothing
  // here may depend on that holding.
  assert.equal(isOpenBet("resolved"), false)
  assert.equal(isOpenBet("hidden"), false)
})

// ---------------------------------------------------------------------------
// phaseHasBets — which drives the "isn't open yet" state, not the tab's
// existence. Both tabs always render (Sprint 26 / #193).
// ---------------------------------------------------------------------------

test("a phase with published bets has bets; an unpublished one does not", () => {
  assert.equal(phaseHasBets(midTournament, 1), true)
  assert.equal(phaseHasBets(midTournament, 2), true)
  assert.equal(phaseHasBets(phase2Unpublished, 1), true)
  assert.equal(phaseHasBets(phase2Unpublished, 2), false)
})

test("an empty menu has no bets in either phase", () => {
  assert.equal(phaseHasBets([], 1), false)
  assert.equal(phaseHasBets([], 2), false)
})

// ---------------------------------------------------------------------------
// The options — STATIC per phase, not derived from the loaded bets. This is
// the Sept 10 change; the derived-chip tests it replaces are gone.
// ---------------------------------------------------------------------------

test("round options come from the phase, never from the data", () => {
  assert.deepEqual(roundOptions(1), ["tournament", "round_1"])
  assert.deepEqual(roundOptions(2), ["tournament", "round_3"])
  // Same answer for a menu that has published nothing at all — the row does not
  // grow as the tournament goes on.
  assert.deepEqual(roundOptions(1), roundOptions(1))
})

test("no phase offers the other phase's round (Pat, Sept 10)", () => {
  assert.ok(!roundOptions(1).includes("round_3"))
  assert.ok(!roundOptions(2).includes("round_1"))
  assert.equal(roundInPhase(1, "round_3"), false)
  assert.equal(roundInPhase(2, "round_1"), false)
  assert.equal(roundInPhase(1, "tournament"), true)
  assert.equal(roundInPhase(2, "tournament"), true)
  assert.equal(roundInPhase(1, ALL), true)
})

test("the category options are the five, whatever the data holds", () => {
  // midTournament publishes only three of the five; the row still offers five.
  assert.equal(CATEGORIES.length, 5)
  assert.ok(!CATEGORIES.includes("Medalist" as never))
})

// ---------------------------------------------------------------------------
// filterPhases — the phase partitions, then round and category compose
// ---------------------------------------------------------------------------

test("the phase alone partitions the menu, and does NOT partition by status", () => {
  // Phase 1 keeps its open AND closed bets; phase 2's are excluded entirely.
  assert.deepEqual(ids(filterPhases(midTournament, allOf(1))), [
    "b0",
    "b1",
    "b2",
    "b3",
    "b4",
  ])
  assert.deepEqual(ids(filterPhases(midTournament, allOf(2))), [
    "b5",
    "b6",
    "b7",
  ])
})

test("a round selection narrows within the phase", () => {
  assert.deepEqual(ids(filterPhases(midTournament, f(1, "round_1"))), [
    "b3",
    "b4",
  ])
  assert.deepEqual(ids(filterPhases(midTournament, f(1, "tournament"))), [
    "b0",
    "b1",
    "b2",
  ])
})

test("a category selection narrows across rounds", () => {
  // Top Finisher spans tournament AND round_1 in Phase 1 — this is the case
  // that makes "filter by category" distinguishable from "filter by round".
  assert.deepEqual(ids(filterPhases(midTournament, f(1, ALL, "Top Finisher"))), [
    "b0",
    "b1",
    "b3",
  ])
})

test("round and category COMPOSE — both apply, neither wins", () => {
  // The whole point of three levels. tournament ∩ Top Finisher = b0, b1 —
  // strictly smaller than either filter alone (b0 b1 b2 / b0 b1 b3).
  assert.deepEqual(
    ids(filterPhases(midTournament, f(1, "tournament", "Top Finisher"))),
    ["b0", "b1"]
  )
  assert.deepEqual(
    ids(filterPhases(midTournament, f(1, "round_1", "Match"))),
    ["b4"]
  )
})

test("an offered combination CAN now select nothing — #104's invariant is gone", () => {
  // Phase 1 offers Round 1, and offers Prop Bet, and there is no Round 1 Prop
  // Bet. Both chips are legal, the intersection is empty, and the menu's job is
  // to say so rather than to prevent it (PRD §12 A23).
  assert.ok(roundOptions(1).includes("round_1"))
  assert.deepEqual(filterPhases(midTournament, f(1, "round_1", "Prop Bet")), [])
  // ...and that is distinguishable from an unpublished phase, which the menu
  // needs in order to pick the right message.
  assert.equal(phaseHasBets(midTournament, 1), true)
})

test("an unpublished phase filters to nothing, filtered or not", () => {
  assert.deepEqual(filterPhases(phase2Unpublished, allOf(2)), [])
  assert.deepEqual(filterPhases(phase2Unpublished, f(2, "round_3")), [])
  assert.equal(phaseHasBets(phase2Unpublished, 2), false)
})

test("filtering never leaves a bare round or category heading", () => {
  for (const filter of [
    allOf(1),
    f(1, "tournament"),
    f(1, ALL, "Match"),
    f(1, "tournament", "Prop Bet"),
    allOf(2),
    f(2, "round_3", "Prop Bet"),
  ]) {
    for (const p of filterPhases(midTournament, filter)) {
      assert.ok(p.rounds.length > 0, "a phase with no rounds was returned")
      for (const r of p.rounds) {
        assert.ok(r.categories.length > 0, `${r.round} had no categories`)
        for (const c of r.categories)
          assert.ok(c.bets.length > 0, `${r.round}/${c.name} had no bets`)
      }
    }
  }
})

test("an empty menu filters to nothing rather than throwing", () => {
  assert.deepEqual(filterPhases([], allOf(1)), [])
  assert.deepEqual(filterPhases([], f(2, "round_3", "Match")), [])
})

// ---------------------------------------------------------------------------
// reconcileFilter — carrying a selection across a phase flip
// ---------------------------------------------------------------------------

test("a round that the new phase cannot hold is dropped", () => {
  assert.deepEqual(reconcileFilter(f(1, "round_1", "Match"), 2), {
    phase: 2,
    round: ALL,
    category: "Match",
  })
  assert.deepEqual(reconcileFilter(f(2, "round_3"), 1), {
    phase: 1,
    round: ALL,
    category: ALL,
  })
})

test("Tournament survives the flip, because both phases hold it", () => {
  assert.deepEqual(reconcileFilter(f(1, "tournament", "Prop Bet"), 2), {
    phase: 2,
    round: "tournament",
    category: "Prop Bet",
  })
})

test("the category ALWAYS survives a phase flip — all five exist in both", () => {
  for (const category of CATEGORIES) {
    assert.equal(reconcileFilter(f(1, "round_1", category), 2).category, category)
    assert.equal(reconcileFilter(f(2, "round_3", category), 1).category, category)
  }
})

test("reconciling to the same phase changes nothing", () => {
  const filter = f(1, "round_1", "Match")
  assert.deepEqual(reconcileFilter(filter, 1), filter)
})

// ---------------------------------------------------------------------------
// Small helpers the menu leans on
// ---------------------------------------------------------------------------

test("allOf is the unfiltered view, and isNarrowed says so", () => {
  assert.deepEqual(allOf(2), { phase: 2, round: ALL, category: ALL })
  assert.equal(isNarrowed(allOf(1)), false)
  assert.equal(isNarrowed(f(1, "round_1")), true)
  assert.equal(isNarrowed(f(1, ALL, "Match")), true)
  assert.equal(isNarrowed(f(1, "round_1", "Match")), true)
})

test("flattenBets reads every bet in the tree", () => {
  assert.equal(flattenBets(midTournament).length, 8)
  assert.equal(flattenBets([]).length, 0)
})
