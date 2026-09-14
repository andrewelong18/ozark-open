// The chase list (Sprint 25 / #108) — who an admin has to text before a phase
// closes, in TypeScript so it can be a page instead of a SQL file pasted into
// the Supabase editor on a phone at 7am.
//
// Pure module by design — no Supabase, no "@/" alias imports.
//
// This adds NO compliance logic. Every verdict comes from phaseStanding()
// (lib/validation.ts) — the same function the slip bar, /my-bets and the
// payout math read — and the shape mirrors docs/admin/phase-compliance.sql,
// which stays as the fallback for when the app itself is the thing that's
// broken. If the two ever disagree, the SQL file is the one to fix.
//
// SINCE SPRINT 30 (ADR 0002) EACH CLOSE IS ITS OWN RECKONING. Every phase is
// its own entry and its own pot, so at Phase 1 close everyone entered in
// Phase 1 who isn't complete gets a text — including the member who paid and
// never wagered, because the first $entry_fee_min of their entry forfeits at
// that moment. Phase 2 is not mentioned at all on Thursday, and at Phase 2
// close Phase 1's stragglers are not chased: that phase is closed, and
// whatever stood, stands (Q3). Members with no entry for the closing phase are
// not on the list — they chose to sit it out — but their count is reported,
// because "somebody paid for both phases and only Phase 1 got typed in" is
// the data-entry gap an admin actually hits on Friday night.

import {
  phaseEntry,
  phaseStanding,
  type ExistingPlacement,
  type PhaseStanding,
  type TournamentRules,
} from "./validation.ts"
import type { Phase } from "./phases.ts"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChaseParticipant = {
  user_id: string
  display_name: string
  is_player: boolean
  phase1_entry_fee: number | null
  phase2_entry_fee: number | null
}

export type ChasePerson = {
  user_id: string
  display_name: string
  /** Their entry for the closing phase. */
  entry: number
  wagered: number
  pick_count: number
  /** What the pot keeps with no wager behind it if nothing changes. */
  forfeit: number
  /** What comes back to them if nothing changes. */
  refund: number
  /** Self-bet money that would not count if nothing changes. */
  self_forfeit: number
  complete: boolean
  /** Whether this person needs a text *at this close*. */
  needs_a_text: boolean
  /** Why, in the fewest words that fit on a phone. Null when they're fine. */
  reason: string | null
  standing: PhaseStanding
}

export type ChaseList = {
  /** Which close this is — 1 or 2. */
  closing_phase: Phase
  /** Everyone entered in the closing phase, chased first, then by name. */
  people: ChasePerson[]
  /** Just the ones needing a text, same order. */
  chase: ChasePerson[]
  /** Approved members with no entry recorded for the closing phase. */
  not_entered: number
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
export function closingPhase(bets: { phase: number; status: string }[]): Phase {
  return bets.some((b) => b.phase === 2 && b.status !== "hidden") ? 2 : 1
}

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

/** The phone-sized reason: money first, then picks, then what it costs. */
function reasonFor(s: PhaseStanding, minPicks: number): string | null {
  if (s.complete) return null
  const parts: string[] = []
  if (s.wagered !== s.entry) parts.push(`$${s.wagered} of $${s.entry}`)
  if (!s.meets_pick_minimum) parts.push(`${s.pick_count} of ${minPicks} picks`)
  const costs: string[] = []
  if (s.forfeit > 0) costs.push(`$${s.forfeit} forfeits`)
  if (s.refund > 0) costs.push(`$${s.refund} comes back`)
  if (s.self_forfeit > 0)
    costs.push(`only $${s.self_recognized} of $${s.self_total} on themselves counts`)
  if (s.over_entry) costs.push("over their entry")
  return parts.join(", ") + (costs.length > 0 ? ` → ${costs.join(", ")}` : "")
}

/**
 * Who to chase before closing `closing`.
 *
 * Everyone with an entry for that phase is listed; anyone whose standing is
 * not complete needs a text. There is no zero-placement exemption any more —
 * under one pot, betting entirely in the other phase was legitimate (Q2);
 * under two, an entry with nothing on it forfeits its first $20 at this close.
 */
export function buildChaseList(
  participants: ChaseParticipant[],
  placementsByUser: Map<string, ExistingPlacement[]>,
  rules: TournamentRules,
  closing: Phase
): ChaseList {
  const people: ChasePerson[] = []
  let notEntered = 0

  for (const p of participants) {
    const entry = phaseEntry(p, closing)
    if (entry === null) {
      notEntered++
      continue
    }
    const standing = phaseStanding(placementsByUser.get(p.user_id) ?? [], entry, closing, rules, {
      is_player: p.is_player,
      bettor_user_id: p.user_id,
    })
    people.push({
      user_id: p.user_id,
      display_name: p.display_name,
      entry,
      wagered: standing.wagered,
      pick_count: standing.pick_count,
      forfeit: standing.forfeit,
      refund: standing.refund,
      self_forfeit: standing.self_forfeit,
      complete: standing.complete,
      needs_a_text: !standing.complete,
      reason: reasonFor(standing, rules.min_picks_per_phase),
      standing,
    })
  }

  people.sort(
    (a, b) =>
      Number(b.needs_a_text) - Number(a.needs_a_text) ||
      Number(b.forfeit > 0) - Number(a.forfeit > 0) ||
      a.display_name.localeCompare(b.display_name)
  )

  const chase = people.filter((p) => p.needs_a_text)
  const line =
    chase.length === 0
      ? `Closing Phase ${closing} — nobody to chase, everyone entered is complete.`
      : `Closing Phase ${closing} — text these people: ` +
        chase.map((p) => `${p.display_name} (${p.reason})`).join(", ")

  return { closing_phase: closing, people, chase, not_entered: notEntered, line }
}
