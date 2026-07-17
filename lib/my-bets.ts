// My Bets read path (Sprint 5): everything the /my-bets page needs beyond
// straight Supabase glue — join-shape normalization and phase grouping.
//
// Pure module by design — no Supabase, no "@/" alias imports — so the
// node:test suite exercises the exact code the page runs.
//
// A normalized MyBetEntry is structurally an ExistingPlacement, so the
// §8.1 phase-close checks in validation.ts (checkPhaseMinimums /
// checkTournamentTotal) run directly on the same rows the page renders —
// the compliance numbers can never drift from the list.

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
    })
  }
  return out
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
