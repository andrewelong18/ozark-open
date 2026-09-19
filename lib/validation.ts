// Server-side wagering rules (PRD §7, §8.1) for bet placements. API routes
// call these before any write; client checks are UX, not security.
//
// Pure module by design — no Supabase, no "@/" alias imports — so the
// node:test suite exercises the exact code the API runs. Every limit is
// parameterized by the tournaments row (TournamentRules); nothing here
// hardcodes a dollar figure or pick count.
//
// SINCE SPRINT 30 (ADR 0002, PRD §12 A25) EVERYTHING IS PER PHASE. A bettor
// has one entry per phase they are in, each phase is its own pot, and every
// rule below reads the entry and the wagers of the phase the target bet is
// in — never the other phase, never a tournament-wide total. The one thing
// that spans both phases is the bettor's identity.
//
// Two groups per §8.1: per-placement rules hard-block a write
// (validatePlacement); the completeness picture is reported, never blocking
// (phaseStanding) — a participant is legitimately incomplete while still
// placing bets, and at close whatever stands, stands (Q3), with the money
// consequences ADR 0002 spells out (as amended by A28): once anything at all
// is wagered, the first $entry_fee_min is committed to the pot whether or not
// it was wagered, and the rest comes back; wagering nothing at all is never
// having entered, so the whole entry comes back; and self-bets count only up
// to their share of what was actually wagered.

import type { Phase } from "./phases.ts"

// ---------------------------------------------------------------------------
// Types (snake_case mirrors the DB rows so routes can pass them straight in)
// ---------------------------------------------------------------------------

/** The rule parameters from the tournaments row. */
export type TournamentRules = {
  /** Rule 1: bounds on EACH phase's entry. entry_fee_min doubles as the
   * forfeit floor: once a bettor has wagered anything in the phase, that much
   * of their entry funds the pot whether or not it was wagered (A28). */
  entry_fee_min: number
  entry_fee_max: number
  /** Rule 2: fewest wagered picks in each phase a bettor is entered in.
   * Never blocking; there is no maximum. */
  min_picks_per_phase: number
  /** Rule 4: the flat per-placement cap, in whole dollars. */
  max_single_bet: number
  /** Rule 5: the share of the PHASE entry allowed on yourself at placement
   * time, floored, with no hard cap. At close, only this share of what was
   * actually wagered is recognised (phaseStanding). */
  max_self_bet_pct: number
}

/** The participant placing the wager (users × tournament_participants). */
export type Bettor = {
  user_id: string
  /** Non-playing bettors are exempt from the self-bet cap (PRD §12 Q14). */
  is_player: boolean
  /** null = not entered in that phase (Sprint 30). */
  phase1_entry_fee: number | null
  phase2_entry_fee: number | null
}

/** The bettor's entry for a phase, or null when they aren't in it. */
export function phaseEntry(
  bettor: Pick<Bettor, "phase1_entry_fee" | "phase2_entry_fee">,
  phase: Phase
): number | null {
  const raw = phase === 1 ? bettor.phase1_entry_fee : bettor.phase2_entry_fee
  if (raw === null || raw === undefined) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** The pick being wagered on. */
export type TargetPick = {
  id: string
  player_user_id: string | null
}

/** The pick's parent bet, plus who its picks refer to (opponent check). */
export type TargetBet = {
  id: string
  status: "hidden" | "open" | "closed"
  phase: Phase
  /**
   * Whether this bet's phase deadline has passed (Sprint 25 / #106). Stamped
   * by buildPlacementContext from the tournaments row's clock — required, not
   * optional, so a caller that forgets it fails to compile rather than
   * silently accepting wagers after the close.
   */
  phase_closed: boolean
  /** From bet_categories: false for Match / Group Match. */
  allows_multiple_picks: boolean
  /** player_user_id of every pick in the bet (nulls included). */
  pick_player_user_ids: (string | null)[]
}

/**
 * One of the bettor's live placements (deleted_at IS NULL), across the whole
 * tournament — every rule filters to the phase it cares about.
 */
export type ExistingPlacement = {
  pick_id: string
  bet_id: string
  phase: Phase
  amount: number
  /** player_user_id of the placement's pick (self-bet totaling). */
  pick_player_user_id: string | null
}

export type PlacementContext = {
  bettor: Bettor
  pick: TargetPick
  bet: TargetBet
  /**
   * May include a placement on ctx.pick itself — that's an edit, and its
   * current amount is excluded from counts/totals before adding the new one.
   */
  existing: ExistingPlacement[]
}

// ---------------------------------------------------------------------------
// Derived limits
// ---------------------------------------------------------------------------

/** Max single bet: flat, the same at every entry (PRD §7 rule 4). Kept as a
 * function so the rules card and the preview read the rule the same way the
 * placement path enforces it. */
export function maxSingleBet(rules: TournamentRules): number {
  return rules.max_single_bet
}

/** Max total on yourself in one phase at placement time: pct of that phase's
 * entry, floored, uncapped (PRD §7 rule 5). $20 → $5, $50 → $12. */
export function maxSelfBet(entryFee: number, rules: TournamentRules): number {
  return Math.floor(rules.max_self_bet_pct * entryFee)
}

/** Self-pick = the pick refers to the bettor. Never true for unlinked picks
 * ("Field", "Yes"/"No" — PRD §12 Q10). Drives requires_admin_review. */
export function isSelfPick(pickPlayerUserId: string | null, bettorUserId: string): boolean {
  return pickPlayerUserId !== null && pickPlayerUserId === bettorUserId
}

// ---------------------------------------------------------------------------
// Per-placement rules — each returns a human-readable error, or null if OK
// ---------------------------------------------------------------------------

/** PRD §7 rule 1: a phase entry in whole dollars within the tournament's
 * bounds. Checked at approval and on the entry request (the schema CHECK only
 * enforces > 0). Names the phase when told which one. */
export function validateEntryFee(
  entryFee: number,
  rules: TournamentRules,
  phase?: Phase
): string | null {
  const subject = phase ? `Phase ${phase} entry` : "Entry fee"
  if (!Number.isInteger(entryFee)) return `${subject} must be a whole-dollar amount.`
  if (entryFee < rules.entry_fee_min || entryFee > rules.entry_fee_max)
    return `${subject} must be between $${rules.entry_fee_min} and $${rules.entry_fee_max}.`
  return null
}

/**
 * PRD §8.1: wagering only while the bet is open AND its phase deadline hasn't
 * passed (ADR 0001 §5a). Two independent gates, reported separately — "the
 * phase closed" and "this bet isn't open" send an admin to different places.
 */
export function validateBetOpen(
  bet: Pick<TargetBet, "status" | "phase" | "phase_closed">
): string | null {
  if (bet.phase_closed) return `Phase ${bet.phase} is closed — the deadline has passed.`
  return bet.status === "open" ? null : "This bet is not open for wagering."
}

/** Sprint 30: you can only wager in a phase you are entered in. The route
 * refuses this first with identity-aware wording (a member vs. an admin acting
 * for one); this is the rule itself, so the pure path can't forget it. */
export function validatePhaseEntry(ctx: PlacementContext): string | null {
  if (phaseEntry(ctx.bettor, ctx.bet.phase) === null)
    return `You're not entered in Phase ${ctx.bet.phase}.`
  return null
}

/** PRD §7 rule 3: whole dollars, $1 minimum. */
export function validateAmount(amount: number): string | null {
  if (!Number.isInteger(amount)) return "Bet amounts must be whole dollars."
  if (amount < 1) return "Minimum bet is $1."
  return null
}

/** PRD §7 rule 4: the flat per-placement max, either phase. */
export function validateMaxSingleBet(amount: number, rules: TournamentRules): string | null {
  const max = maxSingleBet(rules)
  if (amount > max) return `Max single bet is $${max}.`
  return null
}

/** PRD §7 rule 5: self-pick total IN THIS PHASE ≤ pct of this phase's entry.
 * Non-playing bettors are exempt (Q14). A missing entry is
 * validatePhaseEntry's complaint, not this one's. */
export function validateSelfBetTotal(
  ctx: PlacementContext,
  amount: number,
  rules: TournamentRules
): string | null {
  if (!ctx.bettor.is_player) return null
  if (!isSelfPick(ctx.pick.player_user_id, ctx.bettor.user_id)) return null
  const entry = phaseEntry(ctx.bettor, ctx.bet.phase)
  if (entry === null) return null
  const cap = maxSelfBet(entry, rules)
  const otherSelfTotal = ctx.existing
    .filter(
      (p) =>
        p.phase === ctx.bet.phase &&
        p.pick_id !== ctx.pick.id &&
        isSelfPick(p.pick_player_user_id, ctx.bettor.user_id)
    )
    .reduce((sum, p) => sum + p.amount, 0)
  const total = otherSelfTotal + amount
  if (total > cap)
    return `Max total on yourself is $${cap} for your $${entry} Phase ${ctx.bet.phase} entry — this would put you at $${total}.`
  return null
}

/** PRD §7 rule 6 upper bound: running total IN THIS PHASE ≤ this phase's
 * entry. The database enforces the same rule with a lock
 * (enforce_placement_total(), migration 20260914000000) and raises this
 * exact sentence, so a raced write reads like a validated one. */
export function validateRunningTotal(ctx: PlacementContext, amount: number): string | null {
  const entry = phaseEntry(ctx.bettor, ctx.bet.phase)
  if (entry === null) return null
  const otherTotal = ctx.existing
    .filter((p) => p.phase === ctx.bet.phase && p.pick_id !== ctx.pick.id)
    .reduce((sum, p) => sum + p.amount, 0)
  const total = otherTotal + amount
  if (total > entry)
    return `Over your $${entry} Phase ${ctx.bet.phase} entry — that's the most you can wager in Phase ${ctx.bet.phase}.`
  return null
}

/** PRD §7 rule 7: one pick per Match / Group Match bet. */
export function validateSinglePickCategory(ctx: PlacementContext): string | null {
  if (ctx.bet.allows_multiple_picks) return null
  const other = ctx.existing.find(
    (p) => p.bet_id === ctx.bet.id && p.pick_id !== ctx.pick.id
  )
  if (other) return "This bet allows only one pick per participant."
  return null
}

/** PRD §7 rule 8: in a Match / Group Match the bettor plays in, any pick
 * other than their own is rejected outright. */
export function validateOpponentBlock(ctx: PlacementContext): string | null {
  if (ctx.bet.allows_multiple_picks) return null
  const playsInBet = ctx.bet.pick_player_user_ids.some(
    (id) => id !== null && id === ctx.bettor.user_id
  )
  if (playsInBet && ctx.pick.player_user_id !== ctx.bettor.user_id)
    return "You can't bet on your opponent in a match you're playing in."
  return null
}

// ---------------------------------------------------------------------------
// Orchestrator — the §8.1 submission-time gate
// ---------------------------------------------------------------------------

export type PlacementValidation =
  | { ok: true; requires_admin_review: boolean }
  | { ok: false; errors: string[] }

/**
 * Run every submission-time hard-block rule for placing (or editing) a wager
 * of `amount` on ctx.pick. On success, carries the self-pick flag the write
 * must store as requires_admin_review.
 */
export function validatePlacement(
  ctx: PlacementContext,
  amount: number,
  rules: TournamentRules
): PlacementValidation {
  const errors = [
    validateBetOpen(ctx.bet),
    validatePhaseEntry(ctx),
    validateAmount(amount),
    validateMaxSingleBet(amount, rules),
    validateSelfBetTotal(ctx, amount, rules),
    validateRunningTotal(ctx, amount),
    validateSinglePickCategory(ctx),
    validateOpponentBlock(ctx),
  ].filter((e): e is string => e !== null)

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    requires_admin_review: isSelfPick(ctx.pick.player_user_id, ctx.bettor.user_id),
  }
}

// ---------------------------------------------------------------------------
// The phase standing — the completeness picture, and the money it implies
// (PRD §8.1, ADR 0002). Evaluated while a phase is open for the warnings, at
// close for the chase list, and at settlement for the pot. Never blocking.
// ---------------------------------------------------------------------------

export type StandingIssue = {
  /** `warning` costs the member money or the minimum; `info` is money coming
   * back, which is not a violation of anything. */
  tone: "warning" | "info"
  code: "picks" | "forfeit" | "self" | "refund" | "over"
  message: string
}

export type PhaseStanding = {
  phase: Phase
  /** The phase entry E. */
  entry: number
  /** W — Σ live placements in the phase, voids included. */
  wagered: number
  pick_count: number
  meets_pick_minimum: boolean
  /** How many more picks the minimum needs; 0 once met. */
  picks_needed: number
  /** S — Σ live self-pick placements in the phase (0 for a non-player). */
  self_total: number
  /** The placement-time cap: floor(pct × E). */
  self_cap: number
  /** The cap that counts at close: floor(pct × W). */
  self_cap_effective: number
  /** How much of S is recognised: min(S, self_cap_effective). */
  self_recognized: number
  /** S − self_recognized — stays in the pot, earns nothing. */
  self_forfeit: number
  /** C = min(E, max(W, entry_fee_min)) — what funds the pot. */
  committed: number
  /** max(0, C − W) — committed money with no wager behind it. */
  forfeit: number
  /** E − C — comes back to the bettor, out of band. */
  refund: number
  /** W > E: only reachable by a hand edit; surfaced on admin pages. */
  over_entry: boolean
  /** Every rule met: the minimum, the exact entry, nothing forfeited. */
  complete: boolean
  /** In priority order — the slip bar leads with the first. */
  issues: StandingIssue[]
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`
}

/**
 * The bettor's standing in one phase they are entered in.
 *
 * `existing` may span both phases (it is the same list validatePlacement
 * reads); only rows in `phase` count. `is_player` false means no self-bet
 * arithmetic at all — a non-player has no pick bearing their name (Q14/A15),
 * and a hand-linked one must not cost them money.
 */
export function phaseStanding(
  existing: ExistingPlacement[],
  entry: number,
  phase: Phase,
  rules: TournamentRules,
  options: { is_player?: boolean; bettor_user_id?: string } = {}
): PhaseStanding {
  const isPlayer = options.is_player ?? true
  const mine = existing.filter((p) => p.phase === phase)
  const wagered = mine.reduce((sum, p) => sum + p.amount, 0)
  const pickCount = mine.length
  const minPicks = rules.min_picks_per_phase
  const meetsMin = pickCount >= minPicks

  const selfTotal =
    isPlayer && options.bettor_user_id
      ? mine
          .filter((p) => isSelfPick(p.pick_player_user_id, options.bettor_user_id!))
          .reduce((sum, p) => sum + p.amount, 0)
      : 0
  const selfCap = maxSelfBet(entry, rules)
  const selfCapEffective = Math.floor(rules.max_self_bet_pct * wagered)
  const selfRecognized = Math.min(selfTotal, selfCapEffective)
  const selfForfeit = selfTotal - selfRecognized

  // Wagering nothing at all is "never entered" (A28): the whole entry comes
  // back and none of it funds the pot. The floor only bites once there is a
  // wager behind it — one dollar in and the first $entry_fee_min is committed
  // as before, which is the cliff Andrew took deliberately on Sept 19, 2026.
  const committed =
    wagered === 0 ? 0 : Math.min(entry, Math.max(wagered, rules.entry_fee_min))
  const forfeit = Math.max(0, committed - wagered)
  const refund = Math.max(0, entry - committed)
  const overEntry = wagered > entry

  const issues: StandingIssue[] = []
  if (!meetsMin) {
    const need = minPicks - pickCount
    issues.push({
      tone: "warning",
      code: "picks",
      message: `${plural(need, "more pick")} needed in Phase ${phase} (${pickCount} of ${minPicks}).`,
    })
  }
  if (forfeit > 0) {
    issues.push({
      tone: "warning",
      code: "forfeit",
      message: `$${forfeit} forfeits to the Phase ${phase} pot unless you wager it — once you've wagered anything, the first $${rules.entry_fee_min} of an entry is committed.`,
    })
  }
  if (selfForfeit > 0) {
    // To recognise all of S you need W ≥ S / pct — always reachable, since
    // S ≤ floor(pct × E) was enforced at placement.
    const needed = Math.min(entry, Math.ceil(selfTotal / rules.max_self_bet_pct))
    issues.push({
      tone: "warning",
      code: "self",
      message: `Only $${selfRecognized} of your $${selfTotal} on yourself counts until you've wagered $${needed} in Phase ${phase}.`,
    })
  }
  if (overEntry) {
    issues.push({
      tone: "warning",
      code: "over",
      message: `$${wagered} is wagered against a $${entry} Phase ${phase} entry — an admin needs to look at this.`,
    })
  }
  if (refund > 0 && forfeit === 0 && !overEntry) {
    issues.push({
      tone: "info",
      code: "refund",
      message: `$${refund} of your Phase ${phase} entry comes back unless you wager it.`,
    })
  }

  return {
    phase,
    entry,
    wagered,
    pick_count: pickCount,
    meets_pick_minimum: meetsMin,
    picks_needed: Math.max(0, minPicks - pickCount),
    self_total: selfTotal,
    self_cap: selfCap,
    self_cap_effective: selfCapEffective,
    self_recognized: selfRecognized,
    self_forfeit: selfForfeit,
    committed,
    forfeit,
    refund,
    over_entry: overEntry,
    complete: meetsMin && wagered === entry && selfForfeit === 0 && !overEntry,
    issues,
  }
}

/** The bettor's standing in each phase they are entered in; an absent key
 * means "not in that phase". */
export function phaseStandings(
  existing: ExistingPlacement[],
  bettor: Bettor,
  rules: TournamentRules
): Partial<Record<Phase, PhaseStanding>> {
  const out: Partial<Record<Phase, PhaseStanding>> = {}
  for (const phase of [1, 2] as const) {
    const entry = phaseEntry(bettor, phase)
    if (entry === null) continue
    out[phase] = phaseStanding(existing, entry, phase, rules, {
      is_player: bettor.is_player,
      bettor_user_id: bettor.user_id,
    })
  }
  return out
}
