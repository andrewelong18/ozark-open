// House rules (Sprint 23 / #100): parse, validate and explain the rule
// parameters on the tournaments row before an admin writes them back.
//
// Pure module by design — no Supabase, no "@/" alias imports — so the
// node:test suite exercises the exact code the API runs.
//
// Five parameters since Sprint 30 (ADR 0002): the entry bounds (per phase),
// the pick minimum (per phase, no maximum), the flat max single bet, and the
// self-bet share of the phase entry (no hard cap). The eight-parameter shape
// this replaced carried a percentage-and-cap pair for the single bet and a
// hard cap on the self bet; Pat simplified both away.
//
// Two jobs, and the second is the one Pat actually asked for:
//
//   1. validateTournamentRules — refuse values that are nonsense (a minimum
//      above the maximum, a percentage of 5.0) or that quietly make the
//      tournament unplayable (a pick minimum no entry can hold at $1 a pick).
//   2. ruleLimitsPreview — show the DERIVED limit. "$20 → $5, $50 → $12 on
//      yourself, because the code floors" is what an admin reasons about, and
//      it is not legible from the raw percentage. Built by calling
//      maxSelfBet from lib/validation.ts — the same function the placement
//      path enforces with, so the preview cannot drift from reality.
//
// What this module deliberately does NOT do: re-check placed wagers. Changing
// a rule never retroactively invalidates a wager — whatever stands, stands
// (PRD §12 Q3). The UI says so; nothing here reshapes compliance.

import { maxSelfBet, type TournamentRules } from "./validation.ts"

/** The editable whole-dollar / count fields, in the order the form shows them. */
export const RULE_INT_FIELDS = [
  "entry_fee_min",
  "entry_fee_max",
  "min_picks_per_phase",
  "max_single_bet",
] as const

export const RULE_PCT_FIELDS = ["max_self_bet_pct"] as const

/** Human labels, so the form and the error messages agree on what to call each
 * parameter. */
export const RULE_LABELS: Record<keyof TournamentRules, string> = {
  entry_fee_min: "Minimum entry (per phase)",
  entry_fee_max: "Maximum entry (per phase)",
  min_picks_per_phase: "Minimum picks (per phase)",
  max_single_bet: "Max single bet",
  max_self_bet_pct: "Max on yourself (share of the phase entry)",
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
    const ceiling = field === "min_picks_per_phase" ? SANE_MAX_PICKS : SANE_MAX_DOLLARS
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
        `${RULE_LABELS[field]} must be between 0 and 1 — 0.25 means a quarter of the phase entry.`
      )
    else if (!hasAtMostTwoDecimals(value))
      errors.push(`${RULE_LABELS[field]} can have at most two decimal places.`)
  }

  // Bail before the derived checks if anything above is unusable — deriving a
  // limit from a negative percentage produces a confusing second error.
  if (errors.length > 0) return errors

  if (rules.entry_fee_min > rules.entry_fee_max)
    errors.push(
      `The minimum entry ($${rules.entry_fee_min}) can't be above the maximum ($${rules.entry_fee_max}).`
    )

  // The one derived trap left: a pick is at least $1 (PRD §7 rule 3), so the
  // per-phase minimum has to fit inside the smallest entry, or nobody at that
  // entry could ever be complete.
  if (rules.min_picks_per_phase > rules.entry_fee_min)
    errors.push(
      `Nobody could place ${rules.min_picks_per_phase} picks inside a $${rules.entry_fee_min} entry — a pick is at least $1, so the minimum entry has to be at least $${rules.min_picks_per_phase}.`
    )

  return errors
}

// ---------------------------------------------------------------------------
// The derived-limits preview
// ---------------------------------------------------------------------------

export type RuleLimitRow = {
  entry_fee: number
  max_self_bet: number
}

export type RuleLimitsPreview = {
  rows: RuleLimitRow[]
  /** The flat cap, the same on every row — named once above the table. */
  max_single_bet: number
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
 * What the parameters actually mean, per phase entry. The self-bet column
 * comes from lib/validation.ts's own maxSelfBet, floor included.
 */
export function ruleLimitsPreview(rules: TournamentRules): RuleLimitsPreview {
  const min = Math.max(1, Math.floor(rules.entry_fee_min))
  const max = Math.max(min, Math.floor(rules.entry_fee_max))

  const rows = sampleEntryFees(min, max).map((entry_fee) => ({
    entry_fee,
    max_self_bet: maxSelfBet(entry_fee, rules),
  }))

  return { rows, max_single_bet: rules.max_single_bet }
}
