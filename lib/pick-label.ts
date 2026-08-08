// Pick-label parsing (Sprint 24 / #102).
//
// Pure module by design — no Supabase, no "@/" alias imports, no React — so
// both the importer (node) and the menu (client component) can share it and
// the node:test suite exercises the exact code both run.
//
// WHY THIS IS ONE MODULE AND NOT TWO FUNCTIONS IN TWO FILES.
//
// A sheet pick label carries the golfer's stroke handicap: "Jake Kohne (E)",
// "Mike Yenzer (-10)". Two entirely different parts of the app strip it:
//
//   1. lib/import.ts, to match a pick to a person — the remainder is looked up
//      against users.display_name and stored as bet_picks.player_user_id.
//   2. The bet menu, to render the name and the handicap separately.
//
// If those two strips ever diverge, the failure is silent and money-adjacent:
// a label renders perfectly while quietly matching nothing, which nulls
// player_user_id — and the self-bet cap, the self-pick review flag and the
// opponent block (PRD §7) ALL key off that column. The bet would look right
// and stop being policed. So there is exactly one regex here, and both callers
// import it. Do not inline a second copy.

/** The stroke suffix: " (E)", " (-10)", " (+2)" at the end of a label. */
const STROKE_SUFFIX = /\s*\((E|[+-]?\d+)\)\s*$/i

/**
 * Strip the stroke notation off a pick label: "Steve Jones (-5)" → "Steve
 * Jones", "Mike Yenzer (E)" → "Mike Yenzer" (ADR 0001 §11).
 *
 * Labels with no suffix ("Field", "Yes", "No") come back unchanged — which is
 * what makes them match nothing and stay correctly unlinked.
 */
export function stripStrokeSuffix(label: string): string {
  return label.replace(STROKE_SUFFIX, "").trim()
}

/** A label split into the part that names a person and the part that doesn't. */
export type PickLabelParts = {
  /** The golfer's name — the string the importer matches on. */
  name: string
  /** The handicap as written in the sheet ("E", "-10"), or null if absent. */
  stroke: string | null
}

/**
 * Split a pick label for display: name and stroke badge.
 *
 * `name` is stripStrokeSuffix(label) BY CONSTRUCTION — same call, not a
 * parallel implementation — so what the menu shows as the name is always
 * exactly what the importer matched on.
 *
 * A label that is nothing but a suffix (a malformed "(E)") keeps the original
 * label as the name and reports no stroke: better a slightly odd row than a
 * nameless one.
 */
export function splitPickLabel(label: string): PickLabelParts {
  const match = label.match(STROKE_SUFFIX)
  const name = stripStrokeSuffix(label)
  if (!match || name === "") return { name: label.trim(), stroke: null }
  return { name, stroke: match[1] }
}
