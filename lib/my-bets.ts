// My Bets read path (Sprint 5): everything the /my-bets page needs beyond
// straight Supabase glue — join-shape normalization and phase grouping.
//
// Pure module by design — no Supabase, no "@/" alias imports — so the
// node:test suite exercises the exact code the page runs.
//
// A normalized MyBetEntry is structurally an ExistingPlacement, so the
// §8.1 standing in validation.ts (phaseStanding) runs directly on the same
// rows the page renders — the compliance numbers can never drift from the
// list. Since Sprint 30 (ADR 0002) that standing is per phase: one budget,
// one set of banners, for each phase the bettor is entered in.

import {
  maxSelfBet,
  maxSingleBet,
  phaseEntry,
  phaseStanding,
  type Bettor,
  type ExistingPlacement,
  type PhaseStanding,
  type StandingIssue,
  type TournamentRules,
} from "./validation.ts"
import { toPhaseEntry } from "./placements.ts"
import type { Phase } from "./phases.ts"
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
 * ExistingPlacement — pass entries straight to the §8.1 standing. */
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
 * Group placements by phase (skipping phases with none), each ordered
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
 * (phases without placements are simply absent). Counts only: rule spans
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
// The bettor, from a participant row — the one coercion every page shares
// ---------------------------------------------------------------------------

/** The participant fields the member pages read (PARTICIPANT_ENTRY_COLUMNS). */
export type ParticipantEntries = {
  user_id?: string
  phase1_entry_fee: number | string | null
  phase2_entry_fee: number | string | null
  is_player: boolean
}

/** A Bettor for the rules, from the row as PostgREST hands it back. */
export function toBettor(userId: string, participant: ParticipantEntries): Bettor {
  return {
    user_id: userId,
    is_player: participant.is_player,
    phase1_entry_fee: toPhaseEntry(participant.phase1_entry_fee),
    phase2_entry_fee: toPhaseEntry(participant.phase2_entry_fee),
  }
}

/**
 * Every phase the bettor is in, with the entry. Empty = no money added.
 *
 * `only` narrows it to one phase — the current one (PRD §12 A27). Note the
 * result can then be EMPTY for someone whose money IS in, just not in this
 * phase; callers deciding "has this member added money at all" must ask
 * without `only`.
 */
export function enteredPhases(
  bettor: Bettor,
  only?: Phase
): { phase: Phase; entry: number }[] {
  return ([1, 2] as const).flatMap((phase) => {
    if (only !== undefined && phase !== only) return []
    const entry = phaseEntry(bettor, phase)
    return entry === null ? [] : [{ phase, entry }]
  })
}

// ---------------------------------------------------------------------------
// Personalized rules — every number derives from the tournaments row via the
// validation helpers (floor semantics), never recomputed inline
// ---------------------------------------------------------------------------

export type PhaseRulesModel = {
  phase: Phase
  entry_fee: number
  /** null for non-playing bettors — exempt from the self-bet cap (Q14), so
   * the rules card shows no "max on yourself" figure. */
  max_self_bet: number | null
}

export type RulesModel = {
  /** Flat, the same in every phase (PRD §7 rule 4). */
  max_single_bet: number
  min_picks_per_phase: number
  /** One row per phase the bettor is entered in. */
  phases: PhaseRulesModel[]
}

export function buildRulesModel(
  bettor: Bettor,
  rules: TournamentRules,
  /** Restrict the per-phase rows to the current phase (PRD §12 A27). */
  only?: Phase
): RulesModel {
  return {
    max_single_bet: maxSingleBet(rules),
    min_picks_per_phase: rules.min_picks_per_phase,
    phases: enteredPhases(bettor, only).map(({ phase, entry }) => ({
      phase,
      entry_fee: entry,
      max_self_bet: bettor.is_player ? maxSelfBet(entry, rules) : null,
    })),
  }
}

// ---------------------------------------------------------------------------
// Compliance banners — assembled from validation's per-phase standing,
// messages verbatim. Informational only, never blocking (Q3: admins chase;
// whatever stands, stands — with ADR 0002's money consequences named).
// ---------------------------------------------------------------------------

export type ComplianceItem = {
  /** `warning` costs money or the minimum; `info` is money coming back, or a
   * phase that has closed and can't be acted on; `success` is a phase done. */
  tone: "warning" | "success" | "info"
  title: string
  message: string
  phase: Phase
}

function titleFor(code: StandingIssue["code"], phase: Phase): string {
  switch (code) {
    case "picks":
      return `Not enough picks in Phase ${phase}`
    case "forfeit":
      return `Money on the table in Phase ${phase}`
    case "self":
      return `Self-bet over the line in Phase ${phase}`
    case "over":
      return `Phase ${phase} needs an admin`
    case "refund":
      return `Phase ${phase} refund`
  }
}

/**
 * The one line the /bets slip bar leads with for a phase — the standing's
 * first issue, cut to fit a bar that truncates. Same priorities as the
 * issues themselves; `No picks placed yet` at zero (an E2E journey pins it).
 */
export function standingHeadline(s: PhaseStanding): {
  tone: "warning" | "success" | "info"
  text: string
} {
  if (s.pick_count === 0) return { tone: "warning", text: "No picks placed yet" }
  if (s.complete) return { tone: "success", text: `Phase ${s.phase} balanced` }
  const issue = s.issues[0]
  switch (issue.code) {
    case "picks":
      return {
        tone: "warning",
        text: `${s.picks_needed} more pick${s.picks_needed === 1 ? "" : "s"} needed`,
      }
    case "forfeit":
      return { tone: "warning", text: `$${s.forfeit} forfeits unless you wager it` }
    case "self":
      return {
        tone: "warning",
        text: `Only $${s.self_recognized} of $${s.self_total} on yourself counts`,
      }
    case "over":
      return { tone: "warning", text: "Over your entry — see an admin" }
    case "refund":
      return { tone: "info", text: `$${s.refund} comes back unless you wager it` }
  }
}

/** The closed-phase sentence: what happened, in the past tense. */
function finalSentence(s: PhaseStanding): string {
  const costs: string[] = []
  if (s.forfeit > 0) costs.push(`$${s.forfeit} forfeited to the pot`)
  if (s.refund > 0) costs.push(`$${s.refund} comes back to you`)
  if (s.self_forfeit > 0)
    costs.push(`only $${s.self_recognized} of your $${s.self_total} on yourself counts`)
  const picks = s.meets_pick_minimum ? "" : ` with ${s.pick_count} picks`
  return (
    `You wagered $${s.wagered} of your $${s.entry}${picks}` +
    (costs.length > 0 ? ` — ${costs.join(", ")}.` : ".")
  )
}

/**
 * Banner items for the participant's standing in each phase they are in.
 *
 * While a phase is open every issue phaseStanding() reports becomes a banner,
 * warnings first — a member who has done the least (entered, never opened the
 * menu) reads exactly what it will cost them, which under one pot the app
 * used to say nothing about (the zero-wager blind spot, Sept 2, 2026). A
 * complete phase gets one success banner.
 *
 * Once a phase is CLOSED there is nothing to act on, so an incomplete
 * standing becomes one `info` line stating what happened, and a complete one
 * a success line. Telling someone to go place bets on results night is worse
 * than saying nothing.
 *
 * A bettor entered in neither phase gets nothing here: that is the entry
 * request's job (lib/entry-request.ts), not a compliance matter.
 *
 * `options.only` narrows this to the current phase (PRD §12 A27). Before it,
 * a member entered in both phases read "$20 forfeits unless you wager it" in
 * Phase 2 all the way through Phase 1 — about a phase whose bets were still
 * hidden and which they could do nothing about. Nothing else changes: the
 * closed-phase past-tense branch still fires for the phase that IS current,
 * which is what a member sees between a close and the results.
 */
export function buildComplianceSummary(
  existing: ExistingPlacement[],
  bettor: Bettor,
  rules: TournamentRules,
  options: { closed?: Partial<Record<Phase, boolean>>; only?: Phase } = {}
): ComplianceItem[] {
  const items: ComplianceItem[] = []
  for (const { phase, entry } of enteredPhases(bettor, options.only)) {
    const s = phaseStanding(existing, entry, phase, rules, {
      is_player: bettor.is_player,
      bettor_user_id: bettor.user_id,
    })
    if (options.closed?.[phase]) {
      items.push(
        s.complete
          ? {
              tone: "success",
              title: `Phase ${phase} is locked in`,
              message: `You wagered your full $${entry} with ${s.pick_count} picks.`,
              phase,
            }
          : { tone: "info", title: `Phase ${phase} is closed`, message: finalSentence(s), phase }
      )
      continue
    }
    if (s.complete) {
      items.push({
        tone: "success",
        title: `Phase ${phase} is balanced`,
        message: `You've wagered your full $${entry} in Phase ${phase} and made the pick minimum. You're locked in.`,
        phase,
      })
      continue
    }
    for (const issue of s.issues) {
      items.push({ tone: issue.tone, title: titleFor(issue.code, phase), message: issue.message, phase })
    }
  }
  return items
}
