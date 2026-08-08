// House rules (Sprint 23 / #100): parse, validate and explain the eight rule
// parameters on the tournaments row before an admin writes them back.
//
// Pure module by design — no Supabase, no "@/" alias imports — so the
// node:test suite exercises the exact code the API runs.
//
// Two jobs, and the second is the one Pat actually asked for:
//
//   1. validateTournamentRules — refuse values that are nonsense (a minimum
//      above the maximum, a percentage of 5.0) or that quietly make the
//      tournament unplayable (a max single bet that floors to $0, an entry fee
//      no legal slate of wagers can add up to).
//   2. ruleLimitsPreview — show the DERIVED limits. "$25 → $12 because the
//      code floors, $50 → $20 because the cap binds" is what an admin reasons
//      about, and it is not legible from the raw parameters. Built by calling
//      maxSingleBet/maxSelfBet from lib/validation.ts — the same functions the
//      placement path enforces with, so the preview cannot drift from reality.
//
// What this module deliberately does NOT do: re-check placed wagers. Changing
// a rule never retroactively invalidates a wager — whatever stands, stands
// (PRD §12 Q3). The UI says so; nothing here reshapes compliance.

import { maxSelfBet, maxSingleBet, type TournamentRules } from "./validation.ts"

/** The editable rule fields, in the order the form shows them. The deprecated
 * `min_picks_per_phase` is NOT here — Sprint 22 superseded it and nothing
 * reads it (#118 drops the column). */
export const RULE_INT_FIELDS = [
  "entry_fee_min",
  "entry_fee_max",
  "min_picks_per_tournament",
  "max_picks_per_phase",
  "max_single_bet_cap",
  "max_self_bet_cap",
] as const

export const RULE_PCT_FIELDS = ["max_single_bet_pct", "max_self_bet_pct"] as const

/** Human labels, so the form and the error messages agree on what to call each
 * parameter. */
export const RULE_LABELS: Record<keyof TournamentRules, string> = {
  entry_fee_min: "Minimum entry fee",
  entry_fee_max: "Maximum entry fee",
  min_picks_per_tournament: "Minimum picks (both phases combined)",
  max_picks_per_phase: "Maximum picks per phase",
  max_single_bet_pct: "Max single bet (% of entry)",
  max_single_bet_cap: "Max single bet (hard cap)",
  max_self_bet_pct: "Max total on yourself (% of entry)",
  max_self_bet_cap: "Max total on yourself (hard cap)",
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export type ParsedRules =
  | { ok: true; value: TournamentRules }
  | { ok: false; error: string }

/**
 * Shape check only — every field present and numeric. The values themselves
 * are validateTournamentRules's job, so a bad number produces the rule
 * message rather than a generic parse error.
 */
export function parseRulesBody(body: unknown): ParsedRules {
  if (typeof body !== "object" || body === null)
    return { ok: false, error: "Request body must be JSON." }
  const b = body as Record<string, unknown>

  const value = {} as TournamentRules
  for (const field of [...RULE_INT_FIELDS, ...RULE_PCT_FIELDS]) {
    const raw = b[field]
    if (raw === undefined || raw === null || raw === "")
      return { ok: false, error: `${RULE_LABELS[field]} is required.` }
    const n = Number(raw)
    if (!Number.isFinite(n))
      return { ok: false, error: `${RULE_LABELS[field]} must be a number.` }
    value[field] = n
  }
  return { ok: true, value }
}

// ---------------------------------------------------------------------------
// Validation of the values themselves
// ---------------------------------------------------------------------------

/** Percentages are stored as numeric(3,2), so more than two decimals silently
 * rounds in the database — refuse it here instead. */
function hasAtMostTwoDecimals(n: number): boolean {
  return Math.abs(n * 100 - Math.round(n * 100)) < 1e-9
}

/**
 * Fat-finger ceilings. These are NOT house rules — they're a guard against a
 * stray zero, which is why they're an order of magnitude past anything this
 * pool would ever use. Without them a mistyped entry fee is saved happily and
 * then governs real placements.
 */
const SANE_MAX_DOLLARS = 10_000
const SANE_MAX_PICKS = 100

/**
 * Every reason these values can't be saved, as human-readable strings. Empty
 * array = fine to write.
 */
export function validateTournamentRules(rules: TournamentRules): string[] {
  const errors: string[] = []

  for (const field of RULE_INT_FIELDS) {
    const value = rules[field]
    const isPickCount =
      field === "min_picks_per_tournament" || field === "max_picks_per_phase"
    const ceiling = isPickCount ? SANE_MAX_PICKS : SANE_MAX_DOLLARS
    if (!Number.isInteger(value))
      errors.push(`${RULE_LABELS[field]} must be a whole number.`)
    else if (value < 1) errors.push(`${RULE_LABELS[field]} must be at least 1.`)
    else if (value > ceiling)
      errors.push(
        `${RULE_LABELS[field]} is ${value} — that looks like a typo. The most this accepts is ${ceiling}.`
      )
  }

  for (const field of RULE_PCT_FIELDS) {
    const value = rules[field]
    if (!(value > 0) || value > 1)
      errors.push(
        `${RULE_LABELS[field]} must be between 0 and 1 — 0.5 means half the entry fee.`
      )
    else if (!hasAtMostTwoDecimals(value))
      errors.push(`${RULE_LABELS[field]} can have at most two decimal places.`)
  }

  // Bail before the derived checks if anything above is unusable — deriving a
  // limit from a negative percentage produces a confusing second error.
  if (errors.length > 0) return errors

  if (rules.entry_fee_min > rules.entry_fee_max)
    errors.push(
      `The minimum entry fee ($${rules.entry_fee_min}) can't be above the maximum ($${rules.entry_fee_max}).`
    )

  // The maximum is per phase, the minimum spans BOTH phases combined (PRD §7
  // rule 2's deliberate asymmetry, Sprint 22 / #96) — so the minimum has to
  // stay reachable inside two phases' worth of picks.
  const reachablePicks = 2 * rules.max_picks_per_phase
  if (rules.min_picks_per_tournament > reachablePicks)
    errors.push(
      `Nobody could reach ${rules.min_picks_per_tournament} picks: the maximum is ${rules.max_picks_per_phase} per phase, so ${reachablePicks} across both is the ceiling.`
    )

  if (errors.length > 0) return errors

  // Derived-limit traps: values that are individually legal but leave the
  // tournament unplayable. Both use the real enforcement functions.
  const smallestSingle = maxSingleBet(rules.entry_fee_min, rules)
  if (smallestSingle < 1)
    errors.push(
      `At the $${rules.entry_fee_min} minimum entry, the biggest allowed bet works out to $${smallestSingle} — raise the percentage or the minimum entry.`
    )

  const biggestSingle = maxSingleBet(rules.entry_fee_max, rules)
  const mostWagerable = reachablePicks * biggestSingle
  if (mostWagerable < rules.entry_fee_max)
    errors.push(
      `A $${rules.entry_fee_max} entry could never be wagered in full: ${reachablePicks} picks at $${biggestSingle} each tops out at $${mostWagerable}, and the total has to hit the entry fee exactly.`
    )

  return errors
}

// ---------------------------------------------------------------------------
// The derived-limits preview
// ---------------------------------------------------------------------------

export type RuleLimitRow = {
  entry_fee: number
  max_single_bet: number
  max_self_bet: number
}

export type RuleLimitsPreview = {
  rows: RuleLimitRow[]
  /** Smallest entry fee in range at which the single-bet CAP binds instead of
   * the percentage — null if the percentage always wins. */
  single_cap_binds_at: number | null
  self_cap_binds_at: number | null
}

/** A table longer than this stops being glanceable and starts being a wall. */
const MAX_PREVIEW_ROWS = 12

/**
 * Sample entry fees: the two bounds plus the round $5 steps between them, so
 * the table reads at a glance over a $20–$50 range instead of listing 31 rows.
 *
 * The step widens rather than the row count growing. This function runs on
 * every keystroke in the rules form, against values the admin is still
 * half-way through typing — a fixed $5 step means a mistyped "$1000000" max
 * builds a 200,000-row table and hangs the tab.
 */
function sampleEntryFees(min: number, max: number): number[] {
  if (min >= max) return [min]
  // Divide by the INTERIOR row budget: min and max are always added on top of
  // whatever the loop produces, so they each need a slot reserved.
  const step = Math.max(5, Math.ceil((max - min) / (MAX_PREVIEW_ROWS - 2)))
  const fees = new Set<number>([min])
  for (let fee = Math.ceil(min / step) * step; fee < max; fee += step) {
    if (fee > min) fees.add(fee)
  }
  fees.add(max)
  return [...fees].sort((a, b) => a - b)
}

/**
 * Smallest entry fee at which the hard cap binds instead of the percentage —
 * i.e. the smallest f where floor(pct × f) >= cap. Since cap is an integer
 * that reduces to f >= cap / pct, so it's one division rather than a walk over
 * every dollar in the range (same reason as above: this runs while typing).
 * Null when the cap never binds inside [min, max].
 */
function capBindsAt(
  pct: number,
  cap: number,
  min: number,
  max: number
): number | null {
  if (!(pct > 0)) return null
  // Nudge before ceil so an exact quotient (20 / 0.5 = 40) isn't pushed to 41
  // by floating-point drift.
  const threshold = Math.ceil(cap / pct - 1e-9)
  if (threshold > max) return null
  return Math.max(threshold, min)
}

/**
 * What the parameters actually mean, per entry fee. Both columns come from
 * lib/validation.ts's own maxSingleBet/maxSelfBet, floors and caps included.
 */
export function ruleLimitsPreview(rules: TournamentRules): RuleLimitsPreview {
  const min = Math.max(1, Math.floor(rules.entry_fee_min))
  const max = Math.max(min, Math.floor(rules.entry_fee_max))

  const rows = sampleEntryFees(min, max).map((entry_fee) => ({
    entry_fee,
    max_single_bet: maxSingleBet(entry_fee, rules),
    max_self_bet: maxSelfBet(entry_fee, rules),
  }))

  return {
    rows,
    single_cap_binds_at: capBindsAt(
      rules.max_single_bet_pct,
      rules.max_single_bet_cap,
      min,
      max
    ),
    self_cap_binds_at: capBindsAt(
      rules.max_self_bet_pct,
      rules.max_self_bet_cap,
      min,
      max
    ),
  }
}
