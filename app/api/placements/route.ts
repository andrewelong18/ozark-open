import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { validateBetOpen, validatePlacement } from "@/lib/validation"
import {
  buildPlacementContext,
  normalizeExistingPlacements,
  normalizeTargetPick,
  parseDeleteBody,
  parsePlacementBody,
  planWrite,
  toTournamentRules,
  TOURNAMENT_RULE_COLUMNS,
  type OwnPlacementRow,
  type ParticipantRow,
  type PickQueryRow,
  type PlacementQueryRow,
} from "@/lib/placements"

// Placement endpoint (Sprint 4). The route is glue: assemble a
// PlacementContext from the DB and let lib/validation.ts adjudicate — every
// limit comes from the tournaments row, nothing is hardcoded here. Writes run
// under the bettor's own session; the bet_placements RLS policies are the
// backstop (own rows only, parent bet open).

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

async function readJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

// Place or edit a wager: { pick_id, amount }. Same handler for POST and
// PATCH — UNIQUE (user_id, pick_id) makes this update-by-key, and a
// soft-deleted row on the same pick is revived.
async function placeOrEdit(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 })
  }

  const body = parsePlacementBody(await readJson(request))
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: 400 })
  }

  // Target pick with its parent bet, category constraint, and every sibling
  // pick's player link (opponent rule). RLS hides picks of hidden bets, so a
  // non-admin placing on one lands in the 404 below.
  const { data: pickData, error: pickError } = await supabase
    .from("bet_picks")
    .select(
      "id, player_user_id, american_odds, bets ( id, tournament_id, status, phase, bet_categories ( allows_multiple_picks ), bet_picks ( player_user_id ) )"
    )
    .eq("id", body.pick_id)
    .maybeSingle()
  if (pickError) {
    return NextResponse.json(
      { error: `Couldn't load that pick: ${pickError.message}` },
      { status: 500 }
    )
  }
  const target = pickData
    ? normalizeTargetPick(pickData as unknown as PickQueryRow)
    : null
  if (!target) {
    return NextResponse.json({ error: "Pick not found." }, { status: 404 })
  }

  // The tournaments row is the rulebook — passed verbatim to validation.
  const { data: tournamentData } = await supabase
    .from("tournaments")
    .select(TOURNAMENT_RULE_COLUMNS)
    .eq("id", target.tournament_id)
    .maybeSingle()
  if (!tournamentData) {
    return NextResponse.json(
      { error: "Couldn't load the tournament rules." },
      { status: 500 }
    )
  }
  const rules = toTournamentRules(
    tournamentData as unknown as Record<string, unknown>
  )

  // Non-participants can browse the menu but never wager.
  const { data: participantData } = await supabase
    .from("tournament_participants")
    .select("user_id, entry_fee, is_player")
    .eq("user_id", user.id)
    .eq("tournament_id", target.tournament_id)
    .maybeSingle()
  if (!participantData) {
    return NextResponse.json(
      { error: "You're not registered for this tournament — ask an admin to add you." },
      { status: 403 }
    )
  }

  // The bettor's live placements across the whole tournament — the running
  // total and self-bet rules span both phases. deleted_at IS NULL here; the
  // no-filter read happens only for the revive lookup below.
  const { data: placementsData, error: placementsError } = await supabase
    .from("bet_placements")
    .select(
      "pick_id, amount, bet_picks ( player_user_id, bets ( id, phase, tournament_id ) )"
    )
    .eq("user_id", user.id)
    .is("deleted_at", null)
  if (placementsError) {
    return NextResponse.json(
      { error: `Couldn't load your placements: ${placementsError.message}` },
      { status: 500 }
    )
  }
  const existing = normalizeExistingPlacements(
    (placementsData ?? []) as unknown as PlacementQueryRow[],
    target.tournament_id
  )

  const ctx = buildPlacementContext(
    participantData as ParticipantRow,
    target,
    existing
  )
  // Rule violations surface validation's messages verbatim — the client
  // renders them as-is.
  const verdict = validatePlacement(ctx, body.amount, rules)
  if (!verdict.ok) {
    return NextResponse.json({ errors: verdict.errors }, { status: 400 })
  }

  // Own row on this pick, read WITHOUT filtering deleted_at (the own-rows
  // SELECT policy deliberately allows it) so a soft-deleted row revives
  // instead of colliding with UNIQUE (user_id, pick_id).
  const { data: ownRowData } = await supabase
    .from("bet_placements")
    .select("id, deleted_at")
    .eq("user_id", user.id)
    .eq("pick_id", body.pick_id)
    .maybeSingle()

  const plan = planWrite(
    (ownRowData as OwnPlacementRow | null) ?? null,
    body.amount,
    target.current_american_odds,
    verdict.requires_admin_review
  )

  if (plan.kind === "insert") {
    const { data, error } = await supabase
      .from("bet_placements")
      .insert({ user_id: user.id, pick_id: body.pick_id, ...plan.fields })
      .select(PLACEMENT_RETURN_COLUMNS)
      .single()
    if (error) {
      return NextResponse.json(
        { error: `Placing the bet failed: ${error.message}` },
        { status: 500 }
      )
    }
    return NextResponse.json(
      { placement: toClientPlacement(data as PlacementReturnRow) },
      { status: 201 }
    )
  }

  const { data, error } = await supabase
    .from("bet_placements")
    .update(plan.fields)
    .eq("id", plan.id)
    .select(PLACEMENT_RETURN_COLUMNS)
    .single()
  if (error) {
    return NextResponse.json(
      { error: `Updating the bet failed: ${error.message}` },
      { status: 500 }
    )
  }
  return NextResponse.json({
    placement: toClientPlacement(data as PlacementReturnRow),
  })
}

export async function POST(request: Request) {
  return placeOrEdit(request)
}

export async function PATCH(request: Request) {
  return placeOrEdit(request)
}

// Remove a wager: { pick_id }. Soft delete — sets deleted_at; the row stays
// for history and revives if the bettor re-places while the bet is open.
export async function DELETE(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 })
  }

  const body = parseDeleteBody(await readJson(request))
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: 400 })
  }

  const { data: rowData, error: rowError } = await supabase
    .from("bet_placements")
    .select("id, deleted_at, bet_picks ( bets ( status ) )")
    .eq("user_id", user.id)
    .eq("pick_id", body.pick_id)
    .maybeSingle()
  if (rowError) {
    return NextResponse.json(
      { error: `Couldn't load your placement: ${rowError.message}` },
      { status: 500 }
    )
  }
  const row = rowData as
    | {
        id: string
        deleted_at: string | null
        bet_picks:
          | { bets: { status: string } | { status: string }[] | null }
          | { bets: { status: string } | { status: string }[] | null }[]
          | null
      }
    | null
  if (!row || row.deleted_at !== null) {
    return NextResponse.json(
      { error: "You have no bet on this pick." },
      { status: 404 }
    )
  }

  const pickJoin = Array.isArray(row.bet_picks) ? row.bet_picks[0] : row.bet_picks
  const betJoin = pickJoin
    ? Array.isArray(pickJoin.bets)
      ? pickJoin.bets[0]
      : pickJoin.bets
    : null
  const openError = validateBetOpen(
    (betJoin?.status ?? "closed") as "hidden" | "open" | "closed"
  )
  if (openError) {
    return NextResponse.json({ errors: [openError] }, { status: 400 })
  }

  const { error } = await supabase
    .from("bet_placements")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", row.id)
  if (error) {
    return NextResponse.json(
      { error: `Removing the bet failed: ${error.message}` },
      { status: 500 }
    )
  }
  return NextResponse.json({ removed: true })
}
