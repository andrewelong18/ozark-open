// Pari-mutuel payout math (Sprint 7, PRD §5): the theoretical-payout mirror
// of placement_payouts_view, per-user aggregation, and the proportional
// split against the void-adjusted pool. All money stays in floating dollars;
// rounding happens only at display (Q5: cents), via roundCents/MoneyDisplay.
//
// Pure module by design — no Supabase, no "@/" alias imports — so the
// node:test suite exercises the exact code the pages run, including the
// 2026 worked example that is this sprint's acceptance test.
//
// Push ≠ void (ADR 0001 §9): a push credits the stake back INSIDE the
// theoretical math and leaves the pool untouched; a void credits nothing,
// refunds the stake out of band, and shrinks the pool by exactly that stake.

import { type PickResult } from "./closed-bets.ts"

// ---------------------------------------------------------------------------
// Per-placement theoretical payout — the TS mirror of the view's CASE
// ---------------------------------------------------------------------------

/**
 * Theoretical payout for one placement, from the odds_at_placement snapshot
 * (PRD §7.1 — never the live pick odds) and the pick's uploaded result.
 * Mirrors placement_payouts_view exactly (the SQL is proven against real
 * Postgres by scripts/payout-view-roundtrip.ts): hit pays stake + winnings,
 * push pays the stake, miss and void pay 0, pending is null (unresolved).
 */
export function theoreticalPayout(
  amount: number,
  oddsAtPlacement: number,
  result: PickResult
): number | null {
  switch (result) {
    case "hit":
      if (oddsAtPlacement > 0) return amount + (amount * oddsAtPlacement) / 100
      if (oddsAtPlacement < 0) return amount + (amount * 100) / Math.abs(oddsAtPlacement)
      return null // zero odds are invalid (§3.6); same as the view's CASE falling through
    case "push":
      return amount
    case "miss":
    case "void":
      return 0
    case "pending":
      return null
  }
}

/** The voided stake a placement returns to its bettor (and removes from the
 * pool); 0 for every other result. Mirrors the view's refunded_stake. */
export function refundedStake(amount: number, result: PickResult): number {
  return result === "void" ? amount : 0
}

// ---------------------------------------------------------------------------
// Aggregation — a bettor's (or the whole pool's) placement rows rolled up
// ---------------------------------------------------------------------------

export type PayoutTotals = {
  /** Sum of theoretical payouts over resolved placements (pushes count,
   * voids contribute 0). */
  theoretical: number
  /** Sum of voided stakes — refunded out of band, subtracted from the pool. */
  refunded: number
  /** Placements still waiting on a result upload. */
  pending: number
}

/** Roll up placement rows (theoretical null = pending). Works on both the
 * view's rows and rows run through theoreticalPayout/refundedStake. */
export function aggregatePayouts(
  rows: { theoretical: number | null; refunded: number }[]
): PayoutTotals {
  const totals: PayoutTotals = { theoretical: 0, refunded: 0, pending: 0 }
  for (const row of rows) {
    if (row.theoretical === null) totals.pending++
    else totals.theoretical += row.theoretical
    totals.refunded += row.refunded
  }
  return totals
}

// ---------------------------------------------------------------------------
// The pool and the proportional split (PRD §5)
// ---------------------------------------------------------------------------

/** pool_total = sum(entry fees) − sum(refunded voided stakes) — ADR 0001 §9. */
export function poolTotal(entryFees: number[], refundedTotal: number): number {
  return entryFees.reduce((sum, fee) => sum + fee, 0) - refundedTotal
}

/**
 * actual_payout(user) = theoretical(user) / sum(theoretical(all)) × pool.
 * A zero (or degenerate) denominator means nobody has a theoretical payout —
 * no shares to hand out, so everyone's actual is 0.
 */
export function actualShare(
  userTheoretical: number,
  sumTheoretical: number,
  pool: number
): number {
  if (sumTheoretical <= 0) return 0
  return (userTheoretical / sumTheoretical) * pool
}

/** Round to cents for assertions/derived values; display formatting itself
 * lives in MoneyDisplay (Q5: computed payouts show cents). */
export function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

// ---------------------------------------------------------------------------
// View-row normalization — placement_payouts_view via PostgREST (numerics
// may arrive as strings; same caveat as lib/my-bets.ts)
// ---------------------------------------------------------------------------

/** Raw shape of a placement_payouts_view query. */
export type PayoutViewQueryRow = {
  placement_id: string
  user_id: string
  amount: number | string
  result: string
  theoretical_payout: number | string | null
  refunded_stake: number | string
}

/** One live placement's payout numbers, coerced for arithmetic. */
export type PayoutRow = {
  placement_id: string
  user_id: string
  amount: number
  result: string
  theoretical: number | null
  refunded: number
}

export function normalizePayoutRows(rows: PayoutViewQueryRow[]): PayoutRow[] {
  return rows.map((row) => ({
    placement_id: row.placement_id,
    user_id: row.user_id,
    amount: Number(row.amount),
    result: row.result,
    theoretical:
      row.theoretical_payout === null ? null : Number(row.theoretical_payout),
    refunded: Number(row.refunded_stake),
  }))
}

// ---------------------------------------------------------------------------
// The results table — everything /results (and the admin view's money
// columns) needs, from participants + payout rows in one pass
// ---------------------------------------------------------------------------

export type ResultsParticipant = {
  user_id: string
  display_name: string
  nickname?: string | null
  avatar_url?: string | null
  entry_fee: number
}

export type ResultsRow = {
  user_id: string
  display_name: string
  nickname: string | null
  avatar_url: string | null
  entry_fee: number
  theoretical: number
  refunded: number
  actual: number
  /** Cash in minus cash out: actual share + out-of-band void refunds − entry.
   * A voided stake came back to the bettor, so it can't count as a loss. */
  profit_loss: number
  pending: number
}

export type ResultsTable = {
  /** Void-adjusted pool: Σ entry fees − Σ voided stakes. */
  pool: number
  sum_theoretical: number
  /** Placements across the pool still waiting on results — non-zero means
   * the split is "as it stands", not final. */
  pending: number
  rows: ResultsRow[]
}

/**
 * Assemble the pari-mutuel table: pool, everyone's theoretical sum, and each
 * participant's actual share, sorted biggest payout first (ties by name).
 * Participants with no placements still belong to the pool — their entry
 * fees fund it and they appear with a 0 share.
 */
export function buildResultsTable(
  participants: ResultsParticipant[],
  rows: PayoutRow[]
): ResultsTable {
  const all = aggregatePayouts(rows)
  const pool = poolTotal(
    participants.map((p) => p.entry_fee),
    all.refunded
  )

  const byUser = new Map<string, PayoutRow[]>()
  for (const row of rows) {
    const list = byUser.get(row.user_id)
    if (list) list.push(row)
    else byUser.set(row.user_id, [row])
  }

  const out = participants.map((p) => {
    const mine = aggregatePayouts(byUser.get(p.user_id) ?? [])
    const actual = actualShare(mine.theoretical, all.theoretical, pool)
    return {
      user_id: p.user_id,
      display_name: p.display_name,
      nickname: p.nickname ?? null,
      avatar_url: p.avatar_url ?? null,
      entry_fee: p.entry_fee,
      theoretical: mine.theoretical,
      refunded: mine.refunded,
      actual,
      profit_loss: actual + mine.refunded - p.entry_fee,
      pending: mine.pending,
    }
  })
  out.sort(
    (a, b) => b.actual - a.actual || a.display_name.localeCompare(b.display_name)
  )

  return {
    pool,
    sum_theoretical: all.theoretical,
    pending: all.pending,
    rows: out,
  }
}
