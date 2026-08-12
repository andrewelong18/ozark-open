// Unit tests for lib/placements.ts — the pure half of the /api/placements
// route: body parsing, row normalization, context assembly, write planning.
// Zero-dependency by design: node:test via npm run test.

import test from "node:test"
import assert from "node:assert/strict"
import {
  buildPlacementContext,
  normalizeExistingPlacements,
  normalizeTargetPick,
  parseAdminDeleteBody,
  parseAdminPlacementBody,
  parseDeleteBody,
  parsePlacementBody,
  placedPickIdIn,
  placementTarget,
  planWrite,
  scopePlacements,
  stakeEntryError,
  toTournamentRules,
  type PickQueryRow,
  type PlacementQueryRow,
} from "./placements.ts"
import { validateAmount, validatePlacement } from "./validation.ts"
import type { PhaseClock } from "./phases.ts"

// No deadline set = the pre-Sprint-25 behaviour: the phase never closes on the
// clock, so these fixtures exercise the §7 rules rather than the deadline.
const OPEN_CLOCK: PhaseClock = {
  phase1_closes_at: null,
  phase2_closes_at: null,
  show_countdown: true,
}
const NOW = new Date("2026-09-24T12:00:00Z")

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

// The on-behalf parsers (#101). The bettor's identity is a REQUIRED field of
// an admin request: an omitted userId must 400, never fall back to the acting
// admin, which is precisely how you write a valid wager for the wrong person.
test("parseAdminPlacementBody requires the bettor's userId", () => {
  const parsed = parseAdminPlacementBody({ pick_id: "abc", amount: 10 })
  assert.equal(parsed.ok, false)
  if (!parsed.ok) assert.match(parsed.error, /userId is required/)
})

test("parseAdminPlacementBody accepts a well-formed on-behalf body", () => {
  const parsed = parseAdminPlacementBody({
    userId: "member-1",
    pick_id: "abc",
    amount: 10,
  })
  assert.deepEqual(parsed, {
    ok: true,
    user_id: "member-1",
    pick_id: "abc",
    amount: 10,
  })
})

test("parseAdminPlacementBody still applies the base shape rules", () => {
  assert.equal(parseAdminPlacementBody({ userId: "member-1", amount: 10 }).ok, false)
  assert.equal(
    parseAdminPlacementBody({ userId: "member-1", pick_id: "abc", amount: "10" }).ok,
    false
  )
})

test("parseAdminPlacementBody rejects a blank userId, not just a missing one", () => {
  assert.equal(
    parseAdminPlacementBody({ userId: "   ", pick_id: "abc", amount: 10 }).ok,
    false
  )
})

test("parseAdminDeleteBody requires the bettor's userId too", () => {
  assert.equal(parseAdminDeleteBody({ pick_id: "abc" }).ok, false)
  assert.deepEqual(parseAdminDeleteBody({ userId: "member-1", pick_id: "abc" }), {
    ok: true,
    user_id: "member-1",
    pick_id: "abc",
  })
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
    min_picks_per_tournament: 5,
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
  min_picks_per_tournament: 5,
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
    [],
    OPEN_CLOCK,
    NOW
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
    [],
    OPEN_CLOCK,
    NOW
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
        "Phase 1 is full — 10 picks max.",
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
        "Over your $40 entry — that's the most you can wager across both phases.",
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
    const ctx = buildPlacementContext(me, target!, c.existing, OPEN_CLOCK, NOW)
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
    [],
    OPEN_CLOCK,
    NOW
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
    [],
    OPEN_CLOCK,
    NOW
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
    ],
    OPEN_CLOCK,
    NOW
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
      // The bettor wrote their own row — that's what NULL means (#101).
      placed_by_user_id: null,
    },
  })
})

test("planWrite records the acting admin on an on-behalf write", () => {
  const plan = planWrite(null, 10, -110, false, "admin-1")
  assert.equal(plan.fields.placed_by_user_id, "admin-1")
})

test("planWrite re-stamps the actor on an edit and a revive, not just an insert", () => {
  // The column answers "who last touched this row", so an admin correcting a
  // wager the member placed themselves must take the attribution.
  const edit = planWrite({ id: "row-1", deleted_at: null }, 12, 120, false, "admin-1")
  assert.equal(edit.kind, "update")
  assert.equal(edit.fields.placed_by_user_id, "admin-1")

  const revive = planWrite(
    { id: "row-1", deleted_at: "2026-07-17T00:00:00Z" },
    12,
    120,
    false,
    "admin-1"
  )
  assert.equal(revive.kind, "revive")
  assert.equal(revive.fields.placed_by_user_id, "admin-1")
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

// ---------------------------------------------------------------------------
// stakeEntryError — the stake box's own check (#92)
// ---------------------------------------------------------------------------

test("stakeEntryError lets a real stake through", () => {
  assert.equal(stakeEntryError("25"), null)
  assert.equal(stakeEntryError("1"), null)
  assert.equal(stakeEntryError("007"), null)
  assert.equal(stakeEntryError(" 25 "), null)
})

test("stakeEntryError reports the whole boundary set instead of failing silently", () => {
  // $0 is the one from the dry run: the button was enabled and the press did
  // nothing at all. Every one of these must produce a message to show.
  assert.match(stakeEntryError("0")!, /Minimum bet is \$1/)
  assert.match(stakeEntryError("-5")!, /Minimum bet is \$1/)
  assert.match(stakeEntryError("2.50")!, /whole dollars/)
  assert.match(stakeEntryError("")!, /Enter an amount/)
  assert.match(stakeEntryError("   ")!, /Enter an amount/)
  assert.match(stakeEntryError("abc")!, /whole dollars/)
})

test("stakeEntryError says exactly what the server would say", () => {
  // The client must never invent its own wording for a §7 rule — drift here
  // is how "the app says one thing, the API says another" starts.
  for (const raw of ["0", "-5", "2.50"]) {
    assert.equal(stakeEntryError(raw), validateAmount(Number(raw)))
  }
})

// ---------------------------------------------------------------------------
// placementTarget — the on-behalf endpoint swap (Sprint 24, trap 2)
// ---------------------------------------------------------------------------

test("a member's own wager posts to the member route with no bettor field", () => {
  const target = placementTarget(null)
  assert.equal(target.endpoint, "/api/placements")
  assert.deepEqual(target.bettorField, {})
})

test("an on-behalf wager posts to the admin route and names the MEMBER", () => {
  const target = placementTarget({ userId: "member-1", name: "Jake Kohne" })
  assert.equal(target.endpoint, "/api/admin/placements")
  assert.deepEqual(target.bettorField, { userId: "member-1" })
})

test("the two targets never collide — a dropped flag changes the endpoint", () => {
  // THE FAILURE THIS GUARDS. If the onBehalfOf prop is dropped anywhere on the
  // way page → BetsMenu → BetPlacementCard, the card falls back to the member
  // route and the admin's wager for someone else is recorded against the
  // ADMIN: a valid, correctly-validated wager on the wrong person's slate.
  // The endpoints must stay distinguishable so that fallback is never silent.
  const own = placementTarget(null)
  const behalf = placementTarget({ userId: "member-1", name: "Jake Kohne" })
  assert.notEqual(own.endpoint, behalf.endpoint)
  // And the member route must carry no identity at all — it reads the session,
  // so a stray userId in the body must not be able to redirect the write.
  assert.deepEqual(Object.keys(own.bettorField), [])
})

// ---------------------------------------------------------------------------
// scopePlacements / placedPickIdIn — the map a card is allowed to believe (#161)
// ---------------------------------------------------------------------------

// Pat's exact case, Aug 12. He had $7 on a Group Match pick and wagers on four
// other bets; the Match card next to it adopted whichever wager sat first in
// the map and refused every pick it owned.
const MATCH_PICKS = ["pick-nulsen", "pick-davis"]
const GROUP_PICKS = ["pick-kipping", "pick-arand", "pick-kohne"]
const TOURNAMENT_WIDE = {
  "pick-kohne": 7,
  "pick-mercer": 5,
  "pick-yenzer": 4,
  "pick-jones": 3,
}

test("a card only sees the wagers on its own picks", () => {
  assert.deepEqual(scopePlacements(GROUP_PICKS, TOURNAMENT_WIDE), {
    "pick-kohne": 7,
  })
})

test("a card with no wager on it sees an empty map, not someone else's", () => {
  // THE BUG. The Match card used to read `Object.keys(map)[0]` — "pick-kohne",
  // a pick it does not own — and every row then failed `placedPickId !== id`.
  assert.deepEqual(scopePlacements(MATCH_PICKS, TOURNAMENT_WIDE), {})
  assert.equal(placedPickIdIn(MATCH_PICKS, TOURNAMENT_WIDE), null)
})

test("the placed pick of a pick-one bet is found by id, not by map order", () => {
  assert.equal(placedPickIdIn(GROUP_PICKS, TOURNAMENT_WIDE), "pick-kohne")
})

test("an empty placements map places nothing anywhere", () => {
  assert.deepEqual(scopePlacements(GROUP_PICKS, {}), {})
  assert.equal(placedPickIdIn(GROUP_PICKS, {}), null)
})

test("a $0 amount is a wager, not an absent one", () => {
  // validateAmount refuses $0 at the door, so this can't come from the API —
  // but `if (amount)` instead of `!= null` would drop a real row silently, and
  // a dropped row is a wager with no remove control. Same class as the bug.
  assert.deepEqual(scopePlacements(GROUP_PICKS, { "pick-arand": 0 }), {
    "pick-arand": 0,
  })
  assert.equal(placedPickIdIn(GROUP_PICKS, { "pick-arand": 0 }), "pick-arand")
})

test("a multi-pick bet keeps every wager, and answers in pick order", () => {
  // Top Finisher allows several. Scoping must not thin them, and the "placed"
  // answer must follow the card's own order so it can't flip between renders.
  const multi = { "pick-arand": 2, "pick-kipping": 6 }
  assert.deepEqual(scopePlacements(GROUP_PICKS, multi), multi)
  assert.equal(placedPickIdIn(GROUP_PICKS, multi), "pick-kipping")
})
