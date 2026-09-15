// The entry request (Sprint 30 / PRD §12 A26): a member asks, once, to put
// money in — a total, split between the phases by a slider — and is sent to
// Venmo. An admin records the money and approves; the request is what the
// approve form prefills from.
//
// Pure module by design — no Supabase, no "@/" alias imports — so the
// node:test suite exercises the exact code the form, the API and the pages
// run. The route validates with the same functions the form snaps with, so
// the client can never offer a split the server refuses.
//
// The database keeps the "one time" promise (UNIQUE + no member UPDATE —
// migration 20260914000001); this module keeps the money rules: each phase
// asked for is a whole dollar within the tournament's bounds or exactly $0
// (sitting that phase out), at least one phase is asked for, and a phase whose
// deadline has passed can't be asked for at all.

import { phaseClosedByClock, type Phase, type PhaseClock } from "./phases.ts"
import type { TournamentRules } from "./validation.ts"

/** Where the money goes. The app moves none of it — this is a link, and the
 *  memo is shown as text beside it (PRD §10, amended Sept 14, 2026). */
export const VENMO_URL = "https://venmo.com/u/AndrewLong99"
export const VENMO_MEMO = "golf"

export type EntryRequestInput = {
  phase1: number
  phase2: number
  isPlayer: boolean
}

// ---------------------------------------------------------------------------
// The window — which phases can still be asked for
// ---------------------------------------------------------------------------

export type RequestWindow = {
  /** Phases that can still be requested, in order. */
  phases: Phase[]
  state: "open" | "phase2_only" | "closed"
}

/**
 * A phase whose deadline has passed would be money with nothing to wager on,
 * so it drops out of the form; once Phase 2 has closed, or the tournament is
 * completed, the form is closed. An admin can still record a late entry by
 * hand on /admin/people.
 */
export function requestWindow(
  clock: PhaseClock,
  now: Date,
  options: { completed?: boolean } = {}
): RequestWindow {
  if (options.completed) return { phases: [], state: "closed" }
  const phases = ([1, 2] as const).filter((phase) => !phaseClosedByClock(phase, clock, now))
  if (phases.length === 2) return { phases, state: "open" }
  if (phases.length === 1 && phases[0] === 2) return { phases, state: "phase2_only" }
  return { phases: [], state: "closed" }
}

// ---------------------------------------------------------------------------
// Validation — the same rules the form snaps to
// ---------------------------------------------------------------------------

function phaseError(
  phase: Phase,
  amount: number,
  rules: TournamentRules,
  window: RequestWindow
): string | null {
  if (!Number.isInteger(amount) || amount < 0)
    return `Phase ${phase} entry must be a whole-dollar amount.`
  if (amount === 0) return null
  if (!window.phases.includes(phase))
    return `Phase ${phase} has closed — it can't be requested any more.`
  if (amount < rules.entry_fee_min || amount > rules.entry_fee_max)
    return `Phase ${phase} entry must be between $${rules.entry_fee_min} and $${rules.entry_fee_max}, or $0 to sit Phase ${phase} out.`
  return null
}

/** Every reason the request can't be made, as sentences. Empty = fine. */
export function validateEntryRequest(
  input: EntryRequestInput,
  rules: TournamentRules,
  window: RequestWindow
): string[] {
  if (window.state === "closed") return ["Entry requests are closed — talk to an admin."]
  const errors: string[] = []
  const e1 = phaseError(1, input.phase1, rules, window)
  const e2 = phaseError(2, input.phase2, rules, window)
  if (e1) errors.push(e1)
  if (e2) errors.push(e2)
  if (errors.length === 0 && input.phase1 + input.phase2 <= 0)
    errors.push("Request at least one phase.")
  return errors
}

// ---------------------------------------------------------------------------
// The slider's arithmetic
// ---------------------------------------------------------------------------

/** The smallest and largest totals the form can ask for. */
export function totalBounds(
  rules: TournamentRules,
  window: RequestWindow
): { min: number; max: number } {
  if (window.phases.length === 0) return { min: 0, max: 0 }
  return { min: rules.entry_fee_min, max: rules.entry_fee_max * window.phases.length }
}

function inRange(amount: number, rules: TournamentRules): boolean {
  return amount >= rules.entry_fee_min && amount <= rules.entry_fee_max
}

/**
 * The Phase 1 amounts a given total can legally be split at: $0 (all of it in
 * Phase 2), all of it (Phase 2 sat out), or any split where BOTH halves are
 * inside the per-phase bounds. A $30 total can't be split at all; a $70 total
 * gives Phase 1 anywhere from $20 to $50.
 */
export function legalSplits(
  total: number,
  rules: TournamentRules,
  window: RequestWindow
): number[] {
  if (!Number.isInteger(total) || total <= 0) return []
  const can1 = window.phases.includes(1)
  const can2 = window.phases.includes(2)
  const out = new Set<number>()
  if (can2 && inRange(total, rules)) out.add(0)
  if (can1 && inRange(total, rules)) out.add(total)
  if (can1 && can2) {
    for (let p1 = rules.entry_fee_min; p1 <= rules.entry_fee_max; p1++) {
      if (inRange(total - p1, rules)) out.add(p1)
    }
  }
  return [...out].sort((a, b) => a - b)
}

/** The nearest legal Phase 1 amount to where the slider was dragged; ties go
 *  to the lower amount. 0 when nothing about the total is legal. */
export function snapSplit(
  total: number,
  phase1: number,
  rules: TournamentRules,
  window: RequestWindow
): number {
  const legal = legalSplits(total, rules, window)
  if (legal.length === 0) return 0
  let best = legal[0]
  for (const candidate of legal) {
    if (Math.abs(candidate - phase1) < Math.abs(best - phase1)) best = candidate
  }
  return best
}

// ---------------------------------------------------------------------------
// Where a member stands — drives the tile, the budget header and the form
// ---------------------------------------------------------------------------

export type EntryStatus =
  /** No request and no entry recorded: the warning icon, and the form. */
  | "none"
  /** Asked, not yet approved: the Venmo link again, no form. */
  | "requested"
  /** An admin recorded an entry in at least one phase: money is in. */
  | "entered"

function entered(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false
  const n = Number(value)
  return Number.isFinite(n) && n > 0
}

export function entryStatus(
  participant: { phase1_entry_fee?: unknown; phase2_entry_fee?: unknown } | null,
  request: unknown | null
): EntryStatus {
  if (participant && (entered(participant.phase1_entry_fee) || entered(participant.phase2_entry_fee)))
    return "entered"
  if (request) return "requested"
  return "none"
}

/** "Phase 1 $30 · Phase 2 $30", or "Phase 2 $20 only". */
export function describeRequest(request: { phase1_amount: number; phase2_amount: number }): string {
  const parts: string[] = []
  if (request.phase1_amount > 0) parts.push(`Phase 1 $${request.phase1_amount}`)
  if (request.phase2_amount > 0) parts.push(`Phase 2 $${request.phase2_amount}`)
  if (parts.length === 1) return `${parts[0]} only`
  return parts.join(" · ")
}

// ---------------------------------------------------------------------------
// Request-body parsing
// ---------------------------------------------------------------------------

export type ParsedEntryRequest =
  | { ok: true; value: EntryRequestInput }
  | { ok: false; error: string }

/** Shape check only — the amounts are validateEntryRequest's job. */
export function parseEntryRequestBody(body: unknown): ParsedEntryRequest {
  if (typeof body !== "object" || body === null)
    return { ok: false, error: "Request body must be JSON." }
  const { phase1, phase2, isPlayer } = body as Record<string, unknown>
  const p1 = Number(phase1 ?? 0)
  const p2 = Number(phase2 ?? 0)
  if (!Number.isFinite(p1) || !Number.isFinite(p2))
    return { ok: false, error: "Phase amounts must be numbers." }
  if (isPlayer !== undefined && typeof isPlayer !== "boolean")
    return { ok: false, error: "isPlayer must be true or false." }
  return { ok: true, value: { phase1: p1, phase2: p2, isPlayer: isPlayer !== false } }
}
