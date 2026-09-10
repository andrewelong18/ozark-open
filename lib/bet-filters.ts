// Bet-menu filtering (Sprint 24 / #104, re-cut in Sprint 26 / #193, re-cut
// again Sept 10 2026 — PRD §12 A23).
//
// Pure module by design — no React, no Supabase, no "@/" alias imports — so the
// defaulting rules are unit-tested rather than trusted. The menu component owns
// the clicks; this owns what the clicks mean.
//
// ---------------------------------------------------------------------------
// THREE LEVELS, AND THE INVARIANT THAT DIED FOR THEM
// ---------------------------------------------------------------------------
//
// /bets has been re-cut three times and each cut is worth knowing, because this
// one gives up something the first two were built to protect.
//
// Sprint 24 found three filter patterns combining freely — All/Open/Closed, a
// round tab strip, a multi-select category row — which is how you land on an
// empty page and have to work out which of three controls emptied it. It
// replaced them with STATUS as a partitioning view plus exactly ONE secondary
// facet, and bought a real guarantee: NO SELECTABLE OPTION CAN EMPTY THE PAGE.
//
// Sprint 26 swapped the primary axis to the PHASE, because that is what the
// weekend is organised around, and merged rounds and categories into one chip
// row — honest, given only one of them could be active at a time. It kept
// #104's guarantee by deriving every chip from the bets present in the selected
// phase.
//
// Pat drove the menu on Sept 10 and rejected that too. He asked for three
// levels — phase, then round, then category — each behaving like a radio group,
// each independently selectable. That is flatly incompatible with the single
// facet, and it is incompatible with the guarantee: Phase 1 + Round 1 + Prop
// Bet is a combination a member can now assemble and it may match nothing.
//
// THE GUARANTEE IS GONE, KNOWINGLY, AND TWO THINGS PAY FOR IT:
//
//   1. THE ROWS ARE FIXED. Round options come from ROUNDS_BY_PHASE and category
//      options from CATEGORIES — hardcoded, not derived from loaded data. The
//      control surface no longer reshuffles as bets are published, which is
//      plausibly half of what Pat disliked about the derived chips.
//
//   2. THE EMPTY STATE IS DESIGNED, NOT INCIDENTAL. Sprint 26 shipped a "no
//      bets match this filter" screen it described as unreachable by
//      construction. It is now reachable, it names BOTH active conditions, and
//      it offers the tap that undoes them. It is a tested screen rather than an
//      apology.
//
// ---------------------------------------------------------------------------
// THE MODEL NOW
// ---------------------------------------------------------------------------
//
//   1. PHASE is the view, and is always exactly one. Both tabs always render,
//      including a phase with nothing published — that empty tab IS the
//      "Phase 2 isn't open yet" message Pat asked for, not a failure state.
//
//   2. ROUND and CATEGORY are independent, each exactly one value, each with an
//      explicit "all" member. A radio group with an "all" option is still a
//      radio group; without one there would be no way to see a whole phase.
//
//   3. A phase flip RECONCILES the round (Round 1 does not exist in Phase 2)
//      and always keeps the category (all five exist in both phases).

import {
  ROUNDS_BY_PHASE,
  type Category,
  type RoundKey,
} from "./bet-taxonomy.ts"
import type { Phase } from "./phases.ts"

// ---------------------------------------------------------------------------
// Shapes — structurally compatible with the menu's PhaseGroup tree, declared
// locally so this module stays free of component imports.
// ---------------------------------------------------------------------------

export type FilterableBet = { status: string }
export type FilterableCategory<B extends FilterableBet> = {
  name: string
  bets: B[]
}
export type FilterableRound<B extends FilterableBet> = {
  round: string
  categories: FilterableCategory<B>[]
}
export type FilterablePhase<B extends FilterableBet> = {
  phase: number
  rounds: FilterableRound<B>[]
}

/** The "no round chosen" / "no category chosen" member of each radio group. */
export const ALL = "all"
export type All = typeof ALL

/** The whole filter state: one value on each of the three levels. */
export type BetFilter = {
  phase: Phase
  round: RoundKey | All
  category: Category | All
}

/** The unfiltered view of a phase. */
export function allOf(phase: Phase): BetFilter {
  return { phase, round: ALL, category: ALL }
}

/** Is anything narrowing the phase right now? */
export function isNarrowed(filter: BetFilter): boolean {
  return filter.round !== ALL || filter.category !== ALL
}

// ---------------------------------------------------------------------------
// Status — no longer an axis, but still the thing a badge and the ordering ask
// about
// ---------------------------------------------------------------------------

/**
 * Is this bet still taking wagers, as far as its own status is concerned?
 *
 * The survivor of Sprint 24's `matchesStatus`. It is deliberately a question
 * about `bets.status` alone: the PHASE DEADLINE is the other half of whether a
 * wager can be placed (`wageringOpen()` in lib/phases.ts), and the menu sorts
 * and badges on that fuller answer. This is here for callers that only hold a
 * status string.
 *
 * Anything that isn't "open" reads closed — a bet's status is never "resolved"
 * (that's derived per pick at render), but nothing here should depend on that
 * staying true.
 */
export function isOpenBet(betStatus: string): boolean {
  return betStatus === "open"
}

// ---------------------------------------------------------------------------
// Reading the tree
// ---------------------------------------------------------------------------

/** Every bet in the tree, flattened. */
export function flattenBets<B extends FilterableBet>(
  phases: FilterablePhase<B>[]
): B[] {
  return phases.flatMap((p) =>
    p.rounds.flatMap((r) => r.categories.flatMap((c) => c.bets))
  )
}

/**
 * Does this phase have anything published?
 *
 * Hidden bets never reach the menu — /bets filters them out in the query — so
 * "no bets in this phase" means the phase is unpublished. The menu uses this to
 * choose between the bet list and the "Phase 2 isn't open yet" empty state, and
 * the tab renders either way.
 */
export function phaseHasBets<B extends FilterableBet>(
  phases: FilterablePhase<B>[],
  phase: Phase
): boolean {
  return phases.some(
    (p) =>
      p.phase === phase &&
      p.rounds.some((r) => r.categories.some((c) => c.bets.length > 0))
  )
}

// ---------------------------------------------------------------------------
// The options — STATIC. See the header: this is the change, not an oversight.
// ---------------------------------------------------------------------------

/**
 * The rounds a phase can hold, per ADR 0001 §4 — NOT the rounds it currently
 * holds. Phase 1 offers Round 1 before a single Round 1 bet is published,
 * because a filter row that grows as the tournament goes on is a filter row
 * that moves under your thumb.
 */
export function roundOptions(phase: Phase): RoundKey[] {
  return ROUNDS_BY_PHASE[phase]
}

/**
 * Whether a round can appear in a phase at all. Used to reconcile a stale
 * selection when the phase toggle flips.
 */
export function roundInPhase(phase: Phase, round: RoundKey | All): boolean {
  return round === ALL || roundOptions(phase).includes(round)
}

/**
 * Carry a filter across a phase change.
 *
 * The round is dropped when the new phase cannot hold it — Round 1 is a Phase 1
 * round and Round 3 a Phase 2 one, so this fires on essentially every round
 * selection the moment the tab changes. The category is ALWAYS kept: all five
 * categories exist in both phases, so a member who has drilled into Match stays
 * in Match, which is the whole point of a filter that survives navigation.
 */
export function reconcileFilter(filter: BetFilter, phase: Phase): BetFilter {
  return {
    phase,
    round: roundInPhase(phase, filter.round) ? filter.round : ALL,
    category: filter.category,
  }
}

// ---------------------------------------------------------------------------
// The filter itself
// ---------------------------------------------------------------------------

/**
 * Keep the selected phase and apply the round and category INDEPENDENTLY,
 * dropping categories and rounds that end up empty so the menu never renders a
 * bare heading.
 *
 * Returns at most one phase. An unpublished phase returns `[]`, and so now does
 * a combination that matches nothing — the caller distinguishes them with
 * `phaseHasBets()` and renders a different message for each.
 */
export function filterPhases<B extends FilterableBet>(
  phases: FilterablePhase<B>[],
  filter: BetFilter
): FilterablePhase<B>[] {
  return phases
    .filter((p) => p.phase === filter.phase)
    .map((p) => ({
      phase: p.phase,
      rounds: p.rounds
        .filter((r) => filter.round === ALL || r.round === filter.round)
        .map((r) => ({
          round: r.round,
          categories: r.categories
            .filter((c) => filter.category === ALL || c.name === filter.category)
            .filter((c) => c.bets.length > 0),
        }))
        .filter((r) => r.categories.length > 0),
    }))
    .filter((p) => p.rounds.length > 0)
}
