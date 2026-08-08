// The phase clock (Sprint 25 / #106, #107) — when each betting window closes.
//
// Pure module by design — no Supabase, no "@/" alias imports — so the
// node:test suite exercises the exact code the API and the pages run.
//
// The deadline lives on the tournaments row and NOTHING here writes a bet's
// status; the spreadsheet upload remains that column's only writer (ADR 0001
// §5a). Wagering needs both:
//
//   bet.status = 'open'  AND  the bet's phase deadline hasn't passed
//
// so an upload can only ever OPEN a bet and the clock can only ever CLOSE a
// phase. They're different fields, so a sheet that still says `open` after the
// deadline doesn't reopen betting — and isn't silently reverted either.
//
// There is no scheduler. A phase "closes itself" because every read compares
// now() to a stored timestamp. `now` is always passed in rather than read from
// the ambient clock, so every state below is reachable in a test.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Phase = 1 | 2

/**
 * The clock columns from the tournaments row. Deliberately NOT folded into
 * TournamentRules: toTournamentRules() coerces every field with Number(), so a
 * timestamp landing there would become NaN — silently, the way a missing
 * column already has twice on this project.
 */
export type PhaseClock = {
  /** ISO timestamp, or null for "no deadline — never closes on the clock". */
  phase1_closes_at: string | null
  phase2_closes_at: string | null
  show_countdown: boolean
}

/**
 * What a phase looks like to a member right now.
 *
 * - `unpublished` — nothing to bet on yet (no visible bets in this phase).
 * - `open` — bets are open and the deadline hasn't passed.
 * - `closed` — the deadline passed, or every bet in it is closed.
 */
export type PhaseState = "unpublished" | "open" | "closed"

/** The minimum a bet has to expose for the clock to reason about it. */
export type PhaseBet = { phase: number; status: string }

// ---------------------------------------------------------------------------
// Reading the clock
// ---------------------------------------------------------------------------

/** The deadline for a phase, or null when none is set. */
export function deadlineFor(phase: Phase, clock: PhaseClock): Date | null {
  const raw = phase === 1 ? clock.phase1_closes_at : clock.phase2_closes_at
  if (!raw) return null
  const at = new Date(raw)
  return Number.isNaN(at.getTime()) ? null : at
}

/**
 * Has the phase's deadline passed? No deadline means never — that's the
 * pre-Sprint-25 behaviour, and the safe answer for a tournament nobody has
 * scheduled.
 *
 * The boundary is inclusive: at exactly 11:00:00 the phase is closed. A
 * deadline people are racing should not have an ambiguous final second.
 */
export function phaseClosedByClock(
  phase: Phase,
  clock: PhaseClock,
  now: Date
): boolean {
  const at = deadlineFor(phase, clock)
  return at !== null && now.getTime() >= at.getTime()
}

/**
 * The phase's state for display. Bets are the evidence for "has anything been
 * published", the clock is the authority on "can you still bet".
 *
 * Note the asymmetry: a phase whose bets are all closed reads `closed` even
 * with no deadline set, because that IS how a phase closed before this sprint
 * (and how the dry run closed one). The clock is an additional way to be
 * closed, never the only one.
 */
export function phaseState(
  phase: Phase,
  clock: PhaseClock,
  bets: PhaseBet[],
  now: Date
): PhaseState {
  // Hidden bets aren't published — the app ignores them entirely (ADR 0001 §5).
  const visible = bets.filter((b) => b.phase === phase && b.status !== "hidden")
  if (visible.length === 0) return "unpublished"
  if (phaseClosedByClock(phase, clock, now)) return "closed"
  return visible.some((b) => b.status === "open") ? "open" : "closed"
}

/**
 * Whether a wager can be placed on a bet right now — the one rule, in one
 * place, so the API and the UI cannot disagree about it.
 */
export function wageringOpen(
  bet: PhaseBet,
  clock: PhaseClock,
  now: Date
): boolean {
  if (bet.status !== "open") return false
  if (bet.phase !== 1 && bet.phase !== 2) return false
  return !phaseClosedByClock(bet.phase, clock, now)
}

/**
 * The next deadline still ahead of us, for the countdown. Phases are checked
 * in order so Phase 1 wins while both are pending. Null when nothing is
 * scheduled or everything has passed — the countdown renders nothing.
 */
export function nextDeadline(
  clock: PhaseClock,
  now: Date
): { phase: Phase; at: Date } | null {
  for (const phase of [1, 2] as const) {
    const at = deadlineFor(phase, clock)
    if (at !== null && now.getTime() < at.getTime()) return { phase, at }
  }
  return null
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/**
 * The dashboard's betting badge — the #107 fix. It used to read
 * tournaments.status, which has never gated betting (gameplan landmine #2), so
 * it showed a green "Betting Open" over an empty menu. Now it derives from the
 * same phase states /bets renders, and the four states are exactly the four
 * the sprint's "Done when" enumerates.
 */
export function bettingBadge(
  clock: PhaseClock,
  bets: PhaseBet[],
  now: Date
): { label: string; open: boolean } {
  const p1 = phaseState(1, clock, bets, now)
  const p2 = phaseState(2, clock, bets, now)

  if (p1 === "unpublished" && p2 === "unpublished")
    return { label: "Not open yet", open: false }
  if (p2 === "open") return { label: "Phase 2 open", open: true }
  if (p1 === "open") return { label: "Phase 1 open", open: true }
  if (p2 === "unpublished") return { label: "Phase 1 closed", open: false }
  return { label: "Betting closed", open: false }
}

/** "Thu Sept 24, 11:00 AM" in the tournament's own timezone — the deadline is
 *  a tee time in Missouri, not wherever the phone happens to be. */
export function formatDeadline(at: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
    timeZoneName: "short",
  }).format(at)
}
