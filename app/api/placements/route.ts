import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { parseDeleteBody, parsePlacementBody } from "@/lib/placements"
import { placeOrEditPlacement, removePlacement } from "@/lib/placement-write"

// Placement endpoint (Sprint 4) — a member wagering for themselves.
//
// The write path itself lives in lib/placement-write.ts (Sprint 23 / #101), so
// this route and the admin on-behalf route run the SAME code with different
// identities. Here bettor and actor are both the signed-in user, which is what
// makes placed_by_user_id NULL: nobody entered this wager on anyone's behalf.
//
// Writes run under the bettor's own session; the bet_placements RLS policies
// are the backstop (own rows only, parent bet open).

async function readJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

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

  const outcome = await placeOrEditPlacement(
    supabase,
    { bettor_id: user.id, actor_id: user.id },
    { pick_id: body.pick_id, amount: body.amount }
  )
  return NextResponse.json(outcome.body, { status: outcome.status })
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

  const outcome = await removePlacement(
    supabase,
    { bettor_id: user.id, actor_id: user.id },
    { pick_id: body.pick_id }
  )
  return NextResponse.json(outcome.body, { status: outcome.status })
}
