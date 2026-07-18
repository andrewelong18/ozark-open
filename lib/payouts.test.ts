// Unit tests for lib/payouts.ts — the pari-mutuel math (PRD §5): the
// theoretical-payout mirror of placement_payouts_view, aggregation, the
// void-adjusted pool, and the proportional split. Zero-dependency by design:
// node:test via npm run test.
//
// The SQL side of the same math is proven against real Postgres by
// scripts/payout-view-roundtrip.ts; the expected values here are hand-
// computed, so the two suites anchor to the same numbers independently.

import test from "node:test"
import assert from "node:assert/strict"
import {
  actualShare,
  aggregatePayouts,
  buildResultsTable,
  normalizePayoutRows,
  poolTotal,
  refundedStake,
  roundCents,
  theoreticalPayout,
  type PayoutViewQueryRow,
} from "./payouts.ts"

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
// aggregatePayouts
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

// ---------------------------------------------------------------------------
// poolTotal / actualShare
// ---------------------------------------------------------------------------

test("pool is the entry-fee sum minus refunded voided stakes", () => {
  assert.equal(poolTotal([40, 40, 20], 0), 100)
  assert.equal(poolTotal([40, 40, 20], 12), 88)
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

test("view rows coerce string numerics and keep null pending payouts", () => {
  const rows: PayoutViewQueryRow[] = [
    {
      placement_id: "pl-1",
      user_id: "u-1",
      amount: "5",
      result: "hit",
      theoretical_payout: "10.50",
      refunded_stake: "0",
    },
    {
      placement_id: "pl-2",
      user_id: "u-1",
      amount: 2,
      result: "pending",
      theoretical_payout: null,
      refunded_stake: 0,
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
    },
    {
      placement_id: "pl-2",
      user_id: "u-1",
      amount: 2,
      result: "pending",
      theoretical: null,
      refunded: 0,
    },
  ])
})

// ---------------------------------------------------------------------------
// buildResultsTable
// ---------------------------------------------------------------------------

function payoutRow(
  user_id: string,
  theoretical: number | null,
  refunded = 0,
  placement_id = `pl-${user_id}-${theoretical}`
) {
  return { placement_id, user_id, amount: 5, result: "hit", theoretical, refunded }
}

test("participants with no placements still fund the pool and get a 0 share", () => {
  const table = buildResultsTable(
    [
      { user_id: "a", display_name: "Ann", entry_fee: 40 },
      { user_id: "b", display_name: "Bo", entry_fee: 30 },
    ],
    [payoutRow("a", 35)]
  )
  assert.equal(table.pool, 70)
  assert.equal(table.sum_theoretical, 35)
  const bo = table.rows.find((r) => r.user_id === "b")!
  assert.equal(bo.actual, 0)
  assert.equal(bo.profit_loss, -30)
})

test("rows sort biggest actual payout first, ties by name", () => {
  const table = buildResultsTable(
    [
      { user_id: "c", display_name: "Cy", entry_fee: 20 },
      { user_id: "a", display_name: "Ann", entry_fee: 20 },
      { user_id: "b", display_name: "Bo", entry_fee: 20 },
    ],
    [payoutRow("b", 10), payoutRow("c", 40)]
  )
  assert.deepEqual(
    table.rows.map((r) => r.display_name),
    ["Cy", "Bo", "Ann"]
  )
})

// ---------------------------------------------------------------------------
// The 2026 worked example (PRD §5) — this sprint's acceptance test
// ---------------------------------------------------------------------------

// 13 participants at $40 = the $520 pool (no voids in 2026). Jake Kohne's
// theoretical is $21.87; everyone's sums to $279.57.
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

function table2026(extraRows: Parameters<typeof buildResultsTable>[1] = []) {
  const participants = POOL_2026.map(([name]) => ({
    user_id: name,
    display_name: name,
    entry_fee: 40,
  }))
  const rows = POOL_2026.filter(([, theo]) => theo > 0).map(([name, theo]) => ({
    placement_id: `pl-${name}`,
    user_id: name,
    amount: 5,
    result: "hit",
    theoretical: theo,
    refunded: 0,
  }))
  return buildResultsTable(participants, [...rows, ...extraRows])
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
  assert.ok(Math.abs(roundCents(jake.actual) - 40.67) <= 0.01)

  // The shares hand the whole pool back out — no house, no rake.
  const paid = table.rows.reduce((sum, r) => sum + r.actual, 0)
  assert.ok(Math.abs(paid - 520) < 1e-9)
})

test("void case: the pool shrinks by exactly the voided stakes", () => {
  const voids = [
    {
      placement_id: "pl-void-1",
      user_id: "P13",
      amount: 12,
      result: "void",
      theoretical: 0,
      refunded: 12,
    },
    {
      placement_id: "pl-void-2",
      user_id: "P12",
      amount: 5,
      result: "void",
      theoretical: 0,
      refunded: 5,
    },
  ]
  const table = table2026(voids)
  assert.equal(table.pool, 520 - 17)
  // Theoretical sum is untouched — voids contribute nothing to it.
  assert.equal(roundCents(table.sum_theoretical), 279.57)

  // The refunded bettor gets the stake back in P/L, not as a payout.
  const p13 = table.rows.find((r) => r.user_id === "P13")!
  assert.equal(p13.actual, 0)
  assert.equal(p13.refunded, 12)
  assert.equal(p13.profit_loss, 0 + 12 - 40)

  // Jake's share is now against the shrunken pool.
  const jake = table.rows.find((r) => r.user_id === "Jake Kohne")!
  assert.ok(Math.abs(jake.actual - (21.87 / table.sum_theoretical) * 503) < 1e-9)

  // Shares still pay out exactly the (void-adjusted) pool.
  const paid = table.rows.reduce((sum, r) => sum + r.actual, 0)
  assert.ok(Math.abs(paid - 503) < 1e-9)
})

test("pending placements are counted, not summed into anyone's theoretical", () => {
  const table = buildResultsTable(
    [{ user_id: "a", display_name: "Ann", entry_fee: 40 }],
    [payoutRow("a", 12), payoutRow("a", null)]
  )
  assert.equal(table.pending, 1)
  assert.equal(table.rows[0].theoretical, 12)
  assert.equal(table.rows[0].pending, 1)
})
