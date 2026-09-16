// Unit tests for lib/my-bets.ts — the pure half of the /my-bets page:
// row normalization, phase grouping, the per-phase rules model and the
// per-phase compliance banners (Sprint 30 / ADR 0002). Zero-dependency by
// design: node:test via npm run test.

import test from "node:test"
import assert from "node:assert/strict"
import {
  buildComplianceSummary,
  buildRulesModel,
  enteredPhases,
  entryPayout,
  entryRefund,
  groupByPhase,
  normalizeMyBets,
  payoutSummary,
  picksLine,
  standingHeadline,
  toBettor,
  type MyBetEntry,
  type MyBetsQueryRow,
} from "./my-bets.ts"
import { phaseStanding, type Bettor, type TournamentRules } from "./validation.ts"

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
  result?: string
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
    result: overrides.result ?? "pending",
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
    bet_picks: {
      label: "Jake",
      sheet_pick_id: 1,
      player_user_id: null,
      result: "pending",
      bets: null,
    },
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

test("groupByPhase skips phases with no placements", () => {
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
// Entries feed validation's §8.1 standing directly — the compliance numbers
// come from the same rows the page renders.
// ---------------------------------------------------------------------------

const RULES: TournamentRules = {
  entry_fee_min: 20,
  entry_fee_max: 50,
  min_picks_per_phase: 5,
  max_single_bet: 10,
  max_self_bet_pct: 0.25,
}

test("MyBetEntry rows satisfy the phase standing structurally", () => {
  const entries: MyBetEntry[] = normalizeMyBets(
    [
      row({ pick_id: "p-1", amount: 10, phase: 1 }),
      row({ pick_id: "p-2", amount: 13, phase: 1, sheet_pick_id: 2 }),
    ],
    T
  )
  const standing = phaseStanding(entries, 40, 1, RULES)
  assert.equal(standing.wagered, 23)
  assert.equal(standing.pick_count, 2)
  assert.equal(standing.meets_pick_minimum, false)
  assert.equal(standing.refund, 17)
})

test("picksLine shows only phases bet in, with singular/plural", () => {
  assert.equal(picksLine([]), "No picks yet")
  assert.equal(picksLine([{ phase: 1 }, { phase: 1 }]), "Phase 1: 2 picks")
  assert.equal(picksLine([{ phase: 2 }]), "Phase 2: 1 pick")
  assert.equal(
    picksLine([{ phase: 1 }, { phase: 2 }, { phase: 1 }]),
    "Phase 1: 2 picks · Phase 2: 1 pick"
  )
})

// ---------------------------------------------------------------------------
// toBettor / enteredPhases — the participant row, coerced once
// ---------------------------------------------------------------------------

test("toBettor coerces PostgREST strings and reads NULL as not entered", () => {
  const b = toBettor("me", {
    phase1_entry_fee: "40" as unknown as number,
    phase2_entry_fee: null,
    is_player: true,
  })
  assert.deepEqual(b, { user_id: "me", is_player: true, phase1_entry_fee: 40, phase2_entry_fee: null })
  assert.deepEqual(enteredPhases(b), [{ phase: 1, entry: 40 }])
  assert.deepEqual(
    enteredPhases(toBettor("me", { phase1_entry_fee: null, phase2_entry_fee: null, is_player: true })),
    []
  )
})

// ---------------------------------------------------------------------------
// buildRulesModel — the personalized rules card's numbers, per phase
// ---------------------------------------------------------------------------

const ME: Bettor = { user_id: "me", is_player: true, phase1_entry_fee: 25, phase2_entry_fee: 50 }

test("buildRulesModel derives the self cap per phase via the validation helper (floored, uncapped)", () => {
  assert.deepEqual(buildRulesModel(ME, RULES), {
    max_single_bet: 10,
    min_picks_per_phase: 5,
    phases: [
      { phase: 1, entry_fee: 25, max_self_bet: 6 }, // floor(6.25)
      { phase: 2, entry_fee: 50, max_self_bet: 12 }, // floor(12.5), no $10 cap any more
    ],
  })
})

test("buildRulesModel lists only the phases the bettor is in", () => {
  const model = buildRulesModel({ ...ME, phase2_entry_fee: null }, RULES)
  assert.deepEqual(model.phases.map((p) => p.phase), [1])
})

test("buildRulesModel exempts non-players from the self-bet cap (Q14)", () => {
  const model = buildRulesModel({ ...ME, is_player: false }, RULES)
  assert.deepEqual(model.phases.map((p) => p.max_self_bet), [null, null])
  assert.equal(model.max_single_bet, 10)
})

// ---------------------------------------------------------------------------
// buildComplianceSummary — banners assembled from the per-phase standing
// ---------------------------------------------------------------------------

function placement(phase: 1 | 2, amount: number, n: number, player: string | null = null) {
  return {
    pick_id: `p-${phase}-${n}`,
    bet_id: `b-${phase}-${n}`,
    phase,
    amount,
    pick_player_user_id: player,
  }
}

const FORTY: Bettor = { user_id: "me", is_player: true, phase1_entry_fee: 40, phase2_entry_fee: null }

test("compliance: entered and nothing placed says what it will cost, as warnings", () => {
  // The zero-wager blind spot (Sept 2, 2026), now with real money behind it:
  // under two pots the first $20 of an entry forfeits at this phase's close.
  const items = buildComplianceSummary([], FORTY, RULES)
  assert.deepEqual(
    items.map((i) => [i.tone, i.title]),
    [
      ["warning", "Not enough picks in Phase 1"],
      ["warning", "Money on the table in Phase 1"],
    ]
  )
  assert.equal(items[0].message, "5 more picks needed in Phase 1 (0 of 5).")
  assert.match(items[1].message, /\$20 forfeits to the Phase 1 pot/)
  assert.ok(items.every((i) => i.phase === 1))
})

test("compliance: not entered anywhere yields nothing — that is the entry request's job", () => {
  assert.deepEqual(
    buildComplianceSummary([], { ...FORTY, phase1_entry_fee: null }, RULES),
    []
  )
})

test("compliance: under the minimum picks warns with validation's message verbatim", () => {
  const existing = [placement(1, 20, 1), placement(1, 20, 2)]
  const items = buildComplianceSummary(existing, FORTY, RULES)
  assert.deepEqual(
    items.map((i) => [i.tone, i.title]),
    [["warning", "Not enough picks in Phase 1"]]
  )
  assert.equal(items[0].message, "3 more picks needed in Phase 1 (2 of 5).")
})

test("compliance: over $20 but under the entry is money coming back — info, not a warning", () => {
  const existing = [1, 2, 3, 4, 5].map((n) => placement(1, 5, n))
  const items = buildComplianceSummary(existing, FORTY, RULES)
  assert.deepEqual(
    items.map((i) => [i.tone, i.title]),
    [["info", "Phase 1 refund"]]
  )
  assert.equal(items[0].message, "$15 of your Phase 1 entry comes back unless you wager it.")
})

test("compliance: Pat's example — the self-bet warning names what counts", () => {
  const fifty: Bettor = { ...FORTY, phase1_entry_fee: 50 }
  const existing = [placement(1, 12, 0, "me"), ...[1, 2, 3, 4].map((n) => placement(1, 2, n))]
  const items = buildComplianceSummary(existing, fifty, RULES)
  assert.deepEqual(
    items.map((i) => [i.tone, i.title]),
    [
      ["warning", "Self-bet over the line in Phase 1"],
      ["info", "Phase 1 refund"],
    ]
  )
  assert.equal(
    items[0].message,
    "Only $5 of your $12 on yourself counts until you've wagered $48 in Phase 1."
  )
})

test("compliance: a complete phase yields a single success banner", () => {
  const existing = [1, 2, 3, 4, 5].map((n) => placement(1, 8, n))
  const items = buildComplianceSummary(existing, FORTY, RULES)
  assert.deepEqual(
    items.map((i) => [i.tone, i.title]),
    [["success", "Phase 1 is balanced"]]
  )
})

test("compliance: two entered phases report separately, each tagged with its phase", () => {
  const both: Bettor = { ...FORTY, phase2_entry_fee: 20 }
  const existing = [...[1, 2, 3, 4, 5].map((n) => placement(1, 8, n)), placement(2, 4, 1)]
  const items = buildComplianceSummary(existing, both, RULES)
  assert.deepEqual(
    items.map((i) => [i.phase, i.tone, i.title]),
    [
      [1, "success", "Phase 1 is balanced"],
      [2, "warning", "Not enough picks in Phase 2"],
      [2, "warning", "Money on the table in Phase 2"],
    ]
  )
})

test("compliance: a closed phase is stated in the past tense, once, as info", () => {
  // Nothing they can do about it now; telling someone to go place bets on
  // results night is worse than silence. What happened is still worth a line.
  const existing = [placement(1, 6, 1), placement(1, 6, 2)]
  const items = buildComplianceSummary(existing, FORTY, RULES, { closed: { 1: true } })
  assert.deepEqual(items.map((i) => [i.tone, i.title]), [["info", "Phase 1 is closed"]])
  assert.equal(
    items[0].message,
    "You wagered $12 of your $40 with 2 picks — $8 forfeited to the pot, $20 comes back to you."
  )
})

test("compliance: a closed complete phase is locked in", () => {
  const existing = [1, 2, 3, 4, 5].map((n) => placement(1, 8, n))
  const items = buildComplianceSummary(existing, FORTY, RULES, { closed: { 1: true } })
  assert.deepEqual(items.map((i) => [i.tone, i.title]), [["success", "Phase 1 is locked in"]])
})

// ---------------------------------------------------------------------------
// Payouts on My Bets — theoretical per resolved entry, voids as refunds
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// standingHeadline — the /bets slip bar's one line about the current phase
// ---------------------------------------------------------------------------

function standingOf(
  existing: ReturnType<typeof placement>[],
  bettor: Bettor = FORTY,
  phase: 1 | 2 = 1
) {
  const entry = phase === 1 ? bettor.phase1_entry_fee : bettor.phase2_entry_fee
  return phaseStanding(existing, entry ?? 0, phase, RULES, {
    is_player: bettor.is_player,
    bettor_user_id: bettor.user_id,
  })
}

test("standingHeadline: nothing placed keeps the sentence an E2E journey pins", () => {
  assert.deepEqual(standingHeadline(standingOf([])), {
    tone: "warning",
    text: "No picks placed yet",
  })
})

test("standingHeadline: leads with the pick shortfall, counted from the rules", () => {
  const two = standingOf([placement(1, 20, 1), placement(1, 20, 2)])
  assert.deepEqual(standingHeadline(two), { tone: "warning", text: "3 more picks needed" })
  const four = standingOf([1, 2, 3, 4].map((n) => placement(1, 10, n)))
  assert.deepEqual(standingHeadline(four), { tone: "warning", text: "1 more pick needed" })
})

test("standingHeadline: the forfeit, then the refund, then balanced", () => {
  // $15 on five picks of a $40 entry: under the $20 floor, so $5 forfeits —
  // and that outranks the $20 that comes back.
  const under = standingOf([1, 2, 3, 4, 5].map((n) => placement(1, 3, n)))
  assert.deepEqual(standingHeadline(under), {
    tone: "warning",
    text: "$5 forfeits unless you wager it",
  })
  // $25 on five picks: nothing forfeits, $15 comes back — info, not a warning.
  const refund = standingOf([1, 2, 3, 4, 5].map((n) => placement(1, 5, n)))
  assert.deepEqual(standingHeadline(refund), {
    tone: "info",
    text: "$15 comes back unless you wager it",
  })
  const done = standingOf([1, 2, 3, 4, 5].map((n) => placement(1, 8, n)))
  assert.deepEqual(standingHeadline(done), { tone: "success", text: "Phase 1 balanced" })
})

test("standingHeadline: Pat's example leads with the self-bet line", () => {
  const fifty: Bettor = { ...FORTY, phase1_entry_fee: 50 }
  const s = standingOf(
    [placement(1, 12, 0, "me"), ...[1, 2, 3, 4].map((n) => placement(1, 2, n))],
    fifty
  )
  assert.deepEqual(standingHeadline(s), {
    tone: "warning",
    text: "Only $5 of $12 on yourself counts",
  })
})

test("normalizeMyBets carries the pick's result (unknown strings → pending)", () => {
  const [hit] = normalizeMyBets([row({ pick_id: "p-1", amount: 5, result: "hit" })], T)
  assert.equal(hit.result, "hit")
  const [bad] = normalizeMyBets([row({ pick_id: "p-2", amount: 5, result: "won" })], T)
  assert.equal(bad.result, "pending")
})

test("entryPayout computes from the odds snapshot per result", () => {
  const entries = normalizeMyBets(
    [
      row({ pick_id: "hit", amount: 5, odds: 110, result: "hit" }),
      row({ pick_id: "push", amount: 3, odds: 200, result: "push", sheet_pick_id: 2 }),
      row({ pick_id: "void", amount: 7, odds: 300, result: "void", sheet_pick_id: 3 }),
      row({ pick_id: "open", amount: 2, odds: 100, result: "pending", sheet_pick_id: 4 }),
    ],
    T
  )
  const byPick = Object.fromEntries(entries.map((e) => [e.pick_id, e]))
  assert.equal(entryPayout(byPick["hit"]), 10.5)
  assert.equal(entryPayout(byPick["push"]), 3)
  assert.equal(entryPayout(byPick["void"]), 0)
  assert.equal(entryRefund(byPick["void"]), 7)
  assert.equal(entryPayout(byPick["open"]), null)
})

test("payoutSummary: pushes count, voids show as refunded, pendings counted", () => {
  const entries = normalizeMyBets(
    [
      row({ pick_id: "hit", amount: 5, odds: 110, result: "hit" }),
      row({ pick_id: "push", amount: 3, odds: 200, result: "push", sheet_pick_id: 2 }),
      row({ pick_id: "void", amount: 7, odds: 300, result: "void", sheet_pick_id: 3 }),
      row({ pick_id: "miss", amount: 6, odds: -150, result: "miss", sheet_pick_id: 4 }),
      row({ pick_id: "open", amount: 2, odds: 100, result: "pending", sheet_pick_id: 5 }),
    ],
    T
  )
  assert.deepEqual(payoutSummary(entries), {
    theoretical: 13.5, // 10.50 hit + 3 push + 0 void + 0 miss
    refunded: 7,
    pending: 1,
  })
})

// ---------------------------------------------------------------------------
// `only` — the current-phase filter (PRD §12 A27)
// ---------------------------------------------------------------------------

test("compliance: `only` reports the current phase and says nothing about the other", () => {
  const both: Bettor = { ...FORTY, phase2_entry_fee: 20 }
  const existing = [...[1, 2, 3, 4, 5].map((n) => placement(1, 8, n)), placement(2, 4, 1)]
  // Without it, a Phase 2 entry is warned about all the way through Phase 1 —
  // money the member cannot act on, because Phase 2 isn't published.
  const p1 = buildComplianceSummary(existing, both, RULES, { only: 1 })
  assert.deepEqual(
    p1.map((i) => [i.phase, i.tone, i.title]),
    [[1, "success", "Phase 1 is balanced"]]
  )
  const p2 = buildComplianceSummary(existing, both, RULES, { only: 2 })
  assert.equal(
    p2.every((i) => i.phase === 2),
    true
  )
  assert.equal(p2.length > 0, true)
})

test("compliance: `only` still gives the current phase its past-tense line when closed", () => {
  const existing = [1, 2, 3, 4, 5].map((n) => placement(1, 3, n))
  const items = buildComplianceSummary(existing, FORTY, RULES, {
    closed: { 1: true },
    only: 1,
  })
  assert.deepEqual(
    items.map((i) => [i.phase, i.tone, i.title]),
    [[1, "info", "Phase 1 is closed"]]
  )
})

test("compliance: `only` on a phase the bettor isn't in yields nothing", () => {
  // FORTY has no Phase 2 entry. Callers asking "has money arrived at all"
  // must therefore ask WITHOUT `only` — see enteredPhases' doc comment.
  assert.deepEqual(buildComplianceSummary([], FORTY, RULES, { only: 2 }), [])
})

test("enteredPhases: `only` narrows, and can be empty for someone who has paid", () => {
  const both: Bettor = { ...FORTY, phase2_entry_fee: 20 }
  assert.deepEqual(enteredPhases(both), [
    { phase: 1, entry: 40 },
    { phase: 2, entry: 20 },
  ])
  assert.deepEqual(enteredPhases(both, 2), [{ phase: 2, entry: 20 }])
  assert.deepEqual(enteredPhases(FORTY, 2), [])
})

test("buildRulesModel: `only` lists the current phase's rows alone", () => {
  const model = buildRulesModel(ME, RULES, 2)
  assert.deepEqual(
    model.phases.map((p) => p.phase),
    [2]
  )
  // The flat rules are unchanged — they are the same in every phase.
  assert.equal(model.max_single_bet, RULES.max_single_bet)
  assert.equal(model.min_picks_per_phase, RULES.min_picks_per_phase)
})
