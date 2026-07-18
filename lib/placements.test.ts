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
// Error surface: every §7 hard-block violation, driven through the same
// context assembly the route uses, produces the exact lib/validation.ts
// message the client renders under the input.
// ---------------------------------------------------------------------------

test("every §7 violation surfaces its validation message verbatim", () => {
  const me = { user_id: "user-me", entry_fee: 40, is_player: true }
  const openBet = (over: Partial<typeof betJoin> = {}) => ({ ...betJoin, ...over })
  const placementOn = (
    pickId: string,
    amount: number,
    phase: 1 | 2 = 1,
    playerUserId: string | null = null
  ) => ({
    pick_id: pickId,
    bet_id: `bet-of-${pickId}`,
    phase,
    amount,
    pick_player_user_id: playerUserId,
  })

  const cases: {
    name: string
    pick: PickQueryRow
    amount: number
    existing: ReturnType<typeof placementOn>[]
    expected: string
  }[] = [
    {
      name: "closed bet",
      pick: {
        id: "pick-1",
        player_user_id: null,
        american_odds: 110,
        bets: openBet({ status: "closed", bet_categories: { allows_multiple_picks: true } }),
      },
      amount: 5,
      existing: [],
      expected: "This bet is not open for wagering.",
    },
    {
      name: "fractional dollars",
      pick: {
        id: "pick-1",
        player_user_id: null,
        american_odds: 110,
        bets: openBet({ bet_categories: { allows_multiple_picks: true } }),
      },
      amount: 2.5,
      existing: [],
      expected: "Bet amounts must be whole dollars.",
    },
    {
      name: "over the single-bet max",
      pick: {
        id: "pick-1",
        player_user_id: null,
        american_odds: 110,
        bets: openBet({ bet_categories: { allows_multiple_picks: true } }),
      },
      amount: 21,
      existing: [],
      expected: "Max single bet is $20 for your $40 entry.",
    },
    {
      name: "over the phase pick count",
      pick: {
        id: "pick-new",
        player_user_id: null,
        american_odds: 110,
        bets: openBet({ bet_categories: { allows_multiple_picks: true } }),
      },
      amount: 1,
      existing: Array.from({ length: 10 }, (_, i) => placementOn(`p${i}`, 1)),
      expected:
        "You've already wagered on 10 picks in Phase 1 — the maximum is 10.",
    },
    {
      name: "over the self-bet cap",
      pick: {
        id: "pick-1",
        player_user_id: "user-me",
        american_odds: 110,
        bets: openBet({
          bet_categories: { allows_multiple_picks: true },
          bet_picks: [{ player_user_id: "user-me" }],
        }),
      },
      amount: 6,
      existing: [placementOn("p-other-self", 5, 1, "user-me")],
      expected:
        "Max total on yourself is $10 for your $40 entry — this would put you at $11.",
    },
    {
      name: "over the running total",
      pick: {
        id: "pick-1",
        player_user_id: null,
        american_odds: 110,
        bets: openBet({ bet_categories: { allows_multiple_picks: true } }),
      },
      amount: 20,
      existing: [placementOn("p1", 15), placementOn("p2", 10, 2)],
      expected:
        "This would put your total wagered at $45 — your $40 entry is the most you can wager across both phases.",
    },
    {
      name: "second pick in a single-pick bet",
      pick: {
        id: "pick-b",
        player_user_id: null,
        american_odds: 110,
        bets: openBet({ bet_categories: { allows_multiple_picks: false } }),
      },
      amount: 5,
      existing: [{ ...placementOn("pick-a", 5), bet_id: "bet-1" }],
      expected: "This bet allows only one pick per participant.",
    },
    {
      name: "betting on your opponent",
      pick: {
        id: "pick-opp",
        player_user_id: "user-opponent",
        american_odds: 110,
        bets: openBet({
          bet_categories: { allows_multiple_picks: false },
          bet_picks: [
            { player_user_id: "user-me" },
            { player_user_id: "user-opponent" },
          ],
        }),
      },
      amount: 5,
      existing: [],
      expected: "You can't bet on your opponent in a match you're playing in.",
    },
  ]

  for (const c of cases) {
    const target = normalizeTargetPick(c.pick)
    assert.ok(target, c.name)
    const ctx = buildPlacementContext(me, target!, c.existing)
    const verdict = validatePlacement(ctx, c.amount, seedRules)
    assert.equal(verdict.ok, false, c.name)
    if (!verdict.ok) assert.ok(verdict.errors.includes(c.expected), `${c.name}: got ${JSON.stringify(verdict.errors)}`)
  }
})

// ---------------------------------------------------------------------------
// Self-pick flagging (requires_admin_review) — computed by validation from
// the assembled context, carried into the write by planWrite. Recomputed on
// EVERY write: place, edit, and revive.
// ---------------------------------------------------------------------------

test("a self-pick within the cap validates ok with requires_admin_review", () => {
  const target = normalizeTargetPick({
    id: "pick-1",
    player_user_id: "user-me",
    american_odds: 200,
    bets: {
      ...betJoin,
      bet_categories: { allows_multiple_picks: true },
      bet_picks: [{ player_user_id: "user-me" }, { player_user_id: null }],
    },
  })!
  const ctx = buildPlacementContext(
    { user_id: "user-me", entry_fee: 40, is_player: true },
    target,
    []
  )
  const verdict = validatePlacement(ctx, 10, seedRules) // maxSelfBet($40) = $10
  assert.deepEqual(verdict, { ok: true, requires_admin_review: true })

  // The flag lands on the write, whether it's a fresh place…
  const insert = planWrite(null, 10, target.current_american_odds, true)
  assert.equal(insert.fields.requires_admin_review, true)
  // …an edit of a live row, or a revive of a soft-deleted one.
  const revive = planWrite(
    { id: "row-1", deleted_at: "2026-07-17T00:00:00Z" },
    10,
    target.current_american_odds,
    true
  )
  assert.equal(revive.fields.requires_admin_review, true)
})

test("unlinked picks (Field / Yes / No) are never flagged for review", () => {
  const target = normalizeTargetPick({
    id: "pick-field",
    player_user_id: null,
    american_odds: 300,
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

test("recompute on edit: flag follows the pick's CURRENT player link", () => {
  // The bettor's row was flagged when placed; since then the admin fixed the
  // pick's player link in Studio to a different user. Editing the amount
  // recomputes the flag from today's context — it comes off.
  const target = normalizeTargetPick({
    id: "pick-1",
    player_user_id: "user-other",
    american_odds: 200,
    bets: {
      ...betJoin,
      bet_categories: { allows_multiple_picks: true },
      bet_picks: [{ player_user_id: "user-other" }],
    },
  })!
  const ctx = buildPlacementContext(
    { user_id: "user-me", entry_fee: 40, is_player: true },
    target,
    [
      {
        pick_id: "pick-1",
        bet_id: "bet-1",
        phase: 1,
        amount: 10,
        pick_player_user_id: "user-other",
      },
    ]
  )
  const verdict = validatePlacement(ctx, 12, seedRules)
  assert.deepEqual(verdict, { ok: true, requires_admin_review: false })
  const plan = planWrite({ id: "row-1", deleted_at: null }, 12, 200, false)
  assert.equal(plan.kind, "update")
  assert.equal(plan.fields.requires_admin_review, false)
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
  assert.equal(plan.id, "row-1")
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
