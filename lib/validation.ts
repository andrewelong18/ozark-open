// Server-side wagering rules (PRD §7, §8.1) for bet placements. API routes
// (Sprint 4) call these before any write; client checks are UX, not security.
//
// Pure module by design — no Supabase, no "@/" alias imports — so the
// node:test suite exercises the exact code the API runs. Every limit is
// parameterized by the tournaments row (TournamentRules); nothing here
// hardcodes a dollar figure or pick count.
//
// Two groups per §8.1: per-placement rules hard-block a write
// (validatePlacement); phase-completeness rules only report status at phase
// close (checkPhaseMinimums / checkTournamentTotal) — a participant is
// legitimately incomplete while still placing bets.

// ---------------------------------------------------------------------------
// Types (snake_case mirrors the DB rows so routes can pass them straight in)
// ---------------------------------------------------------------------------

/** The rule parameters from the tournaments row. */
export type TournamentRules = {
  entry_fee_min: number
  entry_fee_max: number
  min_picks_per_phase: number
  max_picks_per_phase: number
  max_single_bet_pct: number
  max_single_bet_cap: number
  max_self_bet_pct: number
  max_self_bet_cap: number
}

/** The participant placing the wager (users × tournament_participants). */
export type Bettor = {
  user_id: string
  entry_fee: number
  /** Non-playing bettors are exempt from the self-bet cap (PRD §12 Q14). */
  is_player: boolean
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
  phase: 1 | 2
  /** From bet_categories: false for Match / Group Match. */
  allows_multiple_picks: boolean
  /** player_user_id of every pick in the bet (nulls included). */
  pick_player_user_ids: (string | null)[]
}

/**
 * One of the bettor's live placements (deleted_at IS NULL), across the whole
 * tournament — the running-total and self-bet rules span both phases.
 */
export type ExistingPlacement = {
  pick_id: string
  bet_id: string
  phase: 1 | 2
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

/**
 * Max single bet: pct of entry, hard-capped (PRD §7 rule 4). Floored, never
 * rounded — a $25 entry at 50% allows $12, not $13.
 */
export function maxSingleBet(entryFee: number, rules: TournamentRules): number {
  return Math.min(Math.floor(rules.max_single_bet_pct * entryFee), rules.max_single_bet_cap)
}

/** Max total on yourself across the whole tournament (PRD §7 rule 5). */
export function maxSelfBet(entryFee: number, rules: TournamentRules): number {
  return Math.min(Math.floor(rules.max_self_bet_pct * entryFee), rules.max_self_bet_cap)
}

/** Self-pick = the pick refers to the bettor. Never true for unlinked picks
 * ("Field", "Yes"/"No" — PRD §12 Q10). Drives requires_admin_review. */
export function isSelfPick(pickPlayerUserId: string | null, bettorUserId: string): boolean {
  return pickPlayerUserId !== null && pickPlayerUserId === bettorUserId
}

// ---------------------------------------------------------------------------
// Per-placement rules — each returns a human-readable error, or null if OK
// ---------------------------------------------------------------------------

/** PRD §7 rule 1: entry fee in whole dollars within the tournament's bounds.
 * Checked at participant creation (the schema CHECK only enforces > 0). */
export function validateEntryFee(entryFee: number, rules: TournamentRules): string | null {
  if (!Number.isInteger(entryFee)) return "Entry fee must be a whole-dollar amount."
  if (entryFee < rules.entry_fee_min || entryFee > rules.entry_fee_max)
    return `Entry fee must be between $${rules.entry_fee_min} and $${rules.entry_fee_max}.`
  return null
}

/** PRD §8.1: wagering only while the bet is open. */
export function validateBetOpen(status: TargetBet["status"]): string | null {
  return status === "open" ? null : "This bet is not open for wagering."
}

/** PRD §7 rule 3: whole dollars, $1 minimum. */
export function validateAmount(amount: number): string | null {
  if (!Number.isInteger(amount)) return "Bet amounts must be whole dollars."
  if (amount < 1) return "Minimum bet is $1."
  return null
}

/** PRD §7 rule 4: per-placement max, either phase. */
export function validateMaxSingleBet(
  amount: number,
  entryFee: number,
  rules: TournamentRules
): string | null {
  const max = maxSingleBet(entryFee, rules)
  if (amount > max) return `Max single bet is $${max} for your $${entryFee} entry.`
  return null
}

/** PRD §7 rule 2 upper bound: wagered picks in the bet's phase. Each pick
 * counts individually (ADR 0001 A8); editing an already-wagered pick doesn't
 * add to the count. */
export function validatePhasePickCount(ctx: PlacementContext, rules: TournamentRules): string | null {
  if (ctx.existing.some((p) => p.pick_id === ctx.pick.id)) return null
  const inPhase = ctx.existing.filter((p) => p.phase === ctx.bet.phase).length
  if (inPhase >= rules.max_picks_per_phase)
    return `Phase ${ctx.bet.phase} is full — ${rules.max_picks_per_phase} picks max.`
  return null
}

/** PRD §7 rule 5: self-pick total across the whole tournament ≤ cap.
 * Non-playing bettors are exempt (Q14). */
export function validateSelfBetTotal(
  ctx: PlacementContext,
  amount: number,
  rules: TournamentRules
): string | null {
  if (!ctx.bettor.is_player) return null
  if (!isSelfPick(ctx.pick.player_user_id, ctx.bettor.user_id)) return null
  const cap = maxSelfBet(ctx.bettor.entry_fee, rules)
  const otherSelfTotal = ctx.existing
    .filter(
      (p) =>
        p.pick_id !== ctx.pick.id && isSelfPick(p.pick_player_user_id, ctx.bettor.user_id)
    )
    .reduce((sum, p) => sum + p.amount, 0)
  const total = otherSelfTotal + amount
  if (total > cap)
    return `Max total on yourself is $${cap} for your $${ctx.bettor.entry_fee} entry — this would put you at $${total}.`
  return null
}

/** PRD §7 rule 6 upper bound: running total across both phases ≤ entry fee.
 * (Exact-equal is a phase-close check — see checkTournamentTotal.) */
export function validateRunningTotal(ctx: PlacementContext, amount: number): string | null {
  const otherTotal = ctx.existing
    .filter((p) => p.pick_id !== ctx.pick.id)
    .reduce((sum, p) => sum + p.amount, 0)
  const total = otherTotal + amount
  if (total > ctx.bettor.entry_fee)
    return `Over your $${ctx.bettor.entry_fee} entry — that's the most you can wager across both phases.`
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
    validateBetOpen(ctx.bet.status),
    validateAmount(amount),
    validateMaxSingleBet(amount, ctx.bettor.entry_fee, rules),
    validatePhasePickCount(ctx, rules),
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
// Phase-completeness checks — evaluated at phase close, never blocking
// (PRD §8.1: admins chase stragglers; whatever stands, stands — Q3)
// ---------------------------------------------------------------------------

export type PhaseCompliance = {
  phase: 1 | 2
  pick_count: number
  meets_minimum: boolean
  message: string | null
}

/**
 * PRD §7 rule 2 lower bound: ≥ min picks in any phase the participant bet in.
 * Phases with no placements are fine (Q2) and aren't reported.
 */
export function checkPhaseMinimums(
  existing: ExistingPlacement[],
  rules: TournamentRules
): PhaseCompliance[] {
  const phases: (1 | 2)[] = [1, 2]
  return phases
    .map((phase) => {
      const count = existing.filter((p) => p.phase === phase).length
      return { phase, count }
    })
    .filter(({ count }) => count > 0)
    .map(({ phase, count }) => ({
      phase,
      pick_count: count,
      meets_minimum: count >= rules.min_picks_per_phase,
      message:
        count >= rules.min_picks_per_phase
          ? null
          : `Only ${count} of the ${rules.min_picks_per_phase} minimum picks in Phase ${phase}.`,
    }))
}

export type TotalCompliance = {
  total: number
  remaining: number
  exact: boolean
  message: string | null
}

/**
 * PRD §7 rule 6: total wagered across both phases must equal the entry fee
 * exactly by Phase 2 close. Under-total is legitimate while betting is still
 * open — this reports status for the UI banner and the admin chase list.
 */
export function checkTournamentTotal(
  existing: ExistingPlacement[],
  entryFee: number
): TotalCompliance {
  const total = existing.reduce((sum, p) => sum + p.amount, 0)
  const remaining = entryFee - total
  const exact = total === entryFee
  return {
    total,
    remaining,
    exact,
    message: exact
      ? null
      : `You've wagered $${total} of $${entryFee} — Phase 2 must bring you to exactly $${entryFee}.`,
  }
}
