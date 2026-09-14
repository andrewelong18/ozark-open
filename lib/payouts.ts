// Pari-mutuel payout math (Sprint 7, PRD §5; per phase since Sprint 30 / ADR
// 0002): the theoretical-payout mirror of placement_payouts_view, per-user
// aggregation, and the proportional split against each phase's pot. All
// money stays in floating dollars; rounding happens only at display (Q5:
// cents), via roundCents/MoneyDisplay.
//
// Pure module by design — no Supabase, no "@/" alias imports — so the
// node:test suite exercises the exact code the pages run, including the
// 2026 worked example and Pat's $50/$20/$12 example.
//
// TWO POTS, NEVER ONE. Each phase has its own entries and its own split
// (buildPhaseResults); "combined" is the per-person SUM of the two phase
// results (buildCombinedResults), never a split over a combined pool. The
// money per bettor-phase, with E the phase entry and W what they wagered:
//
//   C      = min(E, max(W, entry_fee_min))   funds the pot
//   R      = E − C                           comes back, out of band
//   F      = C − W                           in the pot, no wager behind it
//   k      = min(1, floor(pct × W) / S)      share of self-bets that counts
//   theo'  = theo × (self ? k : 1)           the recognised theoretical
//   pool   = Σ C − Σ refunded'               void refunds scaled the same way
//   actual = theo' / Σ theo' × pool
//   cash   = actual + refunded' + R
//
// The identities the tests pin: Σ E = pool + Σ refunded' + Σ R; Σ actual =
// pool whenever anyone has a theoretical; entry + P/L = cash on every row.
//
// Push ≠ void (ADR 0001 §9): a push credits the stake back INSIDE the
// theoretical math and leaves the pot untouched; a void credits nothing,
// refunds the stake out of band, and shrinks the pot by exactly that stake.
// A void on a SCALED self pick refunds amount × k: the forfeited share was
// forfeited for under-wagering, not for the result, and results never reopen
// it (Q7's spirit — a void triggers no adjustment).

import { type PickResult } from "./closed-bets.ts"
import {
  phaseEntry,
  phaseStanding,
  type ExistingPlacement,
  type PhaseStanding,
  type TournamentRules,
} from "./validation.ts"
import type { Phase } from "./phases.ts"

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
// The proportional split (PRD §5)
// ---------------------------------------------------------------------------

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
// Finalizing the tournament — the guard on `tournaments.status = 'completed'`
// (Sprint 25 / #108, superseding #36)
// ---------------------------------------------------------------------------

export type FinalizeReadiness = {
  ok: boolean
  /** Human-readable reasons, worst first. Empty when ok. */
  blockers: string[]
}

/**
 * Whether the tournament can safely be flipped to `completed` — the Saturday-
 * night unlock that reveals the final standings.
 *
 * This exists because the failure mode is silent arithmetic, not an error.
 * aggregatePayouts() SKIPS a pending placement rather than scoring it zero, so
 * finalizing while any pick is unresolved divides a pot across only the
 * settled wagers: everybody's share is inflated, every number is plausible,
 * and the totals still reconcile against the pot. The board does warn once
 * you're in that state, but by then the flip has happened and the winner
 * spotlight is already wrong.
 *
 * Counts are of PICKS, not placements — a pick nobody wagered on still has to
 * carry a verdict before the book is closed, and it wouldn't show up in a
 * placement-level count at all.
 */
export function finalizeReadiness(state: {
  /** bet_picks with result = 'pending' across the tournament. */
  pendingPicks: number
  /** bets whose status is not yet 'closed'. */
  unclosedBets: number
}): FinalizeReadiness {
  const blockers: string[] = []
  if (state.pendingPicks > 0) {
    blockers.push(
      `${state.pendingPicks} pick${state.pendingPicks === 1 ? " has" : "s have"} no result yet. ` +
        `Finalizing now would split the whole pool across only the settled wagers — ` +
        `every payout would be too high, and nothing about the numbers would look wrong.`
    )
  }
  if (state.unclosedBets > 0) {
    blockers.push(
      `${state.unclosedBets} bet${state.unclosedBets === 1 ? " is" : "s are"} still open or hidden. ` +
        `Upload the final sheet with every bet closed first.`
    )
  }
  return { ok: blockers.length === 0, blockers }
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
  /** Sprint 30: the pot this wager belongs to. */
  phase: number | string
  /** Sprint 30: the bettor is the pick's own player. */
  is_self_pick: boolean | string | null
}

/** One live placement's payout numbers, coerced for arithmetic. */
export type PayoutRow = {
  placement_id: string
  user_id: string
  amount: number
  result: string
  theoretical: number | null
  refunded: number
  phase: Phase
  is_self_pick: boolean
}

/** Rows whose phase isn't 1 or 2 are dropped — the schema forbids it, and a
 * row nobody can pot must not silently join Phase 1. */
export function normalizePayoutRows(rows: PayoutViewQueryRow[]): PayoutRow[] {
  const out: PayoutRow[] = []
  for (const row of rows) {
    const phase = Number(row.phase)
    if (phase !== 1 && phase !== 2) continue
    out.push({
      placement_id: row.placement_id,
      user_id: row.user_id,
      amount: Number(row.amount),
      result: row.result,
      theoretical:
        row.theoretical_payout === null ? null : Number(row.theoretical_payout),
      refunded: Number(row.refunded_stake),
      phase,
      is_self_pick: row.is_self_pick === true || row.is_self_pick === "true" || row.is_self_pick === "t",
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// The results table — everything the standings board (and the admin view's
// money columns) needs, from participants + payout rows in one pass
// ---------------------------------------------------------------------------

export type ResultsParticipant = {
  user_id: string
  display_name: string
  nickname?: string | null
  avatar_url?: string | null
  is_player: boolean
  /** null = not in that phase's pot (Sprint 30). */
  phase1_entry_fee: number | null
  phase2_entry_fee: number | null
}

export type ResultsScope = Phase | "combined"

export type ResultsRow = {
  user_id: string
  display_name: string
  nickname: string | null
  avatar_url: string | null
  /** E for a phase; E1 + E2 for combined. */
  entry_fee: number
  /** W — what they actually placed (voids included). */
  wagered: number
  /** C — what funded the pot. */
  committed: number
  /** Committed money with no wager behind it. */
  forfeit_unwagered: number
  /** Self-bet stake that stayed in the pot and earned nothing. */
  forfeit_self: number
  /** Entry money coming back, out of band. */
  refund_unwagered: number
  /** The recognised theoretical payout (self picks scaled by k). */
  theoretical: number
  /** Voided stakes coming back, out of band (self picks scaled by k). */
  refunded: number
  actual: number
  /** Cash in minus cash out: actual + refunded + refund_unwagered − entry. */
  profit_loss: number
  pending: number
}

/**
 * What a bettor actually receives: their share of the pot PLUS the voided
 * stakes refunded out of band PLUS the entry money they never wagered. Cash,
 * not winnings.
 *
 * It exists because two surfaces once disagreed about the same person (#157):
 * a voided stake is carved out of the pot and handed back, so `actual` alone
 * is not what changes hands. Sprint 30 adds the unwagered refund for the same
 * reason. One function, every call site, and the row reconciles:
 * entry_fee + profit_loss === cashReturned(row).
 */
export function cashReturned(row: {
  actual: number
  refunded: number
  refund_unwagered?: number
}): number {
  return row.actual + row.refunded + (row.refund_unwagered ?? 0)
}

export type ResultsTable = {
  scope: ResultsScope
  /** Σ C − Σ refunded' — what the split hands out. */
  pool: number
  /** Σ entries in this scope — what was put in. */
  entries: number
  sum_theoretical: number
  /** Placements in this scope still waiting on results — non-zero means the
   * split is "as it stands", not final. */
  pending: number
  /** Placements in this scope belonging to nobody in the pot — a bettor with
   * no entry for the phase, or revoked. Never a member-facing number; the
   * admin view badges it. */
  dropped_placements: number
  rows: ResultsRow[]
}

function byActualThenName(a: ResultsRow, b: ResultsRow): number {
  return b.actual - a.actual || a.display_name.localeCompare(b.display_name)
}

/**
 * One phase's pot: everyone entered in it, their standing, the recognised
 * theoreticals, and the proportional split. Participants with no placements
 * still belong to the pot — the first $entry_fee_min of their entry funds it
 * and they appear with a 0 share and a refund of the rest.
 *
 * Placements belonging to someone who is NOT in the pot are ignored entirely
 * (a revoked bettor — Sprint 21 / #91 — or a bettor with no entry for this
 * phase). Their money stopped funding the pot, so their wagers must stop
 * counting toward the denominator in the same breath. Callers filter revoked
 * rows out of `participants`; this keeps the arithmetic balanced even if one
 * of them forgets, and counts what it dropped so an admin can see it.
 */
export function buildPhaseResults(
  phase: Phase,
  participants: ResultsParticipant[],
  rows: PayoutRow[],
  rules: TournamentRules
): ResultsTable {
  const entered = participants.filter((p) => phaseEntry(p, phase) !== null)
  const inPot = new Set(entered.map((p) => p.user_id))
  const phaseRows = rows.filter((row) => row.phase === phase)
  const funded = phaseRows.filter((row) => inPot.has(row.user_id))

  const byUser = new Map<string, PayoutRow[]>()
  for (const row of funded) {
    const list = byUser.get(row.user_id)
    if (list) list.push(row)
    else byUser.set(row.user_id, [row])
  }

  type Scored = {
    participant: ResultsParticipant
    entry: number
    standing: PhaseStanding
    totals: PayoutTotals
  }
  const scored: Scored[] = entered.map((p) => {
    const entry = phaseEntry(p, phase)!
    const mine = byUser.get(p.user_id) ?? []
    // The standing reads the same rows as ExistingPlacements: a self pick
    // carries the bettor's own id as its player, everything else none.
    const existing: ExistingPlacement[] = mine.map((row) => ({
      pick_id: row.placement_id,
      bet_id: row.placement_id,
      phase,
      amount: row.amount,
      pick_player_user_id: row.is_self_pick ? p.user_id : null,
    }))
    const standing = phaseStanding(existing, entry, phase, rules, {
      is_player: p.is_player,
      bettor_user_id: p.user_id,
    })
    const k = standing.self_total > 0 ? standing.self_recognized / standing.self_total : 1
    const totals = aggregatePayouts(
      mine.map((row) => {
        const scale = row.is_self_pick && p.is_player ? k : 1
        return {
          theoretical: row.theoretical === null ? null : row.theoretical * scale,
          refunded: row.refunded * scale,
        }
      })
    )
    return { participant: p, entry, standing, totals }
  })

  const pool =
    scored.reduce((sum, s) => sum + s.standing.committed, 0) -
    scored.reduce((sum, s) => sum + s.totals.refunded, 0)
  const sumTheoretical = scored.reduce((sum, s) => sum + s.totals.theoretical, 0)
  const pending = scored.reduce((sum, s) => sum + s.totals.pending, 0)

  const out: ResultsRow[] = scored.map(({ participant: p, entry, standing, totals }) => {
    const actual = actualShare(totals.theoretical, sumTheoretical, pool)
    const cash = actual + totals.refunded + standing.refund
    return {
      user_id: p.user_id,
      display_name: p.display_name,
      nickname: p.nickname ?? null,
      avatar_url: p.avatar_url ?? null,
      entry_fee: entry,
      wagered: standing.wagered,
      committed: standing.committed,
      forfeit_unwagered: standing.forfeit,
      forfeit_self: standing.self_forfeit,
      refund_unwagered: standing.refund,
      theoretical: totals.theoretical,
      refunded: totals.refunded,
      actual,
      profit_loss: cash - entry,
      pending: totals.pending,
    }
  })
  out.sort(byActualThenName)

  return {
    scope: phase,
    pool,
    entries: scored.reduce((sum, s) => sum + s.entry, 0),
    sum_theoretical: sumTheoretical,
    pending,
    dropped_placements: phaseRows.length - funded.length,
    rows: out,
  }
}

/**
 * The two phase tables added up per person. NOT a split over a combined
 * pool — Pat: "pari-mutuel math should only happen separately within each
 * phase". Someone in one phase only carries that phase's numbers.
 */
export function buildCombinedResults(p1: ResultsTable, p2: ResultsTable): ResultsTable {
  const byUser = new Map<string, ResultsRow>()
  for (const row of [...p1.rows, ...p2.rows]) {
    const seen = byUser.get(row.user_id)
    if (!seen) {
      byUser.set(row.user_id, { ...row })
      continue
    }
    byUser.set(row.user_id, {
      ...seen,
      entry_fee: seen.entry_fee + row.entry_fee,
      wagered: seen.wagered + row.wagered,
      committed: seen.committed + row.committed,
      forfeit_unwagered: seen.forfeit_unwagered + row.forfeit_unwagered,
      forfeit_self: seen.forfeit_self + row.forfeit_self,
      refund_unwagered: seen.refund_unwagered + row.refund_unwagered,
      theoretical: seen.theoretical + row.theoretical,
      refunded: seen.refunded + row.refunded,
      actual: seen.actual + row.actual,
      profit_loss: seen.profit_loss + row.profit_loss,
      pending: seen.pending + row.pending,
    })
  }
  const rows = [...byUser.values()].sort(byActualThenName)
  return {
    scope: "combined",
    pool: p1.pool + p2.pool,
    entries: p1.entries + p2.entries,
    sum_theoretical: p1.sum_theoretical + p2.sum_theoretical,
    pending: p1.pending + p2.pending,
    dropped_placements: p1.dropped_placements + p2.dropped_placements,
    rows,
  }
}

export type ResultsTables = Record<Phase, ResultsTable> & { combined: ResultsTable }

/** All three scopes from one read — what the standings board renders. */
export function buildResultsTables(
  participants: ResultsParticipant[],
  rows: PayoutRow[],
  rules: TournamentRules
): ResultsTables {
  const one = buildPhaseResults(1, participants, rows, rules)
  const two = buildPhaseResults(2, participants, rows, rules)
  return { 1: one, 2: two, combined: buildCombinedResults(one, two) }
}
