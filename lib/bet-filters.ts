// Bet-menu filtering (Sprint 24 / #104, re-cut in Sprint 26 / #193).
//
// Pure module by design — no React, no Supabase, no "@/" alias imports — so the
// defaulting rules are unit-tested rather than trusted. The menu component owns
// the clicks; this owns what the clicks mean.
//
// ---------------------------------------------------------------------------
// WHAT SPRINT 24 BUILT, AND WHY SPRINT 26 CHANGED THE AXIS
// ---------------------------------------------------------------------------
//
// /bets used to carry three filter patterns at once: an All/Open/Closed triple,
// a round tab strip, and a multi-select category chip row. They combined
// freely, which is how you land on an empty page and have to work out which of
// three controls emptied it. Sprint 24 replaced that with a model whose header
// argued, at length, that STATUS was the right primary axis — a *view* that
// always partitioned the menu, never a filter — precisely so a closed bet and
// an open bet could never sit in one list looking alike.
//
// Pat drove the menu again in September and said the axis names the wrong
// thing. The weekend is organised around Phase 1 and Phase 2; nobody stands on
// a tee box thinking in open-versus-closed. His words: "instead of open and
// closed toggle, it should instead be a phase 1 and phase 2 toggle. If phase 2
// bets are hidden, then just say that phase 2 isn't open yet."
//
// So the primary axis is now the PHASE, and the cost is real and paid for
// elsewhere rather than denied here (PRD §12 A19). Inside a phase, open and
// closed bets DO now sit in one list — mid-tournament, Phase 1 holds closed,
// revealed Round 1 bets beside Tournament bets the sheet still marks open.
// Three things in the menu keep that legible without a second control:
// wagerable bets sort above closed ones, every card carries a status badge
// (open cards never used to), and the badge beside the toggle reports the
// selected phase's own state.
//
// ---------------------------------------------------------------------------
// THE MODEL NOW
// ---------------------------------------------------------------------------
//
//   1. PHASE is the view. Both tabs always render, including a phase with
//      nothing published — that empty tab IS the "Phase 2 isn't open yet"
//      message Pat asked for, not a failure state.
//
//   2. Exactly ONE secondary facet is active at a time: a round, or a category,
//      or neither. Never both. Since Sprint 26 they share a single chip row,
//      which is the honest rendering of a model that was always single-select.
//
//   3. NO OFFERED FACET CAN EMPTY THE PAGE. Every round and category chip is
//      derived from the bets actually present in the selected phase, so each
//      one matches at least one bet. This is the property #104 was really
//      about, and it survives the axis change one level down: the PHASE may
//      legitimately be empty (see 1), the CHIPS may not.

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

/** The one active secondary filter, or none. */
export type Facet =
  | { kind: "all" }
  | { kind: "round"; value: string }
  | { kind: "category"; value: string }

export const ALL_FACET: Facet = { kind: "all" }

/** Menu display order for categories (PRD §6). */
export const CATEGORY_ORDER = [
  "Top Finisher",
  "Top X Finisher",
  "Match",
  "Group Match",
  "Prop Bet",
]

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
// Contextual options — derived from the selected phase, so every one of them
// matches at least one bet.
// ---------------------------------------------------------------------------

/** Rounds present in the given phase, in menu order (the tree arrives sorted). */
export function availableRounds<B extends FilterableBet>(
  phases: FilterablePhase<B>[],
  phase: Phase
): string[] {
  const seen = new Set<string>()
  const list: string[] = []
  for (const p of phases) {
    if (p.phase !== phase) continue
    for (const r of p.rounds) {
      if (seen.has(r.round)) continue
      if (r.categories.some((c) => c.bets.length > 0)) {
        seen.add(r.round)
        list.push(r.round)
      }
    }
  }
  return list
}

/** Categories present in the given phase, in PRD §6 order with unknowns last. */
export function availableCategories<B extends FilterableBet>(
  phases: FilterablePhase<B>[],
  phase: Phase
): string[] {
  const seen = new Set<string>()
  for (const p of phases) {
    if (p.phase !== phase) continue
    for (const r of p.rounds)
      for (const c of r.categories) if (c.bets.length > 0) seen.add(c.name)
  }
  return CATEGORY_ORDER.filter((c) => seen.has(c)).concat(
    [...seen].filter((c) => !CATEGORY_ORDER.includes(c)).sort()
  )
}

/**
 * Whether a facet still selects something in the given phase — used to drop a
 * stale selection when the phase toggle flips. Without this, filtering to
 * "Round 1" and then switching to Phase 2 leaves a selection that matches
 * nothing, which is exactly the empty page this model exists to prevent. Round
 * 1 is a Phase 1 round and Round 3 a Phase 2 one (ADR 0001 §4), so this fires
 * on essentially every round facet the moment the tab changes.
 */
export function facetIsAvailable<B extends FilterableBet>(
  phases: FilterablePhase<B>[],
  phase: Phase,
  facet: Facet
): boolean {
  if (facet.kind === "all") return true
  if (facet.kind === "round")
    return availableRounds(phases, phase).includes(facet.value)
  return availableCategories(phases, phase).includes(facet.value)
}

/** Reset a facet that no longer applies, keeping one that does. */
export function reconcileFacet<B extends FilterableBet>(
  phases: FilterablePhase<B>[],
  phase: Phase,
  facet: Facet
): Facet {
  return facetIsAvailable(phases, phase, facet) ? facet : ALL_FACET
}

// ---------------------------------------------------------------------------
// The filter itself
// ---------------------------------------------------------------------------

/**
 * Keep the selected phase and apply the single facet, dropping categories and
 * rounds that end up empty so the menu never renders a bare heading.
 *
 * Returns at most one phase. An unpublished phase returns `[]` — the caller
 * renders the "isn't open yet" state rather than treating it as an error.
 */
export function filterPhases<B extends FilterableBet>(
  phases: FilterablePhase<B>[],
  phase: Phase,
  facet: Facet
): FilterablePhase<B>[] {
  return phases
    .filter((p) => p.phase === phase)
    .map((p) => ({
      phase: p.phase,
      rounds: p.rounds
        .filter((r) => facet.kind !== "round" || r.round === facet.value)
        .map((r) => ({
          round: r.round,
          categories: r.categories
            .filter((c) => facet.kind !== "category" || c.name === facet.value)
            .filter((c) => c.bets.length > 0),
        }))
        .filter((r) => r.categories.length > 0),
    }))
    .filter((p) => p.rounds.length > 0)
}
