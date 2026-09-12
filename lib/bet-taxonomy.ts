// The bet menu's vocabulary: which rounds exist, which categories exist, and
// which rounds belong to which phase.
//
// Pure module by design — no React, no Supabase, no "@/" alias imports — so
// the importer, the server-side grouping, the client-side filters and the unit
// tests all read the SAME lists. Before this file they read four: CATEGORY_ORDER
// was declared twice (lib/bet-filters.ts and app/bets/page.tsx), ROUND_ORDER
// three times, ROUND_LABEL twice. Three stacked filter rows driven off
// hardcoded lists is exactly the change that must not add a fifth copy.
//
// ---------------------------------------------------------------------------
// WHY THE LISTS ARE HARDCODED RATHER THAN READ FROM THE DATABASE
// ---------------------------------------------------------------------------
//
// `bet_categories` is a TABLE with no CHECK constraint, so any row inserted
// into it used to become both an importable category and a visible filter chip.
// Pat drove the menu on Sept 10, 2026 and said "Medalist is not a bet category"
// — and he was right: PRD §6 names five, and Medalist is a bet TITLE
// ("Medalist - Round 1", filed under Top Finisher). CATEGORIES below is the
// contract; `validateSheet()` rejects a spreadsheet carrying anything else, and
// the menu never offers anything else.
//
// The table still exists and still holds the ids `bets.category_id` points at.
// What changed is that it is no longer the *authority* on which names are legal.

/** The five categories of PRD §6, in menu order. The contract, not a hint. */
export const CATEGORIES = [
  "Top Finisher",
  "Top X Finisher",
  "Match",
  "Group Match",
  "Prop Bet",
] as const

export type Category = (typeof CATEGORIES)[number]

export function isCategory(name: string): name is Category {
  return (CATEGORIES as readonly string[]).includes(name)
}

/**
 * Every round the `bets.round` CHECK permits.
 *
 * `round_2` is schema-legal and never released by policy (PRD §8.2) — it stays
 * here so a stray row still sorts and labels rather than falling off the page,
 * but it is absent from ROUNDS_BY_PHASE, so it is never offered as a filter.
 */
export type RoundKey = "tournament" | "round_1" | "round_2" | "round_3"

export const ROUND_ORDER: RoundKey[] = [
  "tournament",
  "round_1",
  "round_2",
  "round_3",
]

export const ROUND_LABEL: Record<string, string> = {
  tournament: "Tournament",
  round_1: "Round 1",
  round_2: "Round 2",
  round_3: "Round 3",
}

/**
 * Which rounds a phase can hold (ADR 0001 §4), stated the way Pat states it:
 * "There will never be a Round 3 bet for Phase 1 or a Round 1 bet for Phase 2."
 *
 * This is what makes the round filter row STATIC. Before Sept 10 the chips were
 * derived from the bets actually loaded, so the row reshuffled as the sheet was
 * uploaded; now Phase 1 always offers Tournament and Round 1, whether or not a
 * Round 1 bet has been published yet. The cost — an option that can select
 * nothing — is paid by the empty state, deliberately (PRD §12 A23).
 *
 * Order matches the section headings the list body renders below the row.
 */
export const ROUNDS_BY_PHASE: Record<1 | 2, RoundKey[]> = {
  1: ["tournament", "round_1"],
  2: ["tournament", "round_3"],
}

/** Sort key for a round, unknowns last. */
export function roundRank(round: string): number {
  const i = (ROUND_ORDER as readonly string[]).indexOf(round as RoundKey)
  return i === -1 ? ROUND_ORDER.length : i
}

/** Sort key for a category, unknowns last (a pre-Sept-10 row may carry one). */
export function categoryRank(category: string): number {
  const i = (CATEGORIES as readonly string[]).indexOf(category)
  return i === -1 ? CATEGORIES.length : i
}
