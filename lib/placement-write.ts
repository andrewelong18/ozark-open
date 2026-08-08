import type { createClient } from "./supabase/server"
import { validateBetOpen, validatePlacement } from "./validation"
import { phaseClosedByClock } from "./phases"
import {
  buildPlacementContext,
  normalizeExistingPlacements,
  normalizeTargetPick,
  planWrite,
  toPhaseClock,
  toTournamentRules,
  TOURNAMENT_CLOCK_COLUMNS,
  TOURNAMENT_RULE_COLUMNS,
  type OwnPlacementRow,
  type ParticipantRow,
  type PickQueryRow,
  type PlacementQueryRow,
} from "./placements"

// The placement write path, once (Sprint 23 / #101, ADR 0001 §13).
//
// Two routes call this: /api/placements (a member betting for themselves) and
// /api/admin/placements (an admin betting on a member's behalf). They differ in
// exactly one thing — identity — and that is now a PARAMETER rather than an
// `auth.getUser()` call buried in the handler:
//
//   bettor = whose money it is  → every §7 rule, every limit, the review flag
//   actor  = who typed it in    → recorded in placed_by_user_id, nothing else
//
// It exists as one module rather than two handlers because the failure mode of
// a divergent copy is silent: a wager that passes validation and is wrong. Note
// that §7's messages say "your" and mean the BETTOR's entry — the on-behalf UI
// renders them under a banner naming who is being bet for, so they read right.
//
// Unlike the rest of lib/, this module touches Supabase (same licence
// lib/admin-gate.ts takes); the rules it applies all live in the pure modules
// it imports.

type Supabase = Awaited<ReturnType<typeof createClient>>

/** Whose money it is, and who is entering it. Equal for a member betting for
 * themselves — which is what makes placed_by_user_id NULL. */
export type PlacementIdentity = {
  bettor_id: string
  actor_id: string
}

/** A ready-to-return response: HTTP status plus the JSON body. Kept framework
 * -free so this module stays testable and the routes stay glue. */
export type PlacementOutcome = {
  status: number
  body: Record<string, unknown>
}

const PLACEMENT_RETURN_COLUMNS =
  "id, pick_id, amount, odds_at_placement, requires_admin_review, deleted_at"

type PlacementReturnRow = {
  id: string
  pick_id: string
  amount: number
  odds_at_placement: number
  requires_admin_review: boolean
  deleted_at: string | null
}

/** Strip deleted_at before the row goes to the client — every response body
 * is a live placement by construction. */
function toClientPlacement(row: PlacementReturnRow) {
  const { deleted_at, ...placement } = row
  void deleted_at
  return placement
}

/** True when an admin is acting for somebody else. Drives both the audit stamp
 * and which "not registered" message the caller sees. */
function onBehalf(identity: PlacementIdentity): boolean {
  return identity.actor_id !== identity.bettor_id
}

/**
 * Place or edit a wager for `identity.bettor_id`. Same handler for POST and
 * PATCH — UNIQUE (user_id, pick_id) makes this update-by-key, and a
 * soft-deleted row on the same pick is revived.
 */
export async function placeOrEditPlacement(
  supabase: Supabase,
  identity: PlacementIdentity,
  input: { pick_id: string; amount: number }
): Promise<PlacementOutcome> {
  // Target pick with its parent bet, category constraint, and every sibling
  // pick's player link (opponent rule). RLS hides picks of hidden bets, so a
  // non-admin placing on one lands in the 404 below.
  const { data: pickData, error: pickError } = await supabase
    .from("bet_picks")
    .select(
      "id, player_user_id, american_odds, bets ( id, tournament_id, status, phase, bet_categories ( allows_multiple_picks ), bet_picks ( player_user_id ) )"
    )
    .eq("id", input.pick_id)
    .maybeSingle()
  if (pickError) {
    return {
      status: 500,
      body: { error: `Couldn't load that pick: ${pickError.message}` },
    }
  }
  const target = pickData
    ? normalizeTargetPick(pickData as unknown as PickQueryRow)
    : null
  if (!target) {
    return { status: 404, body: { error: "Pick not found." } }
  }

  // The tournaments row is the rulebook — passed verbatim to validation.
  const { data: tournamentData } = await supabase
    .from("tournaments")
    .select(`${TOURNAMENT_RULE_COLUMNS}, ${TOURNAMENT_CLOCK_COLUMNS}`)
    .eq("id", target.tournament_id)
    .maybeSingle()
  if (!tournamentData) {
    return { status: 500, body: { error: "Couldn't load the tournament rules." } }
  }
  const tournamentRow = tournamentData as unknown as Record<string, unknown>
  const rules = toTournamentRules(tournamentRow)
  // One `now` for the whole request, so the deadline can't fall between two
  // checks of it (Sprint 25 / #106). The clock binds admins too: acting for
  // someone is not permission to reopen a closed phase.
  const clock = toPhaseClock(tournamentRow)
  const now = new Date()

  // Non-participants can browse the menu but never wager — and eligibility is
  // the BETTOR's, not the actor's. An admin acting for a revoked member is
  // refused here, exactly as the member would be (Sprint 21 / #91).
  const { data: participantData } = await supabase
    .from("tournament_participants")
    .select("user_id, entry_fee, is_player")
    .eq("user_id", identity.bettor_id)
    .eq("tournament_id", target.tournament_id)
    .is("revoked_at", null)
    .maybeSingle()
  if (!participantData) {
    return {
      status: 403,
      body: {
        error: onBehalf(identity)
          ? "They're not an approved bettor for this tournament — approve them on /admin/people first."
          : "You're not registered for this tournament — ask an admin to add you.",
      },
    }
  }

  // The BETTOR's live placements across the whole tournament — the running
  // total and self-bet rules span both phases. deleted_at IS NULL here; the
  // no-filter read happens only for the revive lookup below.
  const { data: placementsData, error: placementsError } = await supabase
    .from("bet_placements")
    .select(
      "pick_id, amount, bet_picks ( player_user_id, bets ( id, phase, tournament_id ) )"
    )
    .eq("user_id", identity.bettor_id)
    .is("deleted_at", null)
  if (placementsError) {
    return {
      status: 500,
      body: { error: `Couldn't load their placements: ${placementsError.message}` },
    }
  }
  const existing = normalizeExistingPlacements(
    (placementsData ?? []) as unknown as PlacementQueryRow[],
    target.tournament_id
  )

  // Every §7 rule evaluates against this context, and it is built entirely
  // from the bettor's row — the entry fee, the self-bet cap, the opponent
  // block and requires_admin_review all key off them, never the actor.
  const ctx = buildPlacementContext(
    participantData as ParticipantRow,
    target,
    existing,
    clock,
    now
  )
  const verdict = validatePlacement(ctx, input.amount, rules)
  if (!verdict.ok) {
    return { status: 400, body: { errors: verdict.errors } }
  }

  // The bettor's row on this pick, read WITHOUT filtering deleted_at (the
  // SELECT policies deliberately allow it) so a soft-deleted row revives
  // instead of colliding with UNIQUE (user_id, pick_id).
  const { data: ownRowData } = await supabase
    .from("bet_placements")
    .select("id, deleted_at")
    .eq("user_id", identity.bettor_id)
    .eq("pick_id", input.pick_id)
    .maybeSingle()

  const plan = planWrite(
    (ownRowData as OwnPlacementRow | null) ?? null,
    input.amount,
    target.current_american_odds,
    verdict.requires_admin_review,
    onBehalf(identity) ? identity.actor_id : null
  )

  if (plan.kind === "insert") {
    const { data, error } = await supabase
      .from("bet_placements")
      .insert({ user_id: identity.bettor_id, pick_id: input.pick_id, ...plan.fields })
      .select(PLACEMENT_RETURN_COLUMNS)
      .single()
    if (error) {
      return { status: 500, body: { error: `Placing the bet failed: ${error.message}` } }
    }
    return {
      status: 201,
      body: { placement: toClientPlacement(data as PlacementReturnRow) },
    }
  }

  const { data, error } = await supabase
    .from("bet_placements")
    .update(plan.fields)
    .eq("id", plan.id)
    .select(PLACEMENT_RETURN_COLUMNS)
    .single()
  if (error) {
    return { status: 500, body: { error: `Updating the bet failed: ${error.message}` } }
  }
  return {
    status: 200,
    body: { placement: toClientPlacement(data as PlacementReturnRow) },
  }
}

/**
 * Remove a wager: soft delete — sets deleted_at; the row stays for history and
 * revives if it's re-placed while the bet is open.
 */
export async function removePlacement(
  supabase: Supabase,
  identity: PlacementIdentity,
  input: { pick_id: string }
): Promise<PlacementOutcome> {
  const { data: rowData, error: rowError } = await supabase
    .from("bet_placements")
    .select("id, deleted_at, bet_picks ( bets ( status, phase, tournament_id ) )")
    .eq("user_id", identity.bettor_id)
    .eq("pick_id", input.pick_id)
    .maybeSingle()
  if (rowError) {
    return {
      status: 500,
      body: { error: `Couldn't load the placement: ${rowError.message}` },
    }
  }
  type DeleteBetJoin = { status: string; phase: number; tournament_id: string }
  const row = rowData as
    | {
        id: string
        deleted_at: string | null
        bet_picks:
          | { bets: DeleteBetJoin | DeleteBetJoin[] | null }
          | { bets: DeleteBetJoin | DeleteBetJoin[] | null }[]
          | null
      }
    | null
  if (!row || row.deleted_at !== null) {
    return {
      status: 404,
      body: {
        error: onBehalf(identity)
          ? "They have no bet on this pick."
          : "You have no bet on this pick.",
      },
    }
  }

  const pickJoin = Array.isArray(row.bet_picks) ? row.bet_picks[0] : row.bet_picks
  const betJoin = pickJoin
    ? Array.isArray(pickJoin.bets)
      ? pickJoin.bets[0]
      : pickJoin.bets
    : null

  // Removing a wager is a write like any other, so it obeys the same gate:
  // the deadline closes the window in both directions (Sprint 25 / #106).
  // Without this you could still pull money off the board after the close.
  const phase = betJoin?.phase === 2 ? 2 : 1
  let phaseClosed = false
  if (betJoin?.tournament_id) {
    const { data: clockData } = await supabase
      .from("tournaments")
      .select(TOURNAMENT_CLOCK_COLUMNS)
      .eq("id", betJoin.tournament_id)
      .maybeSingle()
    if (clockData) {
      phaseClosed = phaseClosedByClock(
        phase,
        toPhaseClock(clockData as unknown as Record<string, unknown>),
        new Date()
      )
    }
  }

  const openError = validateBetOpen({
    status: (betJoin?.status ?? "closed") as "hidden" | "open" | "closed",
    phase,
    phase_closed: phaseClosed,
  })
  if (openError) {
    return { status: 400, body: { errors: [openError] } }
  }

  // The actor is stamped on removal too — a soft delete is an UPDATE, and the
  // admin UPDATE policy requires placed_by_user_id = auth.uid(). It also keeps
  // the column honest about who last touched the row.
  const { error } = await supabase
    .from("bet_placements")
    .update({
      deleted_at: new Date().toISOString(),
      ...(onBehalf(identity) ? { placed_by_user_id: identity.actor_id } : {}),
    })
    .eq("id", row.id)
  if (error) {
    return { status: 500, body: { error: `Removing the bet failed: ${error.message}` } }
  }
  return { status: 200, body: { removed: true } }
}
