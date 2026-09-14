// Unit tests for lib/payouts.ts — the pari-mutuel math (PRD §5, per phase
// since Sprint 30 / ADR 0002): the theoretical-payout mirror of
// placement_payouts_view, aggregation, each phase's pot, the proportional
// split, and the combined sum. Zero-dependency by design: node:test via
// npm run test.
//
// The SQL side of the same math is proven against real Postgres by
// scripts/payout-view-roundtrip.ts; the expected values here are hand-
// computed, so the two suites anchor to the same numbers independently.

import test from "node:test"
import assert from "node:assert/strict"
import {
  actualShare,
  aggregatePayouts,
  buildCombinedResults,
  buildPhaseResults,
  buildResultsTables,
  cashReturned,
  finalizeReadiness,
  normalizePayoutRows,
  refundedStake,
  roundCents,
  theoreticalPayout,
  type PayoutRow,
  type PayoutViewQueryRow,
  type ResultsParticipant,
  type ResultsTable,
} from "./payouts.ts"
import type { TournamentRules } from "./validation.ts"

const RULES: TournamentRules = {
  entry_fee_min: 20,
  entry_fee_max: 50,
  min_picks_per_phase: 5,
  max_single_bet: 10,
  max_self_bet_pct: 0.25,
}

// ---------------------------------------------------------------------------
// theoreticalPayout — the view's CASE, mirrored
// ---------------------------------------------------------------------------

test("hit at positive odds pays stake plus stake×odds/100", () => {
  assert.equal(theoreticalPayout(5, 110, "hit"), 10.5)
  assert.equal(theoreticalPayout(10, 400, "hit"), 50)
})

test("hit at negative odds pays stake plus stake×100/|odds|", () => {
  assert.equal(roundCents(theoreticalPayout(4, -120, "hit")!), 7.33)
  assert.equal(theoreticalPayout(13, -130, "hit"), 23)
})

test("push returns the stake inside the math (Q6, kept by ADR 0001 §9)", () => {
  assert.equal(theoreticalPayout(8, 250, "push"), 8)
  assert.equal(theoreticalPayout(8, -180, "push"), 8)
})

test("miss and void both pay 0 theoretical", () => {
  assert.equal(theoreticalPayout(6, 150, "miss"), 0)
  assert.equal(theoreticalPayout(7, 300, "void"), 0)
})

test("pending is null — not yet resolved, never a number", () => {
  assert.equal(theoreticalPayout(5, 110, "pending"), null)
})

test("zero odds (invalid per §3.6) fall through to null like the SQL CASE", () => {
  assert.equal(theoreticalPayout(5, 0, "hit"), null)
})

test("refundedStake surfaces the stake only on void", () => {
  assert.equal(refundedStake(7, "void"), 7)
  assert.equal(refundedStake(7, "push"), 0)
  assert.equal(refundedStake(7, "miss"), 0)
  assert.equal(refundedStake(7, "hit"), 0)
  assert.equal(refundedStake(7, "pending"), 0)
})

// ---------------------------------------------------------------------------
// aggregatePayouts / actualShare
// ---------------------------------------------------------------------------

test("aggregate sums resolved theoreticals, counts pendings, sums refunds", () => {
  const totals = aggregatePayouts([
    { theoretical: 10.5, refunded: 0 },
    { theoretical: 0, refunded: 7 }, // a void
    { theoretical: 3, refunded: 0 }, // a push
    { theoretical: null, refunded: 0 }, // pending
  ])
  assert.deepEqual(totals, { theoretical: 13.5, refunded: 7, pending: 1 })
})

test("aggregate of no rows is all zeros", () => {
  assert.deepEqual(aggregatePayouts([]), {
    theoretical: 0,
    refunded: 0,
    pending: 0,
  })
})

test("actualShare is the proportional split", () => {
  assert.equal(actualShare(25, 100, 520), 130)
})

test("a zero theoretical sum hands out no shares (no division by zero)", () => {
  assert.equal(actualShare(0, 0, 520), 0)
})

// ---------------------------------------------------------------------------
// normalizePayoutRows — PostgREST numerics may arrive as strings
// ---------------------------------------------------------------------------

test("view rows coerce string numerics, the phase and the self flag; keep null pending payouts", () => {
  const rows: PayoutViewQueryRow[] = [
    {
      placement_id: "pl-1",
      user_id: "u-1",
      amount: "5",
      result: "hit",
      theoretical_payout: "10.50",
      refunded_stake: "0",
      phase: "1",
      is_self_pick: "t",
    },
    {
      placement_id: "pl-2",
      user_id: "u-1",
      amount: 2,
      result: "pending",
      theoretical_payout: null,
      refunded_stake: 0,
      phase: 2,
      is_self_pick: false,
    },
  ]
  assert.deepEqual(normalizePayoutRows(rows), [
    {
      placement_id: "pl-1",
      user_id: "u-1",
      amount: 5,
      result: "hit",
      theoretical: 10.5,
      refunded: 0,
      phase: 1,
      is_self_pick: true,
    },
    {
      placement_id: "pl-2",
      user_id: "u-1",
      amount: 2,
      result: "pending",
      theoretical: null,
      refunded: 0,
      phase: 2,
      is_self_pick: false,
    },
  ])
})

test("a row with an impossible phase is dropped rather than potted somewhere", () => {
  const rows = normalizePayoutRows([
    {
      placement_id: "pl-3",
      user_id: "u-1",
      amount: 2,
      result: "hit",
      theoretical_payout: 4,
      refunded_stake: 0,
      phase: 3,
      is_self_pick: null,
    },
  ])
  assert.deepEqual(rows, [])
})

// ---------------------------------------------------------------------------
// buildPhaseResults — one phase's pot
// ---------------------------------------------------------------------------

function participant(
  user_id: string,
  display_name: string,
  entries: { p1?: number | null; p2?: number | null; player?: boolean } = {}
): ResultsParticipant {
  return {
    user_id,
    display_name,
    is_player: entries.player ?? true,
    phase1_entry_fee: entries.p1 ?? null,
    phase2_entry_fee: entries.p2 ?? null,
  }
}

let seq = 0
function row(
  user_id: string,
  amount: number,
  theoretical: number | null,
  options: { refunded?: number; phase?: 1 | 2; self?: boolean; result?: string } = {}
): PayoutRow {
  seq += 1
  const refunded = options.refunded ?? 0
  return {
    placement_id: `pl-${seq}`,
    user_id,
    amount,
    result:
      options.result ??
      (theoretical === null ? "pending" : refunded > 0 ? "void" : theoretical === 0 ? "miss" : "hit"),
    theoretical,
    refunded,
    phase: options.phase ?? 1,
    is_self_pick: options.self ?? false,
  }
}

/** The three identities every table must satisfy. */
function assertIdentities(table: ResultsTable) {
  const sumEntries = table.rows.reduce((s, r) => s + r.entry_fee, 0)
  const sumRefunded = table.rows.reduce((s, r) => s + r.refunded, 0)
  const sumUnwagered = table.rows.reduce((s, r) => s + r.refund_unwagered, 0)
  assert.ok(
    Math.abs(sumEntries - (table.pool + sumRefunded + sumUnwagered)) < 1e-9,
    `Σ entries ${sumEntries} ≠ pool ${table.pool} + refunds ${sumRefunded} + unwagered ${sumUnwagered}`
  )
  assert.equal(table.entries, sumEntries)
  if (table.sum_theoretical > 0) {
    const paid = table.rows.reduce((s, r) => s + r.actual, 0)
    assert.ok(Math.abs(paid - table.pool) < 1e-9, `Σ actual ${paid} ≠ pool ${table.pool}`)
  }
  for (const r of table.rows) {
    assert.ok(
      Math.abs(r.entry_fee + r.profit_loss - cashReturned(r)) < 1e-9,
      `${r.display_name}: entry + P/L ≠ cash`
    )
  }
}

test("participants with no placements fund the pot with the minimum and get the rest back", () => {
  // Ann: $40 entered, one $5 wager that hit for $35 → W = 5, so $20 funds the
  // pot ($15 with no wager behind it) and $20 comes back. Bo: $30 entered,
  // nothing placed → $20 forfeits, $10 back.
  const table = buildPhaseResults(
    1,
    [participant("a", "Ann", { p1: 40 }), participant("b", "Bo", { p1: 30 })],
    [row("a", 5, 35)],
    RULES
  )
  assert.equal(table.scope, 1)
  assert.equal(table.pool, 40)
  assert.equal(table.entries, 70)
  assert.equal(table.sum_theoretical, 35)

  const ann = table.rows.find((r) => r.user_id === "a")!
  assert.equal(ann.wagered, 5)
  assert.equal(ann.committed, 20)
  assert.equal(ann.forfeit_unwagered, 15)
  assert.equal(ann.refund_unwagered, 20)
  assert.equal(ann.actual, 40) // sole theoretical holder takes the whole pot
  assert.equal(cashReturned(ann), 60)
  assert.equal(ann.profit_loss, 20)

  const bo = table.rows.find((r) => r.user_id === "b")!
  assert.equal(bo.committed, 20)
  assert.equal(bo.forfeit_unwagered, 20)
  assert.equal(bo.refund_unwagered, 10)
  assert.equal(bo.actual, 0)
  assert.equal(bo.profit_loss, -20)
  assertIdentities(table)
})

test("rows sort biggest actual payout first, ties by name", () => {
  const table = buildPhaseResults(
    1,
    [
      participant("c", "Cy", { p1: 20 }),
      participant("a", "Ann", { p1: 20 }),
      participant("b", "Bo", { p1: 20 }),
    ],
    [row("b", 20, 10), row("c", 20, 40)],
    RULES
  )
  assert.deepEqual(
    table.rows.map((r) => r.display_name),
    ["Cy", "Bo", "Ann"]
  )
})

test("the other phase's wagers and entries never touch this pot", () => {
  const table = buildPhaseResults(
    1,
    [participant("a", "Ann", { p1: 20, p2: 50 })],
    [row("a", 20, 30), row("a", 50, 500, { phase: 2 })],
    RULES
  )
  assert.equal(table.entries, 20)
  assert.equal(table.pool, 20)
  assert.equal(table.sum_theoretical, 30)
  assert.equal(table.rows[0].wagered, 20)
})

// ---------------------------------------------------------------------------
// Pat's example, and the rest of ADR 0002's money
// ---------------------------------------------------------------------------

test("Pat's example: $50 entered, $20 wagered, $12 on yourself → $5 of it counts, $7 stays in the pot, $30 back", () => {
  // Fred's $12 self pick hit at +100 (theoretical 24); the other $8 missed.
  // Casey wagered her whole $20 and hit for $30.
  const table = buildPhaseResults(
    1,
    [participant("f", "Fred", { p1: 50 }), participant("c", "Casey", { p1: 20 })],
    [
      row("f", 12, 24, { self: true }),
      row("f", 2, 0),
      row("f", 2, 0),
      row("f", 2, 0),
      row("f", 2, 0),
      row("c", 20, 30),
    ],
    RULES
  )
  const fred = table.rows.find((r) => r.user_id === "f")!
  assert.equal(fred.wagered, 20)
  assert.equal(fred.forfeit_self, 7)
  assert.equal(fred.refund_unwagered, 30)
  // Recognised theoretical is the row's 24 scaled by 5/12 = 10.
  assert.equal(roundCents(fred.theoretical), 10)
  // Pot: Fred committed 20 + Casey 20 = 40; Σ theo = 10 + 30 = 40.
  assert.equal(table.pool, 40)
  assert.equal(roundCents(table.sum_theoretical), 40)
  assert.equal(roundCents(fred.actual), 10)
  assert.equal(roundCents(cashReturned(fred)), 40) // 10 share + 30 back
  assert.equal(roundCents(fred.profit_loss), -10)
  assertIdentities(table)
})

test("the self share scales every self pick pro-rata, and only self picks", () => {
  // $40 entered, $20 wagered: cap that counts = 5. Two self picks, $6 and $4
  // (S = 10, k = 0.5), plus $10 on somebody else — untouched.
  const table = buildPhaseResults(
    1,
    [participant("a", "Ann", { p1: 40 })],
    [
      row("a", 6, 12, { self: true }),
      row("a", 4, 8, { self: true }),
      row("a", 10, 20),
    ],
    RULES
  )
  const ann = table.rows[0]
  assert.equal(ann.forfeit_self, 5)
  assert.equal(ann.theoretical, 6 + 4 + 20) // 12×0.5 + 8×0.5 + 20
})

test("a void on a scaled self pick refunds amount × k — the forfeit is fixed at close", () => {
  // Same shape as Pat's example, but the $12 self pick was voided. $5 of the
  // stake comes back; the $7 forfeited for under-wagering stays in the pot.
  const table = buildPhaseResults(
    1,
    [participant("f", "Fred", { p1: 50 }), participant("c", "Casey", { p1: 20 })],
    [
      row("f", 12, 0, { self: true, refunded: 12 }),
      row("f", 8, 0),
      row("c", 20, 30),
    ],
    RULES
  )
  const fred = table.rows.find((r) => r.user_id === "f")!
  assert.equal(fred.refunded, 5)
  assert.equal(fred.forfeit_self, 7)
  // Pot = 20 + 20 committed − 5 refunded = 35, all of it Casey's.
  assert.equal(table.pool, 35)
  assert.equal(cashReturned(fred), 5 + 30)
  assertIdentities(table)
})

test("a non-player's picks are never scaled, however they are linked (A15)", () => {
  const table = buildPhaseResults(
    1,
    [participant("n", "Non Player", { p1: 50, player: false })],
    [row("n", 12, 24, { self: true }), row("n", 8, 0)],
    RULES
  )
  assert.equal(table.rows[0].forfeit_self, 0)
  assert.equal(table.rows[0].theoretical, 24)
})

test("entered and never wagered: the first $20 is in the pot, the rest comes back", () => {
  const table = buildPhaseResults(
    1,
    [participant("s", "Steve", { p1: 50 }), participant("a", "Ann", { p1: 20 })],
    [row("a", 20, 30)],
    RULES
  )
  const steve = table.rows.find((r) => r.user_id === "s")!
  assert.equal(steve.committed, 20)
  assert.equal(steve.forfeit_unwagered, 20)
  assert.equal(steve.refund_unwagered, 30)
  assert.equal(steve.profit_loss, -20)
  assert.equal(table.pool, 40)
  assertIdentities(table)
})

test("pending placements are counted, not summed into anyone's theoretical", () => {
  const table = buildPhaseResults(
    1,
    [participant("a", "Ann", { p1: 40 })],
    [row("a", 20, 12), row("a", 20, null)],
    RULES
  )
  assert.equal(table.pending, 1)
  assert.equal(table.rows[0].theoretical, 12)
  assert.equal(table.rows[0].pending, 1)
})

test("a pot nobody has a theoretical in hands out nothing — Σ actual is 0, not the pot", () => {
  const table = buildPhaseResults(
    1,
    [participant("a", "Ann", { p1: 20 }), participant("b", "Bo", { p1: 20 })],
    [row("a", 20, 0), row("b", 20, 0)],
    RULES
  )
  assert.equal(table.pool, 40)
  assert.equal(table.sum_theoretical, 0)
  assert.ok(table.rows.every((r) => r.actual === 0))
})

// ---------------------------------------------------------------------------
// Who is in the pot — revoked bettors and bettors with no entry for the phase
// ---------------------------------------------------------------------------

test("a revoked bettor's wagers leave the pot with their entry, and are counted as dropped", () => {
  const rows = [row("a", 20, 30), row("b", 20, 10), row("c", 20, 60)]
  const withThem = buildPhaseResults(
    1,
    [
      participant("a", "Ann", { p1: 20 }),
      participant("b", "Bo", { p1: 20 }),
      participant("c", "Cy", { p1: 20 }),
    ],
    rows,
    RULES
  )
  const revoked = buildPhaseResults(
    1,
    [participant("a", "Ann", { p1: 20 }), participant("b", "Bo", { p1: 20 })],
    rows,
    RULES
  )
  assert.equal(withThem.pool, 60)
  assert.equal(revoked.pool, 40)
  assert.equal(withThem.sum_theoretical, 100)
  assert.equal(revoked.sum_theoretical, 40)
  assert.equal(revoked.rows.find((r) => r.user_id === "c"), undefined)
  assert.equal(revoked.dropped_placements, 1)
  assertIdentities(revoked)
  assertIdentities(withThem)
})

test("a bettor with no entry for the phase is out of that pot, wagers and all", () => {
  // Cy is in Phase 2 only; a Phase 1 row of theirs (a hand edit) is dropped.
  const table = buildPhaseResults(
    1,
    [participant("a", "Ann", { p1: 20 }), participant("c", "Cy", { p2: 20 })],
    [row("a", 20, 30), row("c", 20, 60)],
    RULES
  )
  assert.deepEqual(table.rows.map((r) => r.user_id), ["a"])
  assert.equal(table.dropped_placements, 1)
  assert.equal(table.pool, 20)
})

// ---------------------------------------------------------------------------
// The 2026 worked example (PRD §5), as a single-phase pot
// ---------------------------------------------------------------------------

// 13 participants at $40 = the $520 pool (no voids in 2026). Jake Kohne's
// theoretical is $21.87; everyone's sums to $279.57. Every entry was wagered
// in full, so nothing is forfeited or refunded and the pot is the entry sum.
const POOL_2026 = [
  ["Jake Kohne", 21.87],
  ["P2", 50.0],
  ["P3", 43.2],
  ["P4", 35.1],
  ["P5", 30.0],
  ["P6", 25.87],
  ["P7", 22.53],
  ["P8", 18.0],
  ["P9", 15.0],
  ["P10", 10.0],
  ["P11", 5.0],
  ["P12", 3.0],
  ["P13", 0],
] as const

function table2026(extraRows: PayoutRow[] = []) {
  const participants = POOL_2026.map(([name]) => participant(name, name, { p1: 40 }))
  const rows = POOL_2026.map(([name, theo]) => row(name, 40, theo))
  return buildPhaseResults(1, participants, [...rows, ...extraRows], RULES)
}

test("2026 worked example: pool $520, sum $279.57, Jake $21.87 → his share of $520", () => {
  const table = table2026()
  assert.equal(table.pool, 520)
  assert.equal(roundCents(table.sum_theoretical), 279.57)

  const jake = table.rows.find((r) => r.user_id === "Jake Kohne")!
  // The exact quotient of the PRD's published two-decimal inputs is
  // 21.87 / 279.57 × 520 = 40.6782…, which displays as $40.68 under the
  // app's (normal, round-half-up) cent rounding. PRD §5 prints $40.67 —
  // the spreadsheet's fuller-precision (or truncated) figure; flagged as
  // doc drift for Pat rather than bending the math to hit it.
  assert.ok(Math.abs(jake.actual - (21.87 / 279.57) * 520) < 1e-9)
  assert.equal(roundCents(jake.actual), 40.68)
  assertIdentities(table)
})

test("void case: the pot shrinks by exactly the voided stakes", () => {
  // P13's $40 was a $28 miss and a $12 void; P12's a $35 hit and a $5 void.
  const participants = POOL_2026.map(([name]) => participant(name, name, { p1: 40 }))
  const rows = POOL_2026.filter(([name]) => name !== "P13" && name !== "P12").map(([name, theo]) =>
    row(name, 40, theo)
  )
  rows.push(row("P13", 28, 0), row("P13", 12, 0, { refunded: 12 }))
  rows.push(row("P12", 35, 3.0), row("P12", 5, 0, { refunded: 5 }))
  const table = buildPhaseResults(1, participants, rows, RULES)
  assert.equal(table.pool, 520 - 17)
  assert.equal(roundCents(table.sum_theoretical), 279.57)

  const p13 = table.rows.find((r) => r.user_id === "P13")!
  assert.equal(p13.actual, 0)
  assert.equal(p13.refunded, 12)
  assert.equal(p13.profit_loss, 0 + 12 - 40)

  const jake = table.rows.find((r) => r.user_id === "Jake Kohne")!
  assert.ok(Math.abs(jake.actual - (21.87 / table.sum_theoretical) * 503) < 1e-9)
  assertIdentities(table)
})

// ---------------------------------------------------------------------------
// Combined — the per-person sum, never a combined split
// ---------------------------------------------------------------------------

test("combined adds each person's two phase rows; a one-phase bettor carries that phase only", () => {
  const participants = [
    participant("a", "Ann", { p1: 20, p2: 20 }),
    participant("b", "Bo", { p1: 20 }),
    participant("c", "Cy", { p2: 50 }),
  ]
  const rows = [
    row("a", 20, 30, { phase: 1 }),
    row("b", 20, 10, { phase: 1 }),
    row("a", 20, 0, { phase: 2 }),
    row("c", 50, 100, { phase: 2 }),
  ]
  const tables = buildResultsTables(participants, rows, RULES)
  const one = tables[1]
  const two = tables[2]
  const combined = tables.combined

  // Phase 1: pot 40, Σ theo 40 → Ann 30, Bo 10. Phase 2: pot 70, all Cy's.
  assert.equal(one.pool, 40)
  assert.equal(two.pool, 70)
  assert.equal(combined.scope, "combined")
  assert.equal(combined.pool, 110)
  assert.equal(combined.entries, 110)

  const ann = combined.rows.find((r) => r.user_id === "a")!
  assert.equal(ann.entry_fee, 40)
  assert.equal(ann.actual, 30)
  assert.equal(ann.profit_loss, 30 - 40)
  const cy = combined.rows.find((r) => r.user_id === "c")!
  assert.equal(cy.entry_fee, 50)
  assert.equal(cy.actual, 70)
  const bo = combined.rows.find((r) => r.user_id === "b")!
  assert.equal(bo.entry_fee, 20)
  assert.equal(bo.actual, 10)

  // Not a combined split: Cy's 100 theoretical against a 110 pot would be
  // 78.57 if the pots were merged. It is 70 — Phase 2's pot, whole.
  assert.notEqual(roundCents(cy.actual), 78.57)
  assertIdentities(combined)
  assert.deepEqual(
    combined.rows.map((r) => r.display_name),
    ["Cy", "Ann", "Bo"]
  )
})

test("buildCombinedResults sums pending and dropped counts too", () => {
  const p1 = buildPhaseResults(1, [participant("a", "Ann", { p1: 20 })], [row("a", 20, null)], RULES)
  const p2 = buildPhaseResults(2, [participant("a", "Ann", { p1: 20 })], [row("a", 5, 9, { phase: 2 })], RULES)
  const combined = buildCombinedResults(p1, p2)
  assert.equal(combined.pending, 1)
  assert.equal(combined.dropped_placements, 1)
})

// ---------------------------------------------------------------------------
// finalizeReadiness — the guard on the Saturday-night unlock (Sprint 25 / #108)
// ---------------------------------------------------------------------------

test("finalize is allowed once every pick has a verdict and every bet is closed", () => {
  assert.deepEqual(finalizeReadiness({ pendingPicks: 0, unclosedBets: 0 }), {
    ok: true,
    blockers: [],
  })
})

test("finalize is refused while any pick is pending, and says why in money terms", () => {
  const verdict = finalizeReadiness({ pendingPicks: 12, unclosedBets: 0 })
  assert.equal(verdict.ok, false)
  assert.equal(verdict.blockers.length, 1)
  assert.match(verdict.blockers[0], /^12 picks have no result yet\./)
  assert.match(verdict.blockers[0], /split the whole pool across only the settled wagers/)
})

test("one pending pick is enough, and reads as singular", () => {
  const verdict = finalizeReadiness({ pendingPicks: 1, unclosedBets: 0 })
  assert.equal(verdict.ok, false)
  assert.match(verdict.blockers[0], /^1 pick has no result yet\./)
})

test("an unclosed bet blocks finalizing on its own", () => {
  const verdict = finalizeReadiness({ pendingPicks: 0, unclosedBets: 3 })
  assert.equal(verdict.ok, false)
  assert.equal(verdict.blockers.length, 1)
  assert.match(verdict.blockers[0], /3 bets are still open or hidden/)
})

test("both blockers report together, pending picks first", () => {
  const verdict = finalizeReadiness({ pendingPicks: 4, unclosedBets: 2 })
  assert.equal(verdict.blockers.length, 2)
  assert.match(verdict.blockers[0], /no result yet/)
  assert.match(verdict.blockers[1], /still open or hidden/)
})

test("the guard counts PICKS, not placements — a pick nobody bet on still blocks", () => {
  const table = buildPhaseResults(1, [participant("a", "Ann", { p1: 40 })], [row("a", 40, 30)], RULES)
  assert.equal(table.pending, 0, "no pending PLACEMENTS")
  assert.equal(finalizeReadiness({ pendingPicks: 1, unclosedBets: 0 }).ok, false)
})

// ---------------------------------------------------------------------------
// cashReturned — the number two surfaces used to disagree about (#157)
// ---------------------------------------------------------------------------

test("cashReturned is the pot share plus every refund", () => {
  assert.equal(cashReturned({ actual: 10, refunded: 6 }), 16)
  assert.equal(cashReturned({ actual: 10, refunded: 0, refund_unwagered: 30 }), 40)
})

test("every results row reconciles: entry + P/L === cash returned", () => {
  const table = buildPhaseResults(
    1,
    [
      participant("u1", "Voided Vic", { p1: 20 }),
      participant("u2", "Clean Casey", { p1: 20 }),
      participant("u3", "No Wagers Nia", { p1: 50 }),
    ],
    [
      row("u1", 5, 12),
      row("u1", 6, null, { refunded: 6, result: "void" }),
      row("u2", 8, 20),
    ],
    RULES
  )
  for (const r of table.rows) {
    assert.equal(
      roundCents(r.entry_fee + r.profit_loss),
      roundCents(cashReturned(r)),
      `${r.display_name} does not add up across`
    )
  }
})
