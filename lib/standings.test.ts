// Unit tests for lib/standings.ts — the standings sort model (Sprint 28).
//
// These drive buildPhaseResults() rather than hand-building a ResultsTable, the
// same way lib/payouts.test.ts does, so they exercise the real pipeline: if
// the payout math changes shape these fail, which is correct.
//
// The fixture below is built so that THREE orderings genuinely disagree —
// profit/loss, payout (actual + refunds) and bare `actual` all rank the same
// three people differently, and none of the three matches alphabetical order.
// That is deliberate. A comparator that silently sorted on the wrong field, or
// fell through to the name tie-break, would pass a gentler fixture; this
// project has already shipped two checks that couldn't distinguish the axis
// they were testing (Sprint 11's invite count, Sprint 26's fixture).

import test from "node:test"
import assert from "node:assert/strict"
import {
  buildPhaseResults,
  cashReturned,
  roundCents,
  type PayoutRow,
  type ResultsParticipant,
  type ResultsRow,
} from "./payouts.ts"
import {
  COLUMN_LABELS,
  DEFAULT_SORT,
  nextSort,
  sortStandings,
  standingsLeader,
  type StandingsSort,
} from "./standings.ts"
import type { TournamentRules } from "./validation.ts"

const RULES: TournamentRules = {
  entry_fee_min: 20,
  entry_fee_max: 50,
  min_picks_per_phase: 5,
  max_single_bet: 10,
  max_self_bet_pct: 0.25,
}

function participant(
  user_id: string,
  display_name: string,
  entry_fee: number
): ResultsParticipant {
  return { user_id, display_name, is_player: true, phase1_entry_fee: entry_fee, phase2_entry_fee: null }
}

let seq = 0
function placement(
  user_id: string,
  amount: number,
  theoretical: number | null,
  refunded = 0
): PayoutRow {
  seq += 1
  return {
    placement_id: `p${seq}`,
    user_id,
    amount,
    result: theoretical === null ? "pending" : refunded > 0 ? "void" : "hit",
    theoretical,
    refunded,
    phase: 1,
    is_self_pick: false,
  }
}

// ---------------------------------------------------------------------------
// The fixture, and the arithmetic that makes it discriminating
// ---------------------------------------------------------------------------
//
//   Alice   entry 20, wagered 20, theo 100
//   Bob     entry 50, wagered 50, theo 200
//   Carol   entry 20, wagered 20: theo 60 on $10, and a $10 void refunded
//
//   Σ committed = 90, Σ refunded = 10  →  pool = 80;  Σ theoretical = 360
//
//   Alice   actual 22.22   payout 22.22   P/L  +2.22
//   Bob     actual 44.44   payout 44.44   P/L  −5.56
//   Carol   actual 13.33   payout 23.33   P/L  +3.33
//
//   P/L desc      → Carol, Alice, Bob
//   payout desc   → Bob,   Carol, Alice
//   `actual` desc → Bob,   Alice, Carol   (buildPhaseResults's own order)
//   alphabetical  → Alice, Bob,   Carol
//
// Four different answers from one table.
function fixture(): ResultsRow[] {
  return buildPhaseResults(
    1,
    [
      participant("a", "Alice Ace", 20),
      participant("b", "Bob Birdie", 50),
      participant("c", "Carol Chip", 20),
    ],
    [
      placement("a", 20, 100),
      placement("b", 50, 200),
      placement("c", 10, 60),
      placement("c", 10, 0, 10),
    ],
    RULES
  ).rows
}

const names = (rows: ResultsRow[]) => rows.map((r) => r.display_name)

// ---------------------------------------------------------------------------
// The default: Pat's "sorted by profit/loss descending by default"
// ---------------------------------------------------------------------------

test("the default sort is profit/loss descending", () => {
  assert.deepEqual(DEFAULT_SORT, { column: "profit_loss", direction: "desc" })
  assert.deepEqual(names(sortStandings(fixture())), [
    "Carol Chip",
    "Alice Ace",
    "Bob Birdie",
  ])
})

test("the default is NOT buildPhaseResults's own `actual` order", () => {
  assert.deepEqual(names(fixture()), ["Bob Birdie", "Alice Ace", "Carol Chip"])
  assert.notDeepEqual(names(sortStandings(fixture())), names(fixture()))
})

// ---------------------------------------------------------------------------
// Each column, both directions
// ---------------------------------------------------------------------------

test("profit/loss ascending is the exact reverse", () => {
  const asc = sortStandings(fixture(), { column: "profit_loss", direction: "asc" })
  assert.deepEqual(names(asc), ["Bob Birdie", "Alice Ace", "Carol Chip"])
})

test("entry fee sorts on the entry column", () => {
  const desc = sortStandings(fixture(), { column: "entry_fee", direction: "desc" })
  assert.deepEqual(names(desc), ["Bob Birdie", "Alice Ace", "Carol Chip"])
  const asc = sortStandings(fixture(), { column: "entry_fee", direction: "asc" })
  // Alice and Carol are both $20 — the name tie-break decides, ascending.
  assert.deepEqual(names(asc), ["Alice Ace", "Carol Chip", "Bob Birdie"])
})

test("theoretical sorts on the theoretical column", () => {
  const desc = sortStandings(fixture(), { column: "theoretical", direction: "desc" })
  assert.deepEqual(names(desc), ["Bob Birdie", "Alice Ace", "Carol Chip"])
})

test("payout sorts on cashReturned (actual + refunds), never bare actual", () => {
  // THE #157 CASE. Carol's $10 void is money that changed hands; sorting on
  // bare `actual` would rank her last on the very column that shows her second.
  const desc = sortStandings(fixture(), { column: "payout", direction: "desc" })
  assert.deepEqual(names(desc), ["Bob Birdie", "Carol Chip", "Alice Ace"])

  const byActual = [...fixture()].sort((x, y) => y.actual - x.actual)
  assert.notDeepEqual(names(desc), names(byActual))
})

test("player sorts by name, and reverses", () => {
  const asc = sortStandings(fixture(), { column: "display_name", direction: "asc" })
  assert.deepEqual(names(asc), ["Alice Ace", "Bob Birdie", "Carol Chip"])
  const desc = sortStandings(fixture(), { column: "display_name", direction: "desc" })
  assert.deepEqual(names(desc), ["Carol Chip", "Bob Birdie", "Alice Ace"])
})

// ---------------------------------------------------------------------------
// The tie-break
// ---------------------------------------------------------------------------

test("ties break by name ascending, in BOTH directions", () => {
  // Equal entry fees, unequal theoretical. Zoe's bigger payout puts her FIRST
  // on the way in; sorting by Entry must put Mike first on the way out.
  const rows = buildPhaseResults(
    1,
    [participant("z", "Zoe Zinger", 20), participant("m", "Mike Mulligan", 20)],
    [placement("z", 20, 200), placement("m", 20, 100)],
    RULES
  ).rows
  assert.deepEqual(names(rows), ["Zoe Zinger", "Mike Mulligan"])

  const desc = sortStandings(rows, { column: "entry_fee", direction: "desc" })
  const asc = sortStandings(rows, { column: "entry_fee", direction: "asc" })
  assert.deepEqual(names(desc), ["Mike Mulligan", "Zoe Zinger"])
  assert.deepEqual(names(asc), ["Mike Mulligan", "Zoe Zinger"])
})

test("sorting never mutates the caller's array", () => {
  const rows = fixture()
  const before = names(rows)
  sortStandings(rows, { column: "entry_fee", direction: "asc" })
  assert.deepEqual(names(rows), before)
})

// ---------------------------------------------------------------------------
// The pinned leader — the one non-obvious rule
// ---------------------------------------------------------------------------

test("the leader is the top profit/loss, whatever the viewer sorted by", () => {
  const rows = fixture()
  const leader = standingsLeader(rows)
  assert.equal(leader?.display_name, "Carol Chip")

  for (const sort of [
    { column: "entry_fee", direction: "desc" },
    { column: "theoretical", direction: "desc" },
    { column: "display_name", direction: "asc" },
  ] as StandingsSort[]) {
    const sorted = sortStandings(rows, sort)
    assert.notEqual(sorted[0].display_name, "Carol Chip")
    assert.equal(standingsLeader(sorted)?.display_name, "Carol Chip")
  }
})

test("an empty table has no leader", () => {
  assert.equal(standingsLeader([]), null)
})

// ---------------------------------------------------------------------------
// What a header click does
// ---------------------------------------------------------------------------

test("clicking the active column flips its direction", () => {
  assert.deepEqual(nextSort(DEFAULT_SORT, "profit_loss"), {
    column: "profit_loss",
    direction: "asc",
  })
  assert.deepEqual(
    nextSort({ column: "profit_loss", direction: "asc" }, "profit_loss"),
    { column: "profit_loss", direction: "desc" }
  )
})

test("a new money column opens descending; a new name column opens ascending", () => {
  for (const column of ["entry_fee", "theoretical", "payout"] as const) {
    assert.deepEqual(nextSort(DEFAULT_SORT, column), { column, direction: "desc" })
  }
  assert.deepEqual(nextSort(DEFAULT_SORT, "display_name"), {
    column: "display_name",
    direction: "asc",
  })
})

test("clicking # restores the profit/loss default from anywhere", () => {
  for (const from of [
    { column: "entry_fee", direction: "asc" },
    { column: "display_name", direction: "desc" },
    { column: "payout", direction: "desc" },
  ] as StandingsSort[]) {
    assert.deepEqual(nextSort(from, "rank"), DEFAULT_SORT)
  }
})

test("the column labels are Pat's six", () => {
  assert.deepEqual(Object.values(COLUMN_LABELS), [
    "#",
    "Player",
    "Entry",
    "Theo",
    "Payout",
    "P/L",
  ])
})

// ---------------------------------------------------------------------------
// The invariant every row has to keep, in every order (#157)
// ---------------------------------------------------------------------------

test("entry_fee + profit_loss === Payout on every row, void or not", () => {
  for (const row of fixture()) {
    assert.equal(
      roundCents(row.entry_fee + row.profit_loss),
      roundCents(cashReturned(row)),
      `${row.display_name} doesn't reconcile`
    )
  }
})

test("the fixture really does carry a void, or the test above proves nothing", () => {
  const carol = fixture().find((r) => r.display_name === "Carol Chip")
  assert.equal(carol?.refunded, 10)
  assert.notEqual(roundCents(carol!.actual), roundCents(cashReturned(carol!)))
})
