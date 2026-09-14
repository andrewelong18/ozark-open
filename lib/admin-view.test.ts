// Unit tests for lib/admin-view.ts — the pure half of /admin/view: join
// normalization for everyone's placements and the per-bettor View-sheet
// grouping with its money columns, per phase since Sprint 30 (ADR 0002).
// Zero-dependency by design: node:test via npm run test.

import test from "node:test"
import assert from "node:assert/strict"
import {
  buildAdminView,
  normalizeAdminRows,
  type AdminViewQueryRow,
} from "./admin-view.ts"
import type { TournamentRules } from "./validation.ts"

const T = "t-1"

const RULES: TournamentRules = {
  entry_fee_min: 20,
  entry_fee_max: 50,
  min_picks_per_phase: 5,
  max_single_bet: 10,
  max_self_bet_pct: 0.25,
}

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
  player_user_id?: string | null
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
    player_user_id: overrides.player_user_id ?? null,
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
  assert.equal(r.is_self_pick, false)
  assert.equal(r.theoretical, 10.5)
  assert.equal(r.refunded, 0)
})

test("normalizeAdminRows reads the live self-pick fact off the pick's player", () => {
  const [self] = normalizeAdminRows([row({ pick_id: "p-1", amount: 5, player_user_id: "u-a" })], T)
  assert.equal(self.is_self_pick, true)
  const [other] = normalizeAdminRows([row({ pick_id: "p-1", amount: 5, player_user_id: "u-z" })], T)
  assert.equal(other.is_self_pick, false)
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
  { user_id: "u-a", display_name: "Ann", is_player: true, phase1_entry_fee: 40, phase2_entry_fee: 20 },
  { user_id: "u-b", display_name: "Bo", is_player: true, phase1_entry_fee: 30, phase2_entry_fee: null },
  { user_id: "u-n", display_name: "Nia", is_player: true, phase1_entry_fee: null, phase2_entry_fee: null },
]

test("buildAdminView groups entered bettors alphabetically with menu-ordered rows, and lists the unentered", () => {
  const rows = normalizeAdminRows(
    [
      row({ pick_id: "late", user_id: "u-a", amount: 5, phase: 2, sheet_bet_id: 9 }),
      row({ pick_id: "early", user_id: "u-a", amount: 4, phase: 1, round: "tournament", sheet_bet_id: 2 }),
      row({ pick_id: "bo-1", user_id: "u-b", display_name: "Bo", amount: 10 }),
    ],
    T
  )
  const view = buildAdminView(PARTICIPANTS, rows, RULES)
  assert.deepEqual(
    view.bettors.map((b) => b.display_name),
    ["Ann", "Bo"]
  )
  const ann = view.bettors[0]
  assert.deepEqual(
    ann.entries.map((e) => e.placement_id),
    ["pl-early", "pl-late"]
  )
  assert.equal(ann.wagered, 9)
  assert.deepEqual(
    ann.phases.map((p) => [p.phase, p.entry, p.wagered, p.committed, p.refund]),
    [
      [1, 40, 4, 20, 20],
      [2, 20, 5, 20, 0],
    ]
  )
  assert.deepEqual(view.unentered.map((p) => p.display_name), ["Nia"])
})

test("buildAdminView money columns match the per-phase split", () => {
  const rows = normalizeAdminRows(
    [
      row({ pick_id: "a-hit", amount: 5, odds: 110, result: "hit" }),
      row({ pick_id: "b-void", user_id: "u-b", display_name: "Bo", amount: 7, odds: 300, result: "void", sheet_pick_id: 2 }),
      row({ pick_id: "b-open", user_id: "u-b", display_name: "Bo", amount: 2, sheet_pick_id: 3 }),
    ],
    T
  )
  const view = buildAdminView(PARTICIPANTS, rows, RULES)
  // Phase 1: Ann committed 20 (W = 5), Bo committed 20 (W = 9) − 7 voided = 33.
  // Phase 2: Ann committed 20 (W = 0). Combined 53.
  assert.deepEqual(view.pools, { 1: 33, 2: 20, combined: 53 })
  assert.equal(view.sum_theoretical, 10.5)
  assert.equal(view.pending, 1)
  const ann = view.bettors[0]
  assert.equal(ann.theoretical, 10.5)
  assert.equal(ann.actual, 33) // sole theoretical holder takes Phase 1's whole pot
  assert.equal(ann.refund_unwagered, 20) // Phase 1: 40 − 20 committed
  const bo = view.bettors[1]
  assert.equal(bo.refunded, 7)
  assert.equal(bo.actual, 0)
  assert.equal(bo.pending, 1)
  assert.equal(bo.forfeit_unwagered, 11)
})

test("buildAdminView keeps entered participants with no placements (the chase list)", () => {
  const view = buildAdminView(PARTICIPANTS, [], RULES)
  assert.equal(view.bettors.length, 2)
  assert.deepEqual(
    view.bettors.map((b) => [b.display_name, b.wagered, b.entries.length, b.forfeit_unwagered]),
    [
      ["Ann", 0, 0, 40],
      ["Bo", 0, 0, 20],
    ]
  )
  assert.deepEqual(view.pools, { 1: 40, 2: 20, combined: 60 })
})

test("buildAdminView counts self-pick review flags per bettor and drops orphaned rows", () => {
  const rows = normalizeAdminRows(
    [
      row({ pick_id: "p-1", amount: 5, flagged: true }),
      row({ pick_id: "p-2", amount: 5, flagged: true, sheet_pick_id: 2 }),
      row({ pick_id: "p-3", amount: 5, sheet_pick_id: 3 }),
      // Bo has no Phase 2 entry, so this Phase 2 row of his is in no pot.
      row({ pick_id: "p-4", user_id: "u-b", display_name: "Bo", amount: 5, phase: 2 }),
    ],
    T
  )
  const view = buildAdminView(PARTICIPANTS, rows, RULES)
  assert.equal(view.bettors[0].flagged, 2)
  assert.equal(view.dropped_placements, 1)
})
