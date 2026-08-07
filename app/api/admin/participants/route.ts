import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { TOURNAMENT_RULE_COLUMNS, toTournamentRules } from "@/lib/placements"
import { validateEntryFee } from "@/lib/validation"
import { normalizeDisplayName, validateDisplayName } from "@/lib/profile"

// Admin bettor-approval endpoint (Sprint 16). This is the automated
// replacement for hand-adding a tournament_participants row in Studio:
//   POST   — approve a registrant (verify/correct their display_name, then
//            CREATE the participant row with an entry fee + player flag).
//            Also RE-approves: it clears revoked_at on an existing row, which
//            the UNIQUE (user_id, tournament_id) constraint requires anyway.
//   PATCH  — edit an existing participant's entry fee / player flag.
//   DELETE — revoke (stamp revoked_at → back to view-only).
//
// Revoke is a SOFT revoke (Sprint 21 / #91). A hard DELETE took the entry fee
// with it while the bettor's placements survived, so the pool silently shrank.
// Eligibility is now "row exists AND revoked_at IS NULL"; the row keeps the fee
// so re-approval restores the member, their fee and their wagers exactly.
//
// Writes to tournament_participants are already admin-only at the DB (RLS);
// the users.display_name write bypasses the self-update guard because it runs
// under an admin session. We still gate is_admin here for clean 403s.

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) }
  const { data: profile } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle()
  if (!(profile as { is_admin: boolean } | null)?.is_admin) {
    return { error: NextResponse.json({ error: "Admins only." }, { status: 403 }) }
  }
  return { supabase }
}

/** The single active tournament (latest by year) + its entry-fee rule bounds. */
async function activeTournament(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase
    .from("tournaments")
    .select(`id, ${TOURNAMENT_RULE_COLUMNS}`)
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle()
  return data as ({ id: string } & Record<string, unknown>) | null
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function asObject(raw: unknown): Record<string, unknown> | null {
  return typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : null
}

// Approve: create the participant row (and verify/correct the display name).
export async function POST(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const body = asObject(await readJson(request))
  if (!body || typeof body.userId !== "string") {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 })
  }

  const tournament = await activeTournament(supabase)
  if (!tournament) {
    return NextResponse.json({ error: "No tournament to approve into." }, { status: 400 })
  }
  const rules = toTournamentRules(tournament)

  const entryFee = Number(body.entryFee)
  const feeError = validateEntryFee(entryFee, rules)
  if (feeError) return NextResponse.json({ errors: [feeError] }, { status: 400 })

  const isPlayer = body.isPlayer !== false // default true, matches the schema

  // Optional name correction — the admin-verify step (import name-matching).
  const displayName = normalizeDisplayName(body.displayName)
  if (displayName !== "") {
    const nameError = validateDisplayName(displayName)
    if (nameError) return NextResponse.json({ errors: [nameError] }, { status: 400 })
    const { error: nameUpdateError } = await supabase
      .from("users")
      .update({ display_name: displayName })
      .eq("id", body.userId)
    if (nameUpdateError) {
      return NextResponse.json(
        { error: `Couldn't update the name: ${nameUpdateError.message}` },
        { status: 500 }
      )
    }
  }

  // Upsert, not insert: re-approving someone who was revoked has to reuse
  // their row (UNIQUE (user_id, tournament_id)) and clear revoked_at.
  const { data, error } = await supabase
    .from("tournament_participants")
    .upsert(
      {
        user_id: body.userId,
        tournament_id: tournament.id,
        entry_fee: entryFee,
        is_player: isPlayer,
        revoked_at: null,
      },
      { onConflict: "user_id,tournament_id" }
    )
    .select("user_id, entry_fee, is_player")
    .single()
  if (error) {
    return NextResponse.json(
      { error: `Couldn't approve: ${error.message}` },
      { status: 500 }
    )
  }
  return NextResponse.json({ participant: data }, { status: 201 })
}

// Edit an existing participant's entry fee / player flag.
export async function PATCH(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const body = asObject(await readJson(request))
  if (!body || typeof body.userId !== "string") {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 })
  }

  const tournament = await activeTournament(supabase)
  if (!tournament) {
    return NextResponse.json({ error: "No tournament." }, { status: 400 })
  }
  const rules = toTournamentRules(tournament)

  const update: { entry_fee?: number; is_player?: boolean } = {}
  if (body.entryFee !== undefined) {
    const entryFee = Number(body.entryFee)
    const feeError = validateEntryFee(entryFee, rules)
    if (feeError) return NextResponse.json({ errors: [feeError] }, { status: 400 })
    update.entry_fee = entryFee
  }
  if (typeof body.isPlayer === "boolean") update.is_player = body.isPlayer
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("tournament_participants")
    .update(update)
    .eq("user_id", body.userId)
    .eq("tournament_id", tournament.id)
    .select("user_id, entry_fee, is_player")
    .single()
  if (error) {
    return NextResponse.json({ error: `Couldn't update: ${error.message}` }, { status: 500 })
  }
  return NextResponse.json({ participant: data })
}

// Revoke betting access — stamp revoked_at, keep the row (and the entry fee).
export async function DELETE(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const body = asObject(await readJson(request))
  if (!body || typeof body.userId !== "string") {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 })
  }

  const tournament = await activeTournament(supabase)
  if (!tournament) {
    return NextResponse.json({ error: "No tournament." }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("tournament_participants")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", body.userId)
    .eq("tournament_id", tournament.id)
    .is("revoked_at", null)
    .select("user_id")
    .maybeSingle()
  if (error) {
    return NextResponse.json({ error: `Couldn't revoke: ${error.message}` }, { status: 500 })
  }
  // No row matched: they were never approved, or they're already revoked. The
  // old hard-DELETE reported success either way; say so instead.
  if (!data) {
    return NextResponse.json(
      { error: "Nothing to revoke — they aren't an approved bettor." },
      { status: 400 }
    )
  }
  return NextResponse.json({ revoked: true })
}
