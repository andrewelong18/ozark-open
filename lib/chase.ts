// The chase list (Sprint 25 / #108) — who an admin has to text before a phase
// closes, in TypeScript so it can be a page instead of a SQL file pasted into
// the Supabase editor on a phone at 7am.
//
// Pure module by design — no Supabase, no "@/" alias imports.
//
// This adds NO compliance logic. Every verdict comes from the same two §8.1
// functions /my-bets renders (checkPickMinimum, checkTournamentTotal), and the
// shape mirrors docs/admin/phase-compliance.sql, which stays as the fallback
// for when the app itself is the thing that's broken. If the two ever
// disagree, the SQL file is the one to fix — these are the functions the app
// enforces with.

import {
  checkPickMinimum,
  checkTournamentTotal,
  type ExistingPlacement,
  type TournamentRules,
} from "./validation.ts"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChaseParticipant = {
  user_id: string
  display_name: string
  entry_fee: number
}

export type ChasePerson = {
  user_id: string
  display_name: string
  entry_fee: number
  phase1_picks: number
  phase2_picks: number
  total_picks: number
  total_wagered: number
  remaining: number
  under_minimum: boolean
  off_exact_total: boolean
  /** Whether this person needs a text *at this close*. */
  needs_a_text: boolean
  /** Why, in the fewest words that fit on a phone. Null when they're fine. */
  reason: string | null
}

export type ChaseList = {
  /** Which close this is — 1 or 2. */
  closing_phase: 1 | 2
  /** Everyone, chased first, then by name. */
  people: ChasePerson[]
  /** Just the ones needing a text, same order. */
  chase: ChasePerson[]
  /** The one-line answer, ready to read aloud or paste into a group text. */
  line: string
}

// ---------------------------------------------------------------------------
// Which close is this?
// ---------------------------------------------------------------------------

/**
 * Read the close off the menu, so nothing has to be picked from a dropdown at
 * the worst possible moment. Phase 2 ships hidden and is revealed only once
 * Phase 1 has closed, so any non-hidden Phase 2 bet means we're at or past
 * that point. Mirrors the CASE in phase-compliance.sql.
 */
export function closingPhase(bets: { phase: number; status: string }[]): 1 | 2 {
  return bets.some((b) => b.phase === 2 && b.status !== "hidden") ? 2 : 1
}

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

/**
 * Who to chase before closing `closing_phase`.
 *
 * The phase-awareness is the whole point (#98): at Phase 1 close, EVERYONE is
 * legitimately short of their entry fee, so off-exact-total is reported as a
 * column but is never a reason to text. It only becomes one at Phase 2 close,
 * which is the last moment it can be fixed.
 *
 * Somebody with zero placements never flags on the minimum — betting entirely
 * in one phase is explicitly allowed (PRD §12 Q2), and a bettor who never
 * wagers is caught by the exact-total check at Phase 2 close anyway.
 */
export function buildChaseList(
  participants: ChaseParticipant[],
  placementsByUser: Map<string, ExistingPlacement[]>,
  rules: TournamentRules,
  closing: 1 | 2
): ChaseList {
  const people: ChasePerson[] = participants.map((p) => {
    const mine = placementsByUser.get(p.user_id) ?? []
    const picks = checkPickMinimum(mine, rules)
    const total = checkTournamentTotal(mine, p.entry_fee)

    // checkPickMinimum passes an empty slate (Q2); "under" here means they
    // started and stopped short, matching the SQL's BETWEEN 1 AND min-1.
    const under = mine.length > 0 && !picks.meets_minimum
    const offTotal = !total.exact
    const needs = under || (closing === 2 && offTotal)

    const why: string[] = []
    if (under) why.push(`${picks.pick_count} of ${rules.min_picks_per_tournament} picks`)
    if (closing === 2 && offTotal)
      why.push(`$${total.total} of $${p.entry_fee}`)

    return {
      user_id: p.user_id,
      display_name: p.display_name,
      entry_fee: p.entry_fee,
      phase1_picks: mine.filter((m) => m.phase === 1).length,
      phase2_picks: mine.filter((m) => m.phase === 2).length,
      total_picks: mine.length,
      total_wagered: total.total,
      remaining: total.remaining,
      under_minimum: under,
      off_exact_total: offTotal,
      needs_a_text: needs,
      reason: why.length > 0 ? why.join(", ") : null,
    }
  })

  people.sort(
    (a, b) =>
      Number(b.needs_a_text) - Number(a.needs_a_text) ||
      Number(b.under_minimum) - Number(a.under_minimum) ||
      a.display_name.localeCompare(b.display_name)
  )

  const chase = people.filter((p) => p.needs_a_text)
  const line =
    chase.length === 0
      ? `Closing Phase ${closing} — nobody to chase, everyone is compliant.`
      : `Closing Phase ${closing} — text these people: ` +
        chase.map((p) => `${p.display_name} (${p.reason})`).join(", ")

  return { closing_phase: closing, people, chase, line }
}
