import { NextResponse } from "next/server"
import { requireAdminRoute as requireAdmin } from "@/lib/admin-gate"
import { parseAdminDeleteBody, parseAdminPlacementBody } from "@/lib/placements"
import { placeOrEditPlacement, removePlacement } from "@/lib/placement-write"

// Admin on-behalf placements (Sprint 23 / #101, ADR 0001 §13) — Pat entering a
// wager for a member who can't work the magic-link flow.
//
//   POST / PATCH — place or edit { userId, pick_id, amount } for that member
//   DELETE       — remove { userId, pick_id } (soft delete, as always)
//
// The whole route is identity plumbing. The money path is
// lib/placement-write.ts, shared verbatim with /api/placements; the only
// difference is that bettor and actor are two different people here:
//
//   bettor = body.userId   → every §7 rule, every limit, requires_admin_review
//   actor  = gate.user.id  → placed_by_user_id, and nothing else
//
// Both halves are enforced below the app too. The DB's admin INSERT/UPDATE
// policies require public.is_admin() AND placed_by_user_id = auth.uid(), so a
// forged attribution is refused by Postgres rather than by our good intentions
// — and the member's own "only as yourself" policies were never loosened to
// make this work.
//
// An admin gate is permission to act FOR someone, not permission to break the
// tournament's rules: the shared path still refuses a revoked participant, a
// bet that isn't open, a phase past its deadline, and every §7 violation —
// evaluated against the member, not against Pat.

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

async function placeOrEdit(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase, user } = gate

  const body = parseAdminPlacementBody(await readJson(request))
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: 400 })
  }

  const outcome = await placeOrEditPlacement(
    supabase,
    { bettor_id: body.user_id, actor_id: user.id },
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

export async function DELETE(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase, user } = gate

  const body = parseAdminDeleteBody(await readJson(request))
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: 400 })
  }

  const outcome = await removePlacement(
    supabase,
    { bettor_id: body.user_id, actor_id: user.id },
    { pick_id: body.pick_id }
  )
  return NextResponse.json(outcome.body, { status: outcome.status })
}
