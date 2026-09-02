// My Bets read path (Sprint 5): everything the /my-bets page needs beyond
// straight Supabase glue — join-shape normalization and phase grouping.
//
// Pure module by design — no Supabase, no "@/" alias imports — so the
// node:test suite exercises the exact code the page runs.
//
// A normalized MyBetEntry is structurally an ExistingPlacement, so the
// §8.1 phase-close checks in validation.ts (checkPickMinimum /
// checkTournamentTotal) run directly on the same rows the page renders —
// the compliance numbers can never drift from the list.

import {
  checkPickMinimum,
  checkTournamentTotal,
  maxSelfBet,
  maxSingleBet,
  type ExistingPlacement,
  type TournamentRules,
} from "./validation.ts"
import { toResult, type PickResult } from "./closed-bets.ts"
import {
  aggregatePayouts,
  refundedStake,
  theoreticalPayout,
  type PayoutTotals,
} from "./payouts.ts"

// ---------------------------------------------------------------------------
// Row normalization — supabase-js returns to-one joins as object OR
// one-element array (same caveat as lib/placements.ts).
// ---------------------------------------------------------------------------

function one<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

type MyBetsBetJoin = {
  id: string
  title: string
  phase: number
  round: string
  status: string
  sheet_bet_id: number
  tournament_id: string
}

type MyBetsPickJoin = {
  label: string
  sheet_pick_id: number
  player_user_id: string | null
  result: string
  bets: MyBetsBetJoin | MyBetsBetJoin[] | null
}

/** Raw shape of the /my-bets placements query
 * (bet_placements → bet_picks → bets). */
export type MyBetsQueryRow = {
  pick_id: string
  amount: number
  odds_at_placement: number
  bet_picks: MyBetsPickJoin | MyBetsPickJoin[] | null
}

/** One live placement, flattened for display. Superset of validation's
 * ExistingPlacement — pass entries straight to the §8.1 checks. */
export type MyBetEntry = {
  pick_id: string
  bet_id: string
  phase: 1 | 2
  round: string
  bet_status: string
  bet_title: string
  sheet_bet_id: number
  pick_label: string
  sheet_pick_id: number
  pick_player_user_id: string | null
  amount: number
  /** The write-time American-odds snapshot — never the pick's live odds. */
  odds_at_placement: number
  /** The pick's uploaded result — displayed (and paying out) only when not
   * pending (ADR 0001 §6). */
  result: PickResult
}

/**
 * Flatten the bettor's live placements for display, keeping only rows in the
 * target tournament. Unreadable joins are dropped, same as
 * normalizeExistingPlacements. PostgREST may serialize numerics as strings;
 * amount and the odds snapshot are coerced.
 */
export function normalizeMyBets(
  rows: MyBetsQueryRow[],
  tournamentId: string
): MyBetEntry[] {
  const out: MyBetEntry[] = []
  for (const row of rows) {
    const pick = one(row.bet_picks)
    const bet = pick ? one(pick.bets) : null
    if (!pick || !bet) continue
    if (bet.tournament_id !== tournamentId) continue
    if (bet.phase !== 1 && bet.phase !== 2) continue
    out.push({
      pick_id: row.pick_id,
      bet_id: bet.id,
      phase: bet.phase,
      round: bet.round,
      bet_status: bet.status,
      bet_title: bet.title,
      sheet_bet_id: Number(bet.sheet_bet_id),
      pick_label: pick.label,
      sheet_pick_id: Number(pick.sheet_pick_id),
      pick_player_user_id: pick.player_user_id,
      amount: Number(row.amount),
      odds_at_placement: Number(row.odds_at_placement),
      result: toResult(pick.result),
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Payouts — per-entry theoretical (from the odds snapshot) and the rollup
// the "Theoretical Payout" stat shows
// ---------------------------------------------------------------------------

/** One entry's theoretical payout — null while pending. Push credits the
 * stake; void credits nothing (the stake comes back via entryRefund). */
export function entryPayout(entry: MyBetEntry): number | null {
  return theoreticalPayout(entry.amount, entry.odds_at_placement, entry.result)
}

/** The stake a void hands back (out of band); 0 otherwise. */
export function entryRefund(entry: MyBetEntry): number {
  return refundedStake(entry.amount, entry.result)
}

/** Roll the bettor's entries up for the summary stat: resolved theoretical
 * total (pushes count, voids contribute 0), refunded void stakes, and how
 * many picks are still waiting on results. */
export function payoutSummary(entries: MyBetEntry[]): PayoutTotals {
  return aggregatePayouts(
    entries.map((e) => ({ theoretical: entryPayout(e), refunded: entryRefund(e) }))
  )
}

// ---------------------------------------------------------------------------
// Phase grouping — mirrors the /bets menu ordering (phase → round → sheet IDs)
// ---------------------------------------------------------------------------

const ROUND_ORDER = ["tournament", "round_1", "round_2", "round_3"] as const

function roundRank(round: string): number {
  const i = (ROUND_ORDER as readonly string[]).indexOf(round)
  return i === -1 ? ROUND_ORDER.length : i
}

export type PhaseGroup = {
  phase: 1 | 2
  pick_count: number
  /** Total wagered in this phase. */
  subtotal: number
  entries: MyBetEntry[]
}

/**
 * Group placements by phase (skipping phases with none — Q2), each ordered
 * round → sheet_bet_id → sheet_pick_id like the bet menu, with the per-phase
 * pick count and dollar subtotal the phase header shows.
 */
export function groupByPhase(entries: MyBetEntry[]): PhaseGroup[] {
  const phases: (1 | 2)[] = [1, 2]
  return phases
    .map((phase) => {
      const inPhase = entries
        .filter((e) => e.phase === phase)
        .sort(
          (a, b) =>
            roundRank(a.round) - roundRank(b.round) ||
            a.sheet_bet_id - b.sheet_bet_id ||
            a.sheet_pick_id - b.sheet_pick_id
        )
      return {
        phase,
        pick_count: inPhase.length,
        subtotal: inPhase.reduce((sum, e) => sum + e.amount, 0),
        entries: inPhase,
      }
    })
    .filter((g) => g.pick_count > 0)
}

/** Short pick-count line for the budget module — counts per phase bet in
 * (phases without placements are simply absent, Q2). Counts only: rule spans
 * live on the rules card, shortfalls on the compliance banner. */
export function picksLine(entries: { phase: 1 | 2 }[]): string {
  const parts = ([1, 2] as const)
    .map((phase) => entries.filter((e) => e.phase === phase).length)
    .map((count, i) => ({ phase: i + 1, count }))
    .filter((p) => p.count > 0)
    .map((p) => `Phase ${p.phase}: ${p.count} ${p.count === 1 ? "pick" : "picks"}`)
  return parts.length > 0 ? parts.join(" · ") : "No picks yet"
}

// ---------------------------------------------------------------------------
// Personalized rules — every number derives from the tournaments row via the
// validation helpers (floor semantics), never recomputed inline
// ---------------------------------------------------------------------------

export type RulesModel = {
  entry_fee: number
  max_single_bet: number
  /** null for non-playing bettors — exempt from the self-bet cap (Q14), so
   * the rules card shows no "max on yourself" line. */
  max_self_bet: number | null
  /** Across both phases combined (#96); the max below is per phase. */
  min_picks_per_tournament: number
  max_picks_per_phase: number
}

export function buildRulesModel(
  participant: { entry_fee: number; is_player: boolean },
  rules: TournamentRules
): RulesModel {
  const entryFee = Number(participant.entry_fee)
  return {
    entry_fee: entryFee,
    max_single_bet: maxSingleBet(entryFee, rules),
    max_self_bet: participant.is_player ? maxSelfBet(entryFee, rules) : null,
    min_picks_per_tournament: rules.min_picks_per_tournament,
    max_picks_per_phase: rules.max_picks_per_phase,
  }
}

// ---------------------------------------------------------------------------
// Compliance banners — assembled from validation's §8.1 phase-close checks,
// messages verbatim. Informational only, never blocking (Q3: admins chase;
// whatever stands, stands).
// ---------------------------------------------------------------------------

export type ComplianceItem = {
  /** `info` is NOT a lesser warning. Per PRD Q2 a member with no wagers is not
   *  in violation until the Phase 2 close, and the dashboard's "Alerts (n)"
   *  badge counts warnings only — so telling them what they still owe must not
   *  put a red number on a page where nothing is wrong yet. */
  tone: "warning" | "success" | "info"
  title: string
  message: string
}

/**
 * Banner items for the participant's current standing.
 *
 * Once they've bet: one warning if they're short of the tournament-wide pick
 * minimum (#96 — the count spans both phases, so a one-phase slate of 5 is
 * complete), one for an off-exact total, or a single success banner when every
 * check passes.
 *
 * AT ZERO PLACEMENTS this used to return nothing at all, and that was the
 * blind spot. The member who has done the least — registered, paid, never
 * opened the menu — was the only one the app told nothing. The dry run has two
 * of them on the record (`OUTSTANDING_DECISIONS.md` §2b): Steve paid his entry,
 * never wagered, and finished at −$20.00.
 *
 * So they now get ONE `info` item naming what they still owe. Deliberately
 * `info` and not `warning`, for a rule rather than a taste reason: PRD Q2 says
 * they are not in violation until the Phase 2 close, and the dashboard's
 * "Alerts (n)" badge counts warnings — a red 1 on a dashboard where nothing is
 * yet wrong is the kind of alert people learn to ignore.
 *
 * `wageringOver` suppresses it entirely. After the Phase 2 deadline there is
 * nothing they can do about it, and telling someone to go place bets on
 * results night is worse than saying nothing.
 *
 * checkPickMinimum()'s own zero-pick exemption is NOT touched: it is
 * deliberate, cited to PRD Q2 in lib/chase.ts, mirrored in
 * docs/admin/phase-compliance.sql, and relied on by scripts/dry-run-verify.ts.
 * This is a display gap, and the fix belongs here.
 */
export function buildComplianceSummary(
  existing: ExistingPlacement[],
  entryFee: number,
  rules: TournamentRules,
  options: { wageringOver?: boolean } = {}
): ComplianceItem[] {
  if (existing.length === 0) {
    if (options.wageringOver) return []
    return [
      {
        tone: "info",
        title: "No bets placed yet",
        message: `You'll need at least ${rules.min_picks_per_tournament} picks totalling exactly $${entryFee} by the Phase 2 deadline.`,
      },
    ]
  }
  const items: ComplianceItem[] = []
  const picks = checkPickMinimum(existing, rules)
  if (!picks.meets_minimum && picks.message)
    items.push({
      tone: "warning",
      title: "Not enough picks yet",
      message: picks.message,
    })
  const total = checkTournamentTotal(existing, entryFee)
  if (!total.exact && total.message)
    items.push({ tone: "warning", title: "Not balanced yet", message: total.message })
  if (items.length === 0)
    items.push({
      tone: "success",
      title: "You're balanced",
      message: `You've wagered your full $${entryFee} and made the pick minimum. You're locked in.`,
    })
  return items
}
