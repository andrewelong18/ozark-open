// Unit tests for lib/bet-filters.ts — the bet menu's filter model (#104,
// re-cut in Sprint 26 / #193).
//
// THE FIXTURE IS THE POINT. Until Sprint 26 this file's `midTournament` had
// phase and status perfectly correlated — phase 1 was 100% closed, phase 2 was
// 100% open — and twelve of eighteen tests ran against it. That made the suite
// blind in exactly the way that mattered: partitioning it by status and
// partitioning it by phase give byte-identical answers, so an implementation
// that still filtered by STATUS would have passed a phase-axis rewrite
// unchanged. Every fixture below now carries mixed statuses inside a single
// phase, so the axis is actually pinned.
//
// The properties that matter: the selected phase partitions the menu, a phase
// may legitimately be empty (that's Pat's "Phase 2 isn't open yet"), and no
// offered CHIP can empty the page.

import test from "node:test"
import assert from "node:assert/strict"

import {
  ALL_FACET,
  availableCategories,
  availableRounds,
  facetIsAvailable,
  filterPhases,
  flattenBets,
  isOpenBet,
  phaseHasBets,
  reconcileFacet,
  type Facet,
  type FilterablePhase,
} from "./bet-filters.ts"
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

// Mid-tournament, and DELIBERATELY NOT phase-correlated: Phase 1 has closed
// Round 1 bets sitting beside a Tournament bet the sheet still marks open,
// which is the real state on Thursday afternoon and the one the old fixture
// could not express. Phase 2 is live.
const midTournament = tree([
  [1, "tournament", "Top Finisher", ["open", "closed"]],
  [1, "round_1", "Match", ["closed"]],
  [2, "round_3", "Top Finisher", ["open"]],
  [2, "round_3", "Prop Bet", ["open", "closed"]],
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
// Contextual options — derived from the PHASE, not from a status view
// ---------------------------------------------------------------------------

test("rounds are those present in the selected phase only", () => {
  // Phase 1 holds both of its rounds even though their statuses differ — the
  // old status-axis version split these across two views.
  assert.deepEqual(availableRounds(midTournament, 1), ["tournament", "round_1"])
  assert.deepEqual(availableRounds(midTournament, 2), ["round_3"])
})

test("an unpublished phase offers no rounds and no categories", () => {
  assert.deepEqual(availableRounds(phase2Unpublished, 2), [])
  assert.deepEqual(availableCategories(phase2Unpublished, 2), [])
})

test("categories are those present in the selected phase, in PRD order", () => {
  assert.deepEqual(availableCategories(midTournament, 1), [
    "Top Finisher",
    "Match",
  ])
  assert.deepEqual(availableCategories(midTournament, 2), [
    "Top Finisher",
    "Prop Bet",
  ])
})

test("unknown categories sort after the known ones rather than vanishing", () => {
  const withStray = tree([
    [1, "tournament", "Prop Bet", ["open"]],
    [1, "tournament", "Zebra Special", ["open"]],
    [1, "tournament", "Top Finisher", ["closed"]],
  ])
  assert.deepEqual(availableCategories(withStray, 1), [
    "Top Finisher",
    "Prop Bet",
    "Zebra Special",
  ])
})

// ---------------------------------------------------------------------------
// filterPhases — the axis itself
// ---------------------------------------------------------------------------

test("the phase alone partitions the menu, and does NOT partition by status", () => {
  // THE TEST THAT PINS THE AXIS. Phase 1 holds a mix, so an implementation
  // still filtering on status cannot produce this result: it would return only
  // the open bet or only the two closed ones, never all three.
  const p1 = filterPhases(midTournament, 1, ALL_FACET)
  assert.deepEqual(
    flattenBets(p1)
      .map((b) => b.status)
      .sort(),
    ["closed", "closed", "open"]
  )
  const p2 = filterPhases(midTournament, 2, ALL_FACET)
  assert.deepEqual(
    flattenBets(p2)
      .map((b) => b.status)
      .sort(),
    ["closed", "open", "open"]
  )
})

test("filtering returns at most the one selected phase", () => {
  const out = filterPhases(midTournament, 2, ALL_FACET)
  assert.deepEqual(
    out.map((p) => p.phase),
    [2]
  )
})

test("an unpublished phase filters to nothing, which is a state and not a bug", () => {
  // The menu renders "Phase 2 isn't open yet" off this, rather than treating an
  // empty result as a failure (Sprint 26 / #193 — Pat asked for it by name).
  assert.deepEqual(filterPhases(phase2Unpublished, 2, ALL_FACET), [])
})

test("a round facet keeps only that round", () => {
  const out = filterPhases(midTournament, 1, {
    kind: "round",
    value: "round_1",
  })
  assert.equal(out.length, 1)
  assert.deepEqual(
    out[0].rounds.map((r) => r.round),
    ["round_1"]
  )
})

test("a category facet keeps only that category, across rounds", () => {
  const spread = tree([
    [1, "tournament", "Match", ["open"]],
    [1, "round_1", "Match", ["closed"]],
    [1, "round_1", "Prop Bet", ["open"]],
  ])
  const out = filterPhases(spread, 1, { kind: "category", value: "Match" })
  assert.equal(flattenBets(out).length, 2)
  assert.deepEqual(
    out[0].rounds.map((r) => r.round),
    ["tournament", "round_1"]
  )
})

test("empty categories and rounds are dropped, never rendered bare", () => {
  const out = filterPhases(midTournament, 1, {
    kind: "category",
    value: "Match",
  })
  for (const p of out)
    for (const r of p.rounds) {
      assert.ok(r.categories.length > 0)
      for (const c of r.categories) assert.ok(c.bets.length > 0)
    }
  // Only the round that actually holds a Match survives.
  assert.deepEqual(
    out[0].rounds.map((r) => r.round),
    ["round_1"]
  )
})

// ---------------------------------------------------------------------------
// The property the whole model exists for
// ---------------------------------------------------------------------------

test("NO offered chip can empty the menu, in either phase", () => {
  // #104's "done when", restated for the phase axis (Sprint 26). The PHASE may
  // legitimately be empty — that's the unpublished state — so the guarantee
  // moves one level down: within a phase that has bets, every chip offered is
  // derived from that phase and therefore matches at least one of them.
  const trees = [
    midTournament,
    phase2Unpublished,
    tree([[1, "tournament", "Match", ["open", "closed"]]]),
    tree([
      [1, "tournament", "Top Finisher", ["closed"]],
      [1, "round_1", "Prop Bet", ["open"]],
      [2, "round_3", "Match", ["open"]],
    ]),
  ]
  for (const phases of trees)
    for (const phase of [1, 2] as Phase[]) {
      if (!phaseHasBets(phases, phase)) {
        // The one sanctioned empty result, and it must be exactly empty.
        assert.deepEqual(filterPhases(phases, phase, ALL_FACET), [])
        continue
      }
      const facets: Facet[] = [
        ALL_FACET,
        ...availableRounds(phases, phase).map(
          (value): Facet => ({ kind: "round", value })
        ),
        ...availableCategories(phases, phase).map(
          (value): Facet => ({ kind: "category", value })
        ),
      ]
      for (const facet of facets) {
        const out = filterPhases(phases, phase, facet)
        assert.ok(
          flattenBets(out).length > 0,
          `phase ${phase} + ${JSON.stringify(facet)} emptied the menu`
        )
      }
    }
})

// ---------------------------------------------------------------------------
// reconcileFacet — the other way a page could go empty
// ---------------------------------------------------------------------------

test("a facet that doesn't apply to the new phase is dropped", () => {
  // Round 1 is a Phase 1 round and Round 3 a Phase 2 one (ADR 0001 §4), so a
  // round selection essentially never survives a tab change — keeping it would
  // empty the page.
  const facet: Facet = { kind: "round", value: "round_1" }
  assert.equal(facetIsAvailable(midTournament, 1, facet), true)
  assert.equal(facetIsAvailable(midTournament, 2, facet), false)
  assert.deepEqual(reconcileFacet(midTournament, 2, facet), ALL_FACET)
})

test("a facet that still applies survives the phase flip", () => {
  // Top Finisher runs in both phases, so switching tabs keeps it.
  const facet: Facet = { kind: "category", value: "Top Finisher" }
  assert.deepEqual(reconcileFacet(midTournament, 1, facet), facet)
  assert.deepEqual(reconcileFacet(midTournament, 2, facet), facet)
})

test("every facet is dropped when the new phase is unpublished", () => {
  const facet: Facet = { kind: "category", value: "Top Finisher" }
  assert.deepEqual(reconcileFacet(phase2Unpublished, 2, facet), ALL_FACET)
})

test("the all facet always survives", () => {
  assert.deepEqual(reconcileFacet(midTournament, 1, ALL_FACET), ALL_FACET)
  assert.deepEqual(reconcileFacet([], 2, ALL_FACET), ALL_FACET)
})
