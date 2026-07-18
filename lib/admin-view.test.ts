// Unit tests for lib/admin-view.ts — the pure half of /admin/view: join
// normalization for everyone's placements and the per-bettor View-sheet
// grouping with its money columns. Zero-dependency by design: node:test via
// npm run test.

import test from "node:test"
import assert from "node:assert/strict"
import {
  buildAdminView,
  normalizeAdminRows,
  type AdminViewQueryRow,
} from "./admin-view.ts"

const T = "t-1"

function row(overrides: {
  id?: string
  user_id?: string
  display_name?: string | null
  pick_id: string
  amount: number
  odds?: number
  phase?: number
  round?: string
  status?: string
  bet_title?: string
  sheet_bet_id?: number
  pick_label?: string
  sheet_pick_id?: number
  result?: string
  flagged?: boolean
  tournament_id?: string
  asArrays?: boolean
}): AdminViewQueryRow {
  const bet = {
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
    result: overrides.result ?? "pending",
    bets: overrides.asArrays ? [bet] : bet,
  }
  const user =
    overrides.display_name === null
      ? null
      : { display_name: overrides.display_name ?? "Ann" }
  return {
    id: overrides.id ?? `pl-${overrides.pick_id}`,
    user_id: overrides.user_id ?? "u-a",
    pick_id: overrides.pick_id,
    amount: overrides.amount,
    odds_at_placement: overrides.odds ?? 150,
    requires_admin_review: overrides.flagged ?? false,
    users: overrides.asArrays && user ? [user] : user,
    bet_picks: overrides.asArrays ? [pick] : pick,
  }
}

// ---------------------------------------------------------------------------
// normalizeAdminRows
// ---------------------------------------------------------------------------

test("normalizeAdminRows flattens joins and computes payout numbers", () => {
  const [r] = normalizeAdminRows(
    [row({ pick_id: "p-1", amount: 5, odds: 110, result: "hit", flagged: true })],
    T
  )
  assert.equal(r.display_name, "Ann")
  assert.equal(r.phase, 1)
  assert.equal(r.amount, 5)
  assert.equal(r.odds_at_placement, 110)
  assert.equal(r.result, "hit")
  assert.equal(r.requires_admin_review, true)
  assert.equal(r.theoretical, 10.5)
  assert.equal(r.refunded, 0)
})

test("normalizeAdminRows treats object and array join shapes the same", () => {
  const objects = normalizeAdminRows([row({ pick_id: "p-1", amount: 5 })], T)
  const arrays = normalizeAdminRows(
    [row({ pick_id: "p-1", amount: 5, asArrays: true })],
    T
  )
  assert.deepEqual(arrays, objects)
})

test("normalizeAdminRows keeps rows with a missing users join (placeholder name)", () => {
  const [r] = normalizeAdminRows(
    [row({ pick_id: "p-1", amount: 5, display_name: null })],
    T
  )
  assert.equal(r.display_name, "Unknown bettor")
  assert.equal(r.amount, 5)
})

test("normalizeAdminRows drops other tournaments and unreadable joins", () => {
  const noPick: AdminViewQueryRow = {
    ...row({ pick_id: "p-1", amount: 5 }),
    bet_picks: null,
  }
  const rows = normalizeAdminRows(
    [noPick, row({ pick_id: "p-2", amount: 5, tournament_id: "t-other" })],
    T
  )
  assert.deepEqual(rows, [])
})

test("normalizeAdminRows coerces string numerics and whitelists results", () => {
  const raw = row({ pick_id: "p-1", amount: 5, result: "won" })
  raw.amount = "5" as unknown as number
  raw.odds_at_placement = "-130" as unknown as number
  const [r] = normalizeAdminRows([raw], T)
  assert.equal(r.amount, 5)
  assert.equal(r.odds_at_placement, -130)
  assert.equal(r.result, "pending")
  assert.equal(r.theoretical, null)
})

// ---------------------------------------------------------------------------
// buildAdminView
// ---------------------------------------------------------------------------

const PARTICIPANTS = [
  { user_id: "u-a", display_name: "Ann", entry_fee: 40 },
  { user_id: "u-b", display_name: "Bo", entry_fee: 30 },
]

test("buildAdminView groups by bettor alphabetically with menu-ordered rows", () => {
  const rows = normalizeAdminRows(
    [
      row({ pick_id: "late", user_id: "u-b", display_name: "Bo", amount: 5, phase: 2, sheet_bet_id: 9 }),
      row({ pick_id: "early", user_id: "u-b", display_name: "Bo", amount: 4, phase: 1, round: "tournament", sheet_bet_id: 2 }),
      row({ pick_id: "ann-1", amount: 10 }),
    ],
    T
  )
  const view = buildAdminView(PARTICIPANTS, rows)
  assert.deepEqual(
    view.bettors.map((b) => b.display_name),
    ["Ann", "Bo"]
  )
  const bo = view.bettors[1]
  assert.deepEqual(
    bo.entries.map((e) => e.placement_id),
    ["pl-early", "pl-late"]
  )
  assert.equal(bo.wagered, 9)
})

test("buildAdminView money columns match the pari-mutuel split", () => {
  const rows = normalizeAdminRows(
    [
      row({ pick_id: "a-hit", amount: 5, odds: 110, result: "hit" }),
      row({ pick_id: "b-void", user_id: "u-b", display_name: "Bo", amount: 7, odds: 300, result: "void", sheet_pick_id: 2 }),
      row({ pick_id: "b-open", user_id: "u-b", display_name: "Bo", amount: 2, sheet_pick_id: 3 }),
    ],
    T
  )
  const view = buildAdminView(PARTICIPANTS, rows)
  // Pool: 40 + 30 − 7 voided = 63; sum theoretical = 10.50 (Ann's hit).
  assert.equal(view.pool, 63)
  assert.equal(view.sum_theoretical, 10.5)
  assert.equal(view.pending, 1)
  const ann = view.bettors[0]
  assert.equal(ann.theoretical, 10.5)
  assert.equal(ann.actual, 63) // sole theoretical holder takes the whole pool
  const bo = view.bettors[1]
  assert.equal(bo.refunded, 7)
  assert.equal(bo.actual, 0)
  assert.equal(bo.pending, 1)
})

test("buildAdminView keeps participants with no placements (the chase list)", () => {
  const view = buildAdminView(PARTICIPANTS, [])
  assert.equal(view.bettors.length, 2)
  assert.deepEqual(
    view.bettors.map((b) => [b.display_name, b.wagered, b.entries.length]),
    [
      ["Ann", 0, 0],
      ["Bo", 0, 0],
    ]
  )
  assert.equal(view.pool, 70)
})

test("buildAdminView counts self-pick review flags per bettor", () => {
  const rows = normalizeAdminRows(
    [
      row({ pick_id: "p-1", amount: 5, flagged: true }),
      row({ pick_id: "p-2", amount: 5, flagged: true, sheet_pick_id: 2 }),
      row({ pick_id: "p-3", amount: 5, sheet_pick_id: 3 }),
    ],
    T
  )
  const view = buildAdminView(PARTICIPANTS, rows)
  assert.equal(view.bettors[0].flagged, 2)
})
