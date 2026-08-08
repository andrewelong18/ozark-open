// Unit tests for lib/bet-filters.ts — the bet menu's filter model (#104).
// The properties that matter are the defaulting rule (computed from the page,
// not from the phase number) and the guarantee that no selectable option can
// empty the menu.

import test from "node:test"
import assert from "node:assert/strict"

import {
  ALL_FACET,
  availableCategories,
  availableRounds,
  defaultStatusView,
  facetIsAvailable,
  filterPhases,
  flattenBets,
  matchesStatus,
  reconcileFacet,
  showStatusToggle,
  type Facet,
  type FilterablePhase,
  type StatusView,
} from "./bet-filters.ts"

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

// The shape that motivates the whole issue: mid-tournament, Phase 1 has
// closed and Phase 2 is taking wagers, so both states are on the page at once.
const midTournament = tree([
  [1, "tournament", "Top Finisher", ["closed", "closed"]],
  [1, "round_1", "Match", ["closed"]],
  [2, "round_3", "Top Finisher", ["open"]],
  [2, "round_3", "Prop Bet", ["open", "open"]],
])

// ---------------------------------------------------------------------------
// matchesStatus
// ---------------------------------------------------------------------------

test("closed folds in everything that isn't open", () => {
  assert.equal(matchesStatus("open", "open"), true)
  assert.equal(matchesStatus("closed", "open"), false)
  assert.equal(matchesStatus("closed", "closed"), true)
  // A bet's status is never "resolved" — that's derived per pick — but the
  // view must not depend on that holding.
  assert.equal(matchesStatus("closed", "resolved"), true)
})

// ---------------------------------------------------------------------------
// defaultStatusView — the trap in #104
// ---------------------------------------------------------------------------

test("default view is open when anything is open", () => {
  assert.equal(defaultStatusView(tree([[1, "tournament", "Match", ["open"]]])), "open")
})

test("default view falls back to closed when nothing is open", () => {
  assert.equal(
    defaultStatusView(tree([[1, "tournament", "Match", ["closed", "closed"]]])),
    "closed"
  )
})

test("default view is open MID-TOURNAMENT, when both states are on the page", () => {
  // THE CASE THE ISSUE CALLS OUT. Phase 1 is closed and Phase 2 is open
  // simultaneously. "Default to open" has to mean "open bets exist", never
  // "phase 1" — otherwise the menu opens on a dead view all weekend.
  assert.equal(defaultStatusView(midTournament), "open")
})

test("default view is open when the closed bets come FIRST in the tree", () => {
  // Guards against an implementation that peeks at the first phase.
  const closedFirst = tree([
    [1, "tournament", "Match", ["closed", "closed", "closed"]],
    [2, "round_3", "Prop Bet", ["open"]],
  ])
  assert.equal(defaultStatusView(closedFirst), "open")
})

test("an empty menu defaults to open", () => {
  assert.equal(defaultStatusView([]), "open")
})

// ---------------------------------------------------------------------------
// showStatusToggle
// ---------------------------------------------------------------------------

test("the toggle appears only when both kinds are present", () => {
  assert.equal(showStatusToggle(midTournament), true)
  assert.equal(showStatusToggle(tree([[1, "t", "Match", ["open"]]])), false)
  assert.equal(showStatusToggle(tree([[1, "t", "Match", ["closed"]]])), false)
  assert.equal(showStatusToggle([]), false)
})

// ---------------------------------------------------------------------------
// Contextual options
// ---------------------------------------------------------------------------

test("rounds are those present in the current view only", () => {
  assert.deepEqual(availableRounds(midTournament, "open"), ["round_3"])
  assert.deepEqual(availableRounds(midTournament, "closed"), [
    "tournament",
    "round_1",
  ])
})

test("categories are those present in the current view, in PRD order", () => {
  assert.deepEqual(availableCategories(midTournament, "open"), [
    "Top Finisher",
    "Prop Bet",
  ])
  assert.deepEqual(availableCategories(midTournament, "closed"), [
    "Top Finisher",
    "Match",
  ])
})

test("unknown categories sort after the known ones rather than vanishing", () => {
  const withStray = tree([
    [1, "tournament", "Prop Bet", ["open"]],
    [1, "tournament", "Zebra Special", ["open"]],
    [1, "tournament", "Top Finisher", ["open"]],
  ])
  assert.deepEqual(availableCategories(withStray, "open"), [
    "Top Finisher",
    "Prop Bet",
    "Zebra Special",
  ])
})

// ---------------------------------------------------------------------------
// filterPhases
// ---------------------------------------------------------------------------

test("the view alone partitions the menu", () => {
  const open = filterPhases(midTournament, "open", ALL_FACET)
  assert.deepEqual(
    flattenBets(open).map((b) => b.status),
    ["open", "open", "open"]
  )
  const closed = filterPhases(midTournament, "closed", ALL_FACET)
  assert.deepEqual(
    flattenBets(closed).map((b) => b.status),
    ["closed", "closed", "closed"]
  )
})

test("a round facet keeps only that round", () => {
  const out = filterPhases(midTournament, "closed", {
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
  const out = filterPhases(midTournament, "closed", {
    kind: "category",
    value: "Top Finisher",
  })
  assert.equal(flattenBets(out).length, 2)
})

test("empty categories, rounds and phases are dropped, never rendered bare", () => {
  const out = filterPhases(midTournament, "open", ALL_FACET)
  // Phase 1 is entirely closed, so it must not survive the open view at all —
  // a surviving phase would render as a heading with nothing under it.
  assert.deepEqual(
    out.map((p) => p.phase),
    [2]
  )
  for (const p of out)
    for (const r of p.rounds) {
      assert.ok(r.categories.length > 0)
      for (const c of r.categories) assert.ok(c.bets.length > 0)
    }
})

// ---------------------------------------------------------------------------
// The property the refactor exists for
// ---------------------------------------------------------------------------

test("NO offered option can empty the menu, in either view", () => {
  // #104's "done when": no filter combination produces an empty page. Because
  // exactly one facet is ever active and every offered facet is derived from
  // the current view, this holds by construction — pinned here so a future
  // change that lets round and category combine fails loudly.
  const trees = [
    midTournament,
    tree([[1, "tournament", "Match", ["open", "closed"]]]),
    tree([
      [1, "tournament", "Top Finisher", ["closed"]],
      [1, "round_1", "Prop Bet", ["closed"]],
      [2, "round_3", "Match", ["open"]],
    ]),
  ]
  for (const phases of trees)
    for (const view of ["open", "closed"] as StatusView[]) {
      const facets: Facet[] = [
        ALL_FACET,
        ...availableRounds(phases, view).map(
          (value): Facet => ({ kind: "round", value })
        ),
        ...availableCategories(phases, view).map(
          (value): Facet => ({ kind: "category", value })
        ),
      ]
      for (const facet of facets) {
        const out = filterPhases(phases, view, facet)
        assert.ok(
          flattenBets(out).length > 0,
          `${view} + ${JSON.stringify(facet)} emptied the menu`
        )
      }
    }
})

// ---------------------------------------------------------------------------
// reconcileFacet — the other way a page could go empty
// ---------------------------------------------------------------------------

test("a facet that doesn't apply to the new view is dropped", () => {
  // Filter to Round 3 (open-only), flip to Closed: round_3 has no closed bets,
  // so keeping the selection would empty the page.
  const facet: Facet = { kind: "round", value: "round_3" }
  assert.equal(facetIsAvailable(midTournament, "open", facet), true)
  assert.equal(facetIsAvailable(midTournament, "closed", facet), false)
  assert.deepEqual(reconcileFacet(midTournament, "closed", facet), ALL_FACET)
})

test("a facet that still applies survives the view flip", () => {
  // Top Finisher exists open AND closed, so switching views keeps it.
  const facet: Facet = { kind: "category", value: "Top Finisher" }
  assert.deepEqual(reconcileFacet(midTournament, "closed", facet), facet)
  assert.deepEqual(reconcileFacet(midTournament, "open", facet), facet)
})

test("the all facet always survives", () => {
  assert.deepEqual(reconcileFacet(midTournament, "closed", ALL_FACET), ALL_FACET)
  assert.deepEqual(reconcileFacet([], "open", ALL_FACET), ALL_FACET)
})
