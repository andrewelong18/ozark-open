// Unit tests for lib/my-bets.ts — the pure half of the /my-bets page:
// row normalization and phase grouping. Zero-dependency by design: node:test
// via npm run test.

import test from "node:test"
import assert from "node:assert/strict"
import {
  buildRulesModel,
  groupByPhase,
  normalizeMyBets,
  type MyBetEntry,
  type MyBetsQueryRow,
} from "./my-bets.ts"
import {
  checkPhaseMinimums,
  checkTournamentTotal,
  type TournamentRules,
} from "./validation.ts"

const T = "t-1"

function row(overrides: {
  pick_id: string
  amount: number
  odds?: number
  phase?: number
  round?: string
  status?: string
  bet_id?: string
  bet_title?: string
  sheet_bet_id?: number
  pick_label?: string
  sheet_pick_id?: number
  player_user_id?: string | null
  tournament_id?: string
  asArrays?: boolean
}): MyBetsQueryRow {
  const bet = {
    id: overrides.bet_id ?? "b-1",
    title: overrides.bet_title ?? "Low round Thursday",
    phase: overrides.phase ?? 1,
    round: overrides.round ?? "round_1",
    status: overrides.status ?? "open",
    sheet_bet_id: overrides.sheet_bet_id ?? 1,
    tournament_id: overrides.tournament_id ?? T,
  }
  const pick = {
    label: overrides.pick_label ?? "Jake",
    sheet_pick_id: overrides.sheet_pick_id ?? 1,
    player_user_id: overrides.player_user_id ?? null,
    bets: overrides.asArrays ? [bet] : bet,
  }
  return {
    pick_id: overrides.pick_id,
    amount: overrides.amount,
    odds_at_placement: overrides.odds ?? 150,
    bet_picks: overrides.asArrays ? [pick] : pick,
  }
}

// ---------------------------------------------------------------------------
// normalizeMyBets
// ---------------------------------------------------------------------------

test("normalizeMyBets flattens object-shaped joins", () => {
  const entries = normalizeMyBets([row({ pick_id: "p-1", amount: 10 })], T)
  assert.equal(entries.length, 1)
  const e = entries[0]
  assert.equal(e.pick_id, "p-1")
  assert.equal(e.bet_id, "b-1")
  assert.equal(e.phase, 1)
  assert.equal(e.round, "round_1")
  assert.equal(e.bet_title, "Low round Thursday")
  assert.equal(e.pick_label, "Jake")
  assert.equal(e.amount, 10)
  assert.equal(e.odds_at_placement, 150)
})

test("normalizeMyBets flattens array-shaped joins the same way", () => {
  const objects = normalizeMyBets([row({ pick_id: "p-1", amount: 10 })], T)
  const arrays = normalizeMyBets(
    [row({ pick_id: "p-1", amount: 10, asArrays: true })],
    T
  )
  assert.deepEqual(arrays, objects)
})

test("normalizeMyBets coerces string numerics from PostgREST", () => {
  const raw = row({ pick_id: "p-1", amount: 10 })
  raw.amount = "10" as unknown as number
  raw.odds_at_placement = "-130" as unknown as number
  const [e] = normalizeMyBets([raw], T)
  assert.equal(e.amount, 10)
  assert.equal(e.odds_at_placement, -130)
})

test("normalizeMyBets keeps only the target tournament", () => {
  const entries = normalizeMyBets(
    [
      row({ pick_id: "p-1", amount: 10 }),
      row({ pick_id: "p-2", amount: 5, tournament_id: "t-other" }),
    ],
    T
  )
  assert.deepEqual(
    entries.map((e) => e.pick_id),
    ["p-1"]
  )
})

test("normalizeMyBets drops unreadable joins instead of crashing", () => {
  const noPick: MyBetsQueryRow = {
    pick_id: "p-1",
    amount: 10,
    odds_at_placement: 150,
    bet_picks: null,
  }
  const noBet: MyBetsQueryRow = {
    pick_id: "p-2",
    amount: 5,
    odds_at_placement: 150,
    bet_picks: { label: "Jake", sheet_pick_id: 1, player_user_id: null, bets: null },
  }
  const badPhase = row({ pick_id: "p-3", amount: 5, phase: 3 })
  assert.deepEqual(normalizeMyBets([noPick, noBet, badPhase], T), [])
})

// ---------------------------------------------------------------------------
// groupByPhase
// ---------------------------------------------------------------------------

test("groupByPhase splits phases with counts and dollar subtotals", () => {
  const entries = normalizeMyBets(
    [
      row({ pick_id: "p-1", amount: 10, phase: 1 }),
      row({ pick_id: "p-2", amount: 5, phase: 1, sheet_pick_id: 2 }),
      row({ pick_id: "p-3", amount: 8, phase: 2, bet_id: "b-2", sheet_bet_id: 9 }),
    ],
    T
  )
  const groups = groupByPhase(entries)
  assert.deepEqual(
    groups.map((g) => [g.phase, g.pick_count, g.subtotal]),
    [
      [1, 2, 15],
      [2, 1, 8],
    ]
  )
})

test("groupByPhase skips phases with no placements (Q2)", () => {
  const entries = normalizeMyBets(
    [row({ pick_id: "p-1", amount: 10, phase: 2 })],
    T
  )
  const groups = groupByPhase(entries)
  assert.deepEqual(
    groups.map((g) => g.phase),
    [2]
  )
  assert.deepEqual(groupByPhase([]), [])
})

test("groupByPhase orders entries round → sheet_bet_id → sheet_pick_id", () => {
  const entries = normalizeMyBets(
    [
      row({ pick_id: "r1-late", amount: 1, round: "round_1", sheet_bet_id: 7 }),
      row({ pick_id: "tourn", amount: 1, round: "tournament", sheet_bet_id: 20 }),
      row({ pick_id: "r1-b", amount: 1, round: "round_1", sheet_bet_id: 3, sheet_pick_id: 2 }),
      row({ pick_id: "r1-a", amount: 1, round: "round_1", sheet_bet_id: 3, sheet_pick_id: 1 }),
    ],
    T
  )
  const [group] = groupByPhase(entries)
  assert.deepEqual(
    group.entries.map((e) => e.pick_id),
    ["tourn", "r1-a", "r1-b", "r1-late"]
  )
})

// ---------------------------------------------------------------------------
// Entries feed validation's §8.1 checks directly — the compliance numbers
// come from the same rows the page renders.
// ---------------------------------------------------------------------------

const RULES: TournamentRules = {
  entry_fee_min: 20,
  entry_fee_max: 50,
  min_picks_per_phase: 5,
  max_picks_per_phase: 10,
  max_single_bet_pct: 0.5,
  max_single_bet_cap: 20,
  max_self_bet_pct: 0.25,
  max_self_bet_cap: 10,
}

test("MyBetEntry rows satisfy the phase-close checks structurally", () => {
  const entries: MyBetEntry[] = normalizeMyBets(
    [
      row({ pick_id: "p-1", amount: 10, phase: 1 }),
      row({ pick_id: "p-2", amount: 13, phase: 1, sheet_pick_id: 2 }),
    ],
    T
  )
  const rules = RULES
  const phases = checkPhaseMinimums(entries, rules)
  assert.deepEqual(
    phases.map((p) => [p.phase, p.pick_count, p.meets_minimum]),
    [[1, 2, false]]
  )
  const total = checkTournamentTotal(entries, 40)
  assert.equal(total.total, 23)
  assert.equal(total.remaining, 17)
  assert.equal(total.exact, false)
})

// ---------------------------------------------------------------------------
// buildRulesModel — the personalized rules card's numbers
// ---------------------------------------------------------------------------

test("buildRulesModel derives caps via the validation helpers (floored)", () => {
  // $25 entry at 50% floors to $12 — Math.round would say $13.
  const model = buildRulesModel({ entry_fee: 25, is_player: true }, RULES)
  assert.deepEqual(model, {
    entry_fee: 25,
    max_single_bet: 12,
    max_self_bet: 6,
    min_picks_per_phase: 5,
    max_picks_per_phase: 10,
  })
})

test("buildRulesModel applies the hard caps at higher entries", () => {
  const model = buildRulesModel({ entry_fee: 50, is_player: true }, RULES)
  assert.equal(model.max_single_bet, 20)
  assert.equal(model.max_self_bet, 10)
})

test("buildRulesModel exempts non-players from the self-bet cap (Q14)", () => {
  const model = buildRulesModel({ entry_fee: 40, is_player: false }, RULES)
  assert.equal(model.max_self_bet, null)
  assert.equal(model.max_single_bet, 20)
})

test("buildRulesModel coerces a string entry_fee from PostgREST", () => {
  const model = buildRulesModel(
    { entry_fee: "40" as unknown as number, is_player: true },
    RULES
  )
  assert.equal(model.entry_fee, 40)
  assert.equal(model.max_single_bet, 20)
})
