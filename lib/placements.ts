// Placement write path (Sprint 4): everything the /api/placements route does
// beyond straight Supabase glue. Assembles the PlacementContext that
// lib/validation.ts adjudicates, and plans the write itself.
//
// Pure module by design — no Supabase, no "@/" alias imports — so the
// node:test suite exercises the exact code the API runs.
//
// Write semantics (DATA_MODEL §3.7, ADR 0001):
// - UNIQUE (user_id, pick_id) means place-or-edit is update-by-key, never a
//   second insert. Re-placing on a soft-deleted row revives it.
// - Every write (place, edit, revive) re-snapshots the pick's CURRENT
//   american_odds into odds_at_placement and recomputes
//   requires_admin_review from the validation result.

import type {
  Bettor,
  ExistingPlacement,
  PlacementContext,
  TargetBet,
  TargetPick,
  TournamentRules,
} from "./validation.ts"

// ---------------------------------------------------------------------------
// Request-body parsing
// ---------------------------------------------------------------------------

export type ParsedBody =
  | { ok: true; pick_id: string; amount: number }
  | { ok: false; error: string }

/** Parse a POST/PATCH body: { pick_id: uuid-ish string, amount: number }.
 * Bounds and dollar-rules are validation's job — this only rejects requests
 * that aren't even shaped like a placement. */
export function parsePlacementBody(body: unknown): ParsedBody {
  if (typeof body !== "object" || body === null)
    return { ok: false, error: "Request body must be JSON." }
  const { pick_id, amount } = body as Record<string, unknown>
  if (typeof pick_id !== "string" || pick_id.trim() === "")
    return { ok: false, error: "pick_id is required." }
  if (typeof amount !== "number" || !Number.isFinite(amount))
    return { ok: false, error: "amount must be a number." }
  return { ok: true, pick_id, amount }
}

export type ParsedDeleteBody =
  | { ok: true; pick_id: string }
  | { ok: false; error: string }

export function parseDeleteBody(body: unknown): ParsedDeleteBody {
  if (typeof body !== "object" || body === null)
    return { ok: false, error: "Request body must be JSON." }
  const { pick_id } = body as Record<string, unknown>
  if (typeof pick_id !== "string" || pick_id.trim() === "")
    return { ok: false, error: "pick_id is required." }
  return { ok: true, pick_id }
}

// ---------------------------------------------------------------------------
// Row normalization — supabase-js returns to-one joins as object OR
// one-element array depending on how it infers the relationship, so every
// nested row goes through these before the route trusts its shape.
// ---------------------------------------------------------------------------

function one<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

/** The tournaments row, verbatim. PostgREST may serialize numeric columns as
 * strings; coerce every rule field so the math never concatenates. */
export function toTournamentRules(row: Record<string, unknown>): TournamentRules {
  const n = (field: keyof TournamentRules) => Number(row[field])
  return {
    entry_fee_min: n("entry_fee_min"),
    entry_fee_max: n("entry_fee_max"),
    min_picks_per_phase: n("min_picks_per_phase"),
    max_picks_per_phase: n("max_picks_per_phase"),
    max_single_bet_pct: n("max_single_bet_pct"),
    max_single_bet_cap: n("max_single_bet_cap"),
    max_self_bet_pct: n("max_self_bet_pct"),
    max_self_bet_cap: n("max_self_bet_cap"),
  }
}

/** Raw shape of the target-pick query (bet_picks → bets → category + siblings). */
export type PickQueryRow = {
  id: string
  player_user_id: string | null
  american_odds: number
  bets:
    | {
        id: string
        tournament_id: string
        status: string
        phase: number
        bet_categories:
          | { allows_multiple_picks: boolean }
          | { allows_multiple_picks: boolean }[]
          | null
        bet_picks: { player_user_id: string | null }[] | null
      }
    | {
        id: string
        tournament_id: string
        status: string
        phase: number
        bet_categories:
          | { allows_multiple_picks: boolean }
          | { allows_multiple_picks: boolean }[]
          | null
        bet_picks: { player_user_id: string | null }[] | null
      }[]
    | null
}

export type NormalizedTarget = {
  pick: TargetPick
  bet: TargetBet
  tournament_id: string
  /** The pick's live odds — snapshotted into odds_at_placement on write. */
  current_american_odds: number
}

/** Flatten the target-pick query into validation's TargetPick/TargetBet.
 * Returns null when the joins are missing (shouldn't happen under the FK, but
 * a malformed row must 404, not crash). */
export function normalizeTargetPick(row: PickQueryRow): NormalizedTarget | null {
  const bet = one(row.bets)
  if (!bet) return null
  const category = one(bet.bet_categories)
  if (!category) return null
  if (bet.status !== "hidden" && bet.status !== "open" && bet.status !== "closed")
    return null
  if (bet.phase !== 1 && bet.phase !== 2) return null
  return {
    pick: { id: row.id, player_user_id: row.player_user_id },
    bet: {
      id: bet.id,
      status: bet.status,
      phase: bet.phase,
      allows_multiple_picks: category.allows_multiple_picks,
      pick_player_user_ids: (bet.bet_picks ?? []).map((p) => p.player_user_id),
    },
    tournament_id: bet.tournament_id,
    current_american_odds: row.american_odds,
  }
}

/** Raw shape of the bettor's live-placements query. */
export type PlacementQueryRow = {
  pick_id: string
  amount: number
  bet_picks:
    | {
        player_user_id: string | null
        bets: { id: string; phase: number; tournament_id: string } | { id: string; phase: number; tournament_id: string }[] | null
      }
    | {
        player_user_id: string | null
        bets: { id: string; phase: number; tournament_id: string } | { id: string; phase: number; tournament_id: string }[] | null
      }[]
    | null
}

/**
 * Flatten the bettor's live placements to validation's ExistingPlacement[],
 * keeping only rows in the target tournament. Rows whose pick/bet join is
 * unreadable are dropped — that only happens if a bet with placements was
 * re-hidden, which the status lifecycle (open → closed) never does.
 */
export function normalizeExistingPlacements(
  rows: PlacementQueryRow[],
  tournamentId: string
): ExistingPlacement[] {
  const out: ExistingPlacement[] = []
  for (const row of rows) {
    const pick = one(row.bet_picks)
    const bet = pick ? one(pick.bets) : null
    if (!pick || !bet) continue
    if (bet.tournament_id !== tournamentId) continue
    if (bet.phase !== 1 && bet.phase !== 2) continue
    out.push({
      pick_id: row.pick_id,
      bet_id: bet.id,
      phase: bet.phase,
      amount: Number(row.amount),
      pick_player_user_id: pick.player_user_id,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Context assembly
// ---------------------------------------------------------------------------

export type ParticipantRow = {
  user_id: string
  entry_fee: number
  is_player: boolean
}

export function buildPlacementContext(
  participant: ParticipantRow,
  target: NormalizedTarget,
  existing: ExistingPlacement[]
): PlacementContext {
  const bettor: Bettor = {
    user_id: participant.user_id,
    entry_fee: Number(participant.entry_fee),
    is_player: participant.is_player,
  }
  return { bettor, pick: target.pick, bet: target.bet, existing }
}

// ---------------------------------------------------------------------------
// Write planning — insert vs update-by-key (revive included)
// ---------------------------------------------------------------------------

/** The bettor's own row on this pick, read WITHOUT filtering deleted_at —
 * the own-rows SELECT policy deliberately allows it so revive can find it. */
export type OwnPlacementRow = {
  id: string
  deleted_at: string | null
}

export type WriteFields = {
  amount: number
  odds_at_placement: number
  requires_admin_review: boolean
  /** Always null on write: a fresh place is live, a revive clears the flag. */
  deleted_at: null
}

export type WritePlan =
  | { kind: "insert"; fields: WriteFields }
  | { kind: "update" | "revive"; id: string; fields: WriteFields }

/**
 * Decide insert vs update for a validated placement. UNIQUE (user_id,
 * pick_id) makes any existing row — live or soft-deleted — an update by key;
 * a soft-deleted one is a revive. Fields are identical in all three cases:
 * the invariant is that every write carries the current odds snapshot and a
 * freshly computed requires_admin_review.
 */
export function planWrite(
  existingRow: OwnPlacementRow | null,
  amount: number,
  currentAmericanOdds: number,
  requiresAdminReview: boolean
): WritePlan {
  const fields: WriteFields = {
    amount,
    odds_at_placement: currentAmericanOdds,
    requires_admin_review: requiresAdminReview,
    deleted_at: null,
  }
  if (!existingRow) return { kind: "insert", fields }
  return {
    kind: existingRow.deleted_at === null ? "update" : "revive",
    id: existingRow.id,
    fields,
  }
}
