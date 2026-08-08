// Bet-menu filtering (Sprint 24 / #104).
//
// Pure module by design — no React, no Supabase, no "@/" alias imports — so
// the defaulting rules are unit-tested rather than trusted. The menu component
// owns the clicks; this owns what the clicks mean.
//
// WHAT CHANGED AND WHY. /bets carried three filter patterns at once: an
// All/Open/Closed triple, a round tab strip, and a multi-select category chip
// row. They combined freely, which is how you land on an empty page and have
// to work out which of three controls emptied it. Pat's read from the Jul 31
// dry run was simply that it is harder to use than it should be.
//
// THE MODEL NOW.
//
//   1. STATUS is a view, not a filter — binary open/closed, and it always
//      partitions the menu. There is no "all", because "all" is what made a
//      closed bet and an open bet sit in one list looking alike.
//
//   2. Exactly ONE secondary filter is active at a time: a round, or a
//      category, or neither. Never both. Picking a round clears any category
//      and vice versa. That is the literal reading of "one filter at a time",
//      and it is what makes the next property hold.
//
//   3. NO SELECTABLE OPTION CAN EMPTY THE PAGE. Every round and category
//      offered is derived from the bets actually present in the current status
//      view, so each one is guaranteed to match at least one bet. Combined
//      with (2) — no intersections to go empty — the "no bets match" state
//      becomes unreachable rather than merely unlikely.

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

/** The binary view. "closed" folds in settled bets — a bet's status is never
 * "resolved", that's derived per pick at render. */
export type StatusView = "open" | "closed"

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
// Defaulting
// ---------------------------------------------------------------------------

export function matchesStatus(view: StatusView, betStatus: string): boolean {
  return view === "open" ? betStatus === "open" : betStatus !== "open"
}

/** Every bet in the tree, flattened. */
export function flattenBets<B extends FilterableBet>(
  phases: FilterablePhase<B>[]
): B[] {
  return phases.flatMap((p) =>
    p.rounds.flatMap((r) => r.categories.flatMap((c) => c.bets))
  )
}

/**
 * Which view the menu opens on.
 *
 * Open if there is anything open to bet on, otherwise closed — and this is
 * computed from the bets on the page, never from the phase number. During the
 * tournament Phase 1 is closed while Phase 2 is open, so BOTH states exist at
 * once; "default to open" has to mean "open bets exist", not "phase 1", or the
 * menu opens on a dead view in the middle of the weekend.
 *
 * An empty menu defaults to open — the book before anything is published, and
 * the state the page's own empty state describes.
 */
export function defaultStatusView<B extends FilterableBet>(
  phases: FilterablePhase<B>[]
): StatusView {
  const bets = flattenBets(phases)
  // Closed only when there is something to show and none of it is open. An
  // empty menu stays open rather than falling through to a closed view of
  // nothing — /bets short-circuits to its own empty state before this is
  // reachable, but the rule shouldn't depend on that staying true.
  if (bets.length === 0) return "open"
  return bets.some((b) => matchesStatus("open", b.status)) ? "open" : "closed"
}

/** Whether the open/closed toggle is worth rendering at all: only when the
 * menu actually holds both kinds. */
export function showStatusToggle<B extends FilterableBet>(
  phases: FilterablePhase<B>[]
): boolean {
  const bets = flattenBets(phases)
  return (
    bets.some((b) => matchesStatus("open", b.status)) &&
    bets.some((b) => matchesStatus("closed", b.status))
  )
}

// ---------------------------------------------------------------------------
// Contextual options — derived from the current view, so every one of them
// matches at least one bet.
// ---------------------------------------------------------------------------

/** Rounds present in the given view, in menu order (phases arrive sorted). */
export function availableRounds<B extends FilterableBet>(
  phases: FilterablePhase<B>[],
  view: StatusView
): string[] {
  const seen = new Set<string>()
  const list: string[] = []
  for (const p of phases)
    for (const r of p.rounds) {
      if (seen.has(r.round)) continue
      if (r.categories.some((c) => c.bets.some((b) => matchesStatus(view, b.status)))) {
        seen.add(r.round)
        list.push(r.round)
      }
    }
  return list
}

/** Categories present in the given view, in PRD §6 order with unknowns last. */
export function availableCategories<B extends FilterableBet>(
  phases: FilterablePhase<B>[],
  view: StatusView
): string[] {
  const seen = new Set<string>()
  for (const p of phases)
    for (const r of p.rounds)
      for (const c of r.categories)
        if (c.bets.some((b) => matchesStatus(view, b.status))) seen.add(c.name)
  return CATEGORY_ORDER.filter((c) => seen.has(c)).concat(
    [...seen].filter((c) => !CATEGORY_ORDER.includes(c)).sort()
  )
}

/**
 * Whether a facet still selects something in the given view — used to drop a
 * stale selection when the status toggle flips. Without this, filtering to
 * "Round 3" and then switching to Closed leaves a selection that matches
 * nothing, which is exactly the empty page this refactor removes.
 */
export function facetIsAvailable<B extends FilterableBet>(
  phases: FilterablePhase<B>[],
  view: StatusView,
  facet: Facet
): boolean {
  if (facet.kind === "all") return true
  if (facet.kind === "round")
    return availableRounds(phases, view).includes(facet.value)
  return availableCategories(phases, view).includes(facet.value)
}

/** Reset a facet that no longer applies, keeping one that does. */
export function reconcileFacet<B extends FilterableBet>(
  phases: FilterablePhase<B>[],
  view: StatusView,
  facet: Facet
): Facet {
  return facetIsAvailable(phases, view, facet) ? facet : ALL_FACET
}

// ---------------------------------------------------------------------------
// The filter itself
// ---------------------------------------------------------------------------

/**
 * Apply the view and the single facet, dropping categories, rounds and phases
 * that end up empty so the menu never renders a bare heading.
 */
export function filterPhases<B extends FilterableBet>(
  phases: FilterablePhase<B>[],
  view: StatusView,
  facet: Facet
): FilterablePhase<B>[] {
  return phases
    .map((p) => ({
      phase: p.phase,
      rounds: p.rounds
        .filter((r) => facet.kind !== "round" || r.round === facet.value)
        .map((r) => ({
          round: r.round,
          categories: r.categories
            .filter((c) => facet.kind !== "category" || c.name === facet.value)
            .map((c) => ({
              name: c.name,
              bets: c.bets.filter((b) => matchesStatus(view, b.status)),
            }))
            .filter((c) => c.bets.length > 0),
        }))
        .filter((r) => r.categories.length > 0),
    }))
    .filter((p) => p.rounds.length > 0)
}
