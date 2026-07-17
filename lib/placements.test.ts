// Unit tests for lib/placements.ts — the pure half of the /api/placements
// route: body parsing, row normalization, context assembly, write planning.
// Zero-dependency by design: node:test via npm run test.

import test from "node:test"
import assert from "node:assert/strict"
import {
  buildPlacementContext,
  normalizeExistingPlacements,
  normalizeTargetPick,
  parseDeleteBody,
  parsePlacementBody,
  planWrite,
  toTournamentRules,
  type PickQueryRow,
  type PlacementQueryRow,
} from "./placements.ts"
import { validatePlacement } from "./validation.ts"

// ---------------------------------------------------------------------------
// Body parsing
// ---------------------------------------------------------------------------

test("parsePlacementBody accepts a well-formed body", () => {
  const parsed = parsePlacementBody({ pick_id: "abc", amount: 10 })
  assert.deepEqual(parsed, { ok: true, pick_id: "abc", amount: 10 })
})

test("parsePlacementBody rejects malformed bodies with readable errors", () => {
  for (const [body, expected] of [
    [null, "Request body must be JSON."],
    ["nope", "Request body must be JSON."],
    [{}, "pick_id is required."],
    [{ pick_id: "" }, "pick_id is required."],
    [{ pick_id: 5, amount: 10 }, "pick_id is required."],
    [{ pick_id: "abc" }, "amount must be a number."],
    [{ pick_id: "abc", amount: "10" }, "amount must be a number."],
    [{ pick_id: "abc", amount: NaN }, "amount must be a number."],
  ] as const) {
    const parsed = parsePlacementBody(body)
    assert.equal(parsed.ok, false)
    if (!parsed.ok) assert.equal(parsed.error, expected)
  }
})

test("parsePlacementBody leaves dollar rules to validation", () => {
  // Non-integer and sub-minimum amounts parse fine — validateAmount owns them.
  assert.equal(parsePlacementBody({ pick_id: "abc", amount: 2.5 }).ok, true)
  assert.equal(parsePlacementBody({ pick_id: "abc", amount: 0 }).ok, true)
})

test("parseDeleteBody wants only a pick_id", () => {
  assert.deepEqual(parseDeleteBody({ pick_id: "abc" }), {
    ok: true,
    pick_id: "abc",
  })
  assert.equal(parseDeleteBody({}).ok, false)
  assert.equal(parseDeleteBody(null).ok, false)
})

// ---------------------------------------------------------------------------
// toTournamentRules — the row is passed verbatim, but numerics may arrive as
// strings from PostgREST
// ---------------------------------------------------------------------------

test("toTournamentRules coerces string numerics", () => {
  const rules = toTournamentRules({
    entry_fee_min: 20,
    entry_fee_max: 50,
    min_picks_per_phase: 5,
    max_picks_per_phase: 10,
    max_single_bet_pct: "0.50",
    max_single_bet_cap: 20,
    max_self_bet_pct: "0.25",
    max_self_bet_cap: 10,
  })
  assert.equal(rules.max_single_bet_pct, 0.5)
  assert.equal(rules.max_self_bet_pct, 0.25)
  assert.equal(rules.entry_fee_max, 50)
})

// ---------------------------------------------------------------------------
// normalizeTargetPick — object and array join shapes
// ---------------------------------------------------------------------------

const betJoin = {
  id: "bet-1",
  tournament_id: "tourn-1",
  status: "open",
  phase: 1,
  bet_categories: { allows_multiple_picks: false },
  bet_picks: [{ player_user_id: "user-a" }, { player_user_id: null }],
}

test("normalizeTargetPick flattens an object-shaped join", () => {
  const row: PickQueryRow = {
    id: "pick-1",
    player_user_id: "user-a",
    american_odds: -110,
    bets: betJoin,
  }
  const target = normalizeTargetPick(row)
  assert.ok(target)
  assert.equal(target.pick.id, "pick-1")
  assert.equal(target.bet.status, "open")
  assert.equal(target.bet.phase, 1)
  assert.equal(target.bet.allows_multiple_picks, false)
  assert.deepEqual(target.bet.pick_player_user_ids, ["user-a", null])
  assert.equal(target.tournament_id, "tourn-1")
  assert.equal(target.current_american_odds, -110)
})

test("normalizeTargetPick flattens array-shaped joins", () => {
  const row: PickQueryRow = {
    id: "pick-1",
    player_user_id: null,
    american_odds: 150,
    bets: [{ ...betJoin, bet_categories: [{ allows_multiple_picks: true }] }],
  }
  const target = normalizeTargetPick(row)
  assert.ok(target)
  assert.equal(target.bet.allows_multiple_picks, true)
})

test("normalizeTargetPick returns null on missing joins or bad enums", () => {
  const base: PickQueryRow = {
    id: "pick-1",
    player_user_id: null,
    american_odds: 150,
    bets: betJoin,
  }
  assert.equal(normalizeTargetPick({ ...base, bets: null }), null)
  assert.equal(
    normalizeTargetPick({
      ...base,
      bets: { ...betJoin, bet_categories: null },
    }),
    null
  )
  assert.equal(
    normalizeTargetPick({ ...base, bets: { ...betJoin, status: "weird" } }),
    null
  )
  assert.equal(
    normalizeTargetPick({ ...base, bets: { ...betJoin, phase: 3 } }),
    null
  )
})

// ---------------------------------------------------------------------------
// normalizeExistingPlacements — tournament scoping + join flattening
// ---------------------------------------------------------------------------

function placementRow(
  pickId: string,
  amount: number,
  tournamentId: string,
  phase = 1,
  playerUserId: string | null = null
): PlacementQueryRow {
  return {
    pick_id: pickId,
    amount,
    bet_picks: {
      player_user_id: playerUserId,
      bets: { id: `bet-${pickId}`, phase, tournament_id: tournamentId },
    },
  }
}

test("normalizeExistingPlacements keeps only the target tournament", () => {
  const rows = [
    placementRow("p1", 5, "tourn-1", 1, "user-a"),
    placementRow("p2", 10, "tourn-1", 2),
    placementRow("p3", 20, "tourn-OTHER"),
  ]
  const existing = normalizeExistingPlacements(rows, "tourn-1")
  assert.equal(existing.length, 2)
  assert.deepEqual(existing[0], {
    pick_id: "p1",
    bet_id: "bet-p1",
    phase: 1,
    amount: 5,
    pick_player_user_id: "user-a",
  })
  assert.equal(existing[1].phase, 2)
})

test("normalizeExistingPlacements drops rows with unreadable joins", () => {
  const rows: PlacementQueryRow[] = [
    { pick_id: "p1", amount: 5, bet_picks: null },
    placementRow("p2", 10, "tourn-1"),
  ]
  const existing = normalizeExistingPlacements(rows, "tourn-1")
  assert.equal(existing.length, 1)
  assert.equal(existing[0].pick_id, "p2")
})

test("normalizeExistingPlacements coerces string amounts", () => {
  const row = placementRow("p1", 5, "tourn-1")
  ;(row as { amount: number | string }).amount = "5"
  const existing = normalizeExistingPlacements([row], "tourn-1")
  assert.equal(existing[0].amount, 5)
})

// ---------------------------------------------------------------------------
// buildPlacementContext feeds validation the shape it expects, end to end
// ---------------------------------------------------------------------------

const seedRules = {
  entry_fee_min: 20,
  entry_fee_max: 50,
  min_picks_per_phase: 5,
  max_picks_per_phase: 10,
  max_single_bet_pct: 0.5,
  max_single_bet_cap: 20,
  max_self_bet_pct: 0.25,
  max_self_bet_cap: 10,
}

test("assembled context flows through validatePlacement (legal placement)", () => {
  const target = normalizeTargetPick({
    id: "pick-1",
    player_user_id: null,
    american_odds: 110,
    bets: {
      ...betJoin,
      bet_categories: { allows_multiple_picks: true },
      bet_picks: [{ player_user_id: null }],
    },
  })!
  const ctx = buildPlacementContext(
    { user_id: "user-me", entry_fee: 40, is_player: true },
    target,
    []
  )
  const verdict = validatePlacement(ctx, 10, seedRules)
  assert.deepEqual(verdict, { ok: true, requires_admin_review: false })
})

test("assembled context surfaces §7 violations verbatim", () => {
  const target = normalizeTargetPick({
    id: "pick-1",
    player_user_id: null,
    american_odds: 110,
    bets: { ...betJoin, bet_categories: { allows_multiple_picks: true } },
  })!
  const ctx = buildPlacementContext(
    { user_id: "user-me", entry_fee: 40, is_player: true },
    target,
    []
  )
  const verdict = validatePlacement(ctx, 25, seedRules)
  assert.equal(verdict.ok, false)
  if (!verdict.ok)
    assert.deepEqual(verdict.errors, ["Max single bet is $20 for your $40 entry."])
})

// ---------------------------------------------------------------------------
// planWrite — insert vs update-by-key vs revive
// ---------------------------------------------------------------------------

test("planWrite inserts when the bettor has no row on the pick", () => {
  const plan = planWrite(null, 10, -110, false)
  assert.deepEqual(plan, {
    kind: "insert",
    fields: {
      amount: 10,
      odds_at_placement: -110,
      requires_admin_review: false,
      deleted_at: null,
    },
  })
})

test("planWrite updates by key when a live row exists", () => {
  const plan = planWrite({ id: "row-1", deleted_at: null }, 15, 120, false)
  assert.equal(plan.kind, "update")
  if (plan.kind !== "insert") assert.equal(plan.id, "row-1")
  assert.equal(plan.fields.amount, 15)
})

test("planWrite revives a soft-deleted row: clears deleted_at, re-snapshots odds", () => {
  const plan = planWrite(
    { id: "row-1", deleted_at: "2026-07-17T00:00:00Z" },
    8,
    135, // the pick was repriced since the original placement
    false
  )
  assert.equal(plan.kind, "revive")
  assert.equal(plan.fields.deleted_at, null)
  assert.equal(plan.fields.odds_at_placement, 135)
  assert.equal(plan.fields.amount, 8)
})
