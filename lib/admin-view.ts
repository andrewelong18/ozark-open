// Admin view-all read path (Sprint 7): everything /admin/view needs beyond
// straight Supabase glue — join normalization for everyone's placements
// (open phases included — admin RLS reads all) and the per-bettor grouping
// that replicates the admin workbook's `View` sheet: flat placement rows
// under each bettor, with wagered/theoretical/actual-so-far money columns
// from lib/payouts.ts.
//
// Pure module by design — no Supabase, no "@/" alias imports — so the
// node:test suite exercises the exact code the page runs.

import { toResult, type PickResult } from "./closed-bets.ts"
import {
  buildResultsTable,
  refundedStake,
  theoreticalPayout,
  type PayoutRow,
  type ResultsParticipant,
  type ResultsRow,
} from "./payouts.ts"

// ---------------------------------------------------------------------------
// Row normalization — supabase-js returns to-one joins as object OR
// one-element array (same caveat as lib/placements.ts / lib/my-bets.ts).
// ---------------------------------------------------------------------------

function one<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

type UserJoin = { display_name: string }

type AdminBetJoin = {
  title: string
  phase: number
  round: string
  status: string
  sheet_bet_id: number
  tournament_id: string
}

type AdminPickJoin = {
  label: string
  sheet_pick_id: number
  result: string
  bets: AdminBetJoin | AdminBetJoin[] | null
}

/** Raw shape of the /admin/view placements query
 * (bet_placements → users + bet_picks → bets). */
export type AdminViewQueryRow = {
  id: string
  user_id: string
  pick_id: string
  amount: number
  odds_at_placement: number
  requires_admin_review: boolean
  users: UserJoin | UserJoin[] | null
  bet_picks: AdminPickJoin | AdminPickJoin[] | null
}

/** One placement, flattened for the admin table, with its payout numbers
 * computed from the odds snapshot (mirrors placement_payouts_view). */
export type AdminPlacementRow = {
  placement_id: string
  user_id: string
  display_name: string
  phase: 1 | 2
  round: string
  bet_status: string
  bet_title: string
  sheet_bet_id: number
  pick_label: string
  sheet_pick_id: number
  amount: number
  odds_at_placement: number
  result: PickResult
  /** The §7 self-pick flag, snapshotted at write — the View sheet's review
   * column. */
  requires_admin_review: boolean
  theoretical: number | null
  refunded: number
}

/**
 * Flatten everyone's live placements, keeping only the target tournament.
 * Unreadable pick/bet joins are dropped (same as normalizeMyBets); a missing
 * users join keeps the row with a placeholder name — the money is real.
 * PostgREST may serialize numerics as strings, so amounts/odds are coerced.
 */
export function normalizeAdminRows(
  rows: AdminViewQueryRow[],
  tournamentId: string
): AdminPlacementRow[] {
  const out: AdminPlacementRow[] = []
  for (const row of rows) {
    const pick = one(row.bet_picks)
    const bet = pick ? one(pick.bets) : null
    if (!pick || !bet) continue
    if (bet.tournament_id !== tournamentId) continue
    if (bet.phase !== 1 && bet.phase !== 2) continue
    const amount = Number(row.amount)
    const odds = Number(row.odds_at_placement)
    const result = toResult(pick.result)
    out.push({
      placement_id: row.id,
      user_id: row.user_id,
      display_name: one(row.users)?.display_name ?? "Unknown bettor",
      phase: bet.phase,
      round: bet.round,
      bet_status: bet.status,
      bet_title: bet.title,
      sheet_bet_id: Number(bet.sheet_bet_id),
      pick_label: pick.label,
      sheet_pick_id: Number(pick.sheet_pick_id),
      amount,
      odds_at_placement: odds,
      result,
      requires_admin_review: Boolean(row.requires_admin_review),
      theoretical: theoreticalPayout(amount, odds, result),
      refunded: refundedStake(amount, result),
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// The View-sheet grouping — one section per bettor, money columns rolled up
// ---------------------------------------------------------------------------

const ROUND_ORDER = ["tournament", "round_1", "round_2", "round_3"] as const

function roundRank(round: string): number {
  const i = (ROUND_ORDER as readonly string[]).indexOf(round)
  return i === -1 ? ROUND_ORDER.length : i
}

/** One bettor's section: their placements in menu order plus the same money
 * row /results shows (theoretical, actual-as-it-stands, refunded voids). */
export type AdminBettorGroup = ResultsRow & {
  /** Total wagered across both phases (live rows only). */
  wagered: number
  /** How many placements carry the self-pick review flag. */
  flagged: number
  entries: AdminPlacementRow[]
}

export type AdminView = {
  /** Void-adjusted pool: Σ entry fees − Σ voided stakes so far. */
  pool: number
  sum_theoretical: number
  /** Placements still waiting on results — non-zero means the actual column
   * is "as it stands", not final. */
  pending: number
  bettors: AdminBettorGroup[]
}

/**
 * Assemble the whole View sheet: every participant (bettors with no
 * placements included — their entries fund the pool and they're the ones
 * being chased), sorted by name, each with placements ordered phase →
 * round → sheet ids like the bet menu. Money columns come from
 * buildResultsTable so the numbers can never drift from /results.
 */
export function buildAdminView(
  participants: ResultsParticipant[],
  rows: AdminPlacementRow[]
): AdminView {
  const payoutRows: PayoutRow[] = rows.map((r) => ({
    placement_id: r.placement_id,
    user_id: r.user_id,
    amount: r.amount,
    result: r.result,
    theoretical: r.theoretical,
    refunded: r.refunded,
  }))
  const table = buildResultsTable(participants, payoutRows)

  const byUser = new Map<string, AdminPlacementRow[]>()
  for (const row of rows) {
    const list = byUser.get(row.user_id)
    if (list) list.push(row)
    else byUser.set(row.user_id, [row])
  }

  const bettors = table.rows
    .map((money) => {
      const entries = (byUser.get(money.user_id) ?? []).sort(
        (a, b) =>
          a.phase - b.phase ||
          roundRank(a.round) - roundRank(b.round) ||
          a.sheet_bet_id - b.sheet_bet_id ||
          a.sheet_pick_id - b.sheet_pick_id
      )
      return {
        ...money,
        wagered: entries.reduce((sum, e) => sum + e.amount, 0),
        flagged: entries.filter((e) => e.requires_admin_review).length,
        entries,
      }
    })
    .sort((a, b) => a.display_name.localeCompare(b.display_name))

  return {
    pool: table.pool,
    sum_theoretical: table.sum_theoretical,
    pending: table.pending,
    bettors,
  }
}
