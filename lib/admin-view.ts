// Admin view-all read path (Sprint 7): everything /admin/view needs beyond
// straight Supabase glue — join normalization for everyone's placements
// (open phases included — admin RLS reads all) and the per-bettor grouping
// that replicates the admin workbook's `View` sheet: flat placement rows
// under each bettor, with wagered/theoretical/actual-so-far money columns
// from lib/payouts.ts — per phase since Sprint 30 (ADR 0002), with the
// combined sum on the bettor's headline.
//
// Pure module by design — no Supabase, no "@/" alias imports — so the
// node:test suite exercises the exact code the page runs.

import { roundRank } from "./bet-taxonomy.ts"
import { toResult, type PickResult } from "./closed-bets.ts"
import {
  buildResultsTables,
  refundedStake,
  theoreticalPayout,
  type PayoutRow,
  type ResultsParticipant,
  type ResultsRow,
} from "./payouts.ts"
import { phaseEntry, phaseStanding, type TournamentRules } from "./validation.ts"
import type { Phase } from "./phases.ts"

// ---------------------------------------------------------------------------
// Row normalization — supabase-js returns to-one joins as object OR
// one-element array (same caveat as lib/placements.ts / lib/my-bets.ts).
// ---------------------------------------------------------------------------

function one<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

type UserJoin = {
  display_name: string
  nickname?: string | null
  avatar_url?: string | null
}

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
  /** The pick's player, for the self-bet share (Sprint 30). Optional so a
   * query that predates the column still normalizes. */
  player_user_id?: string | null
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
  placed_by_user_id?: string | null
  users: UserJoin | UserJoin[] | null
  bet_picks: AdminPickJoin | AdminPickJoin[] | null
}

/** One placement, flattened for the admin table, with its payout numbers
 * computed from the odds snapshot (mirrors placement_payouts_view). */
export type AdminPlacementRow = {
  placement_id: string
  user_id: string
  display_name: string
  nickname: string | null
  avatar_url: string | null
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
  /** The pick's player IS the bettor — the live fact the self-bet share is
   * computed from, as opposed to the flag above, which is a snapshot. */
  is_self_pick: boolean
  /** The admin who entered this wager on the bettor's behalf, or null when the
   * bettor placed it themselves (Sprint 23 / #101). The money page is where
   * "who entered this" has to be answerable in September. */
  placed_by_user_id: string | null
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
    const joined = one(row.users)
    out.push({
      placement_id: row.id,
      user_id: row.user_id,
      display_name: joined?.display_name ?? "Unknown bettor",
      nickname: joined?.nickname ?? null,
      avatar_url: joined?.avatar_url ?? null,
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
      is_self_pick: pick.player_user_id != null && pick.player_user_id === row.user_id,
      placed_by_user_id: row.placed_by_user_id ?? null,
      theoretical: theoreticalPayout(amount, odds, result),
      refunded: refundedStake(amount, result),
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// The View-sheet grouping — one section per bettor, money columns rolled up
// ---------------------------------------------------------------------------

/** One phase of a bettor's section: the entry, what they did with it, and
 * what it will cost — the standing the chase list and the banners read. */
export type AdminPhaseLine = {
  phase: Phase
  entry: number
  wagered: number
  pick_count: number
  committed: number
  forfeit: number
  refund: number
  self_forfeit: number
  complete: boolean
  over_entry: boolean
  /** That phase's share of the bettor's actual, for the per-phase table. */
  actual: number
  theoretical: number
  refunded: number
}

/** One bettor's section: their placements in menu order plus the combined
 * money row the standings show, and a line per phase they are in. */
export type AdminBettorGroup = ResultsRow & {
  /** How many placements carry the self-pick review flag. */
  flagged: number
  phases: AdminPhaseLine[]
  entries: AdminPlacementRow[]
}

export type AdminView = {
  /** Each phase's pot and the combined sum. */
  pools: { 1: number; 2: number; combined: number }
  sum_theoretical: number
  /** Placements still waiting on results — non-zero means the actual column
   * is "as it stands", not final. */
  pending: number
  /** Placements belonging to nobody in their phase's pot (a bettor with no
   * entry for that phase, or revoked) — a hand edit somewhere. */
  dropped_placements: number
  bettors: AdminBettorGroup[]
  /** Approved members with no entry in either phase — money not yet added. */
  unentered: ResultsParticipant[]
}

/**
 * Assemble the whole View sheet: every entered participant (bettors with no
 * placements included — their entries fund the pots and they're the ones
 * being chased), sorted by name, each with placements ordered phase →
 * round → sheet ids like the bet menu. Money columns come from
 * buildResultsTables so the numbers can never drift from the standings.
 */
export function buildAdminView(
  participants: ResultsParticipant[],
  rows: AdminPlacementRow[],
  rules: TournamentRules
): AdminView {
  const payoutRows: PayoutRow[] = rows.map((r) => ({
    placement_id: r.placement_id,
    user_id: r.user_id,
    amount: r.amount,
    result: r.result,
    theoretical: r.theoretical,
    refunded: r.refunded,
    phase: r.phase,
    is_self_pick: r.is_self_pick,
  }))
  const tables = buildResultsTables(participants, payoutRows, rules)

  const byUser = new Map<string, AdminPlacementRow[]>()
  for (const row of rows) {
    const list = byUser.get(row.user_id)
    if (list) list.push(row)
    else byUser.set(row.user_id, [row])
  }
  const participantById = new Map(participants.map((p) => [p.user_id, p]))

  const bettors = tables.combined.rows
    .map((money) => {
      const p = participantById.get(money.user_id)!
      const entries = (byUser.get(money.user_id) ?? []).sort(
        (a, b) =>
          a.phase - b.phase ||
          roundRank(a.round) - roundRank(b.round) ||
          a.sheet_bet_id - b.sheet_bet_id ||
          a.sheet_pick_id - b.sheet_pick_id
      )
      const phases: AdminPhaseLine[] = ([1, 2] as const).flatMap((phase) => {
        const entry = phaseEntry(p, phase)
        if (entry === null) return []
        const standing = phaseStanding(
          entries.map((e) => ({
            pick_id: e.placement_id,
            bet_id: e.placement_id,
            phase: e.phase,
            amount: e.amount,
            pick_player_user_id: e.is_self_pick ? p.user_id : null,
          })),
          entry,
          phase,
          rules,
          { is_player: p.is_player, bettor_user_id: p.user_id }
        )
        const phaseRow = tables[phase].rows.find((r) => r.user_id === p.user_id)
        return [
          {
            phase,
            entry,
            wagered: standing.wagered,
            pick_count: standing.pick_count,
            committed: standing.committed,
            forfeit: standing.forfeit,
            refund: standing.refund,
            self_forfeit: standing.self_forfeit,
            complete: standing.complete,
            over_entry: standing.over_entry,
            actual: phaseRow?.actual ?? 0,
            theoretical: phaseRow?.theoretical ?? 0,
            refunded: phaseRow?.refunded ?? 0,
          },
        ]
      })
      return {
        ...money,
        flagged: entries.filter((e) => e.requires_admin_review).length,
        phases,
        entries,
      }
    })
    .sort((a, b) => a.display_name.localeCompare(b.display_name))

  const enteredIds = new Set(tables.combined.rows.map((r) => r.user_id))
  const unentered = participants
    .filter((p) => !enteredIds.has(p.user_id))
    .sort((a, b) => a.display_name.localeCompare(b.display_name))

  return {
    pools: { 1: tables[1].pool, 2: tables[2].pool, combined: tables.combined.pool },
    sum_theoretical: tables.combined.sum_theoretical,
    pending: tables.combined.pending,
    dropped_placements: tables.combined.dropped_placements,
    bettors,
    unentered,
  }
}
