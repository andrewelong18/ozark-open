import { NextResponse } from "next/server"
import { requireAdminRoute as requireAdmin } from "@/lib/admin-gate"
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
//   PATCH  — edit an existing participant's entry fee / player flag, and/or
//            correct their display_name (Sprint 23 / #99).
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

/** The single active tournament (latest by year) + its entry-fee rule bounds.
 *  Returns a ready-to-return error response when the LOOKUP fails, separately
 *  from a null row meaning "there is no tournament" (#132) — approving someone
 *  against unreadable fee bounds is exactly the write to refuse. Same union
 *  shape as requireAdminRoute, so callers read the same way. */
async function activeTournament(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{
  tournament: ({ id: string } & Record<string, unknown>) | null
  error?: NextResponse
}> {
  const { data, error } = await supabase
    .from("tournaments")
    .select(`id, ${TOURNAMENT_RULE_COLUMNS}`)
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    return {
      tournament: null,
      error: NextResponse.json(
        { error: `Couldn't load the tournament: ${error.message}` },
        { status: 500 }
      ),
    }
  }
  return { tournament: data as ({ id: string } & Record<string, unknown>) | null }
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

/**
 * Write a corrected display_name, shared by approve (POST) and edit (PATCH).
 * An absent/blank field means "leave it alone" — only approval has a name box
 * that's always populated, and a PATCH that only moves the entry fee mustn't
 * blank the name out.
 *
 * TWO things have to permit this write, and until #124 only one of them
 * existed:
 *
 *   RLS policy  — decides whether the row is visible to the UPDATE at all.
 *                 "Admins can update any user" (20260814000000). Before that
 *                 migration the only UPDATE policy was USING (auth.uid() = id),
 *                 so this function was a SILENT NO-OP for every user but the
 *                 acting admin — zero rows matched, PostgREST returned success
 *                 with no error, and the console said "saved".
 *   Trigger     — `guard_users_self_update` pins display_name once onboarded_at
 *                 is set, but exempts admins (Sprint 16 / #99).
 *
 * RLS runs FIRST. The trigger's admin exemption was written expecting a row to
 * reach it; without the policy, none did. Every local harness runs SQL as
 * superuser (RLS bypassed), which is why this shipped green.
 *
 * Hence `.select()` and the zero-row check below: this failure mode is silent
 * by construction, so the absence of an error is not evidence the write landed.
 */
async function writeDisplayName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  raw: unknown
): Promise<NextResponse | null> {
  const displayName = normalizeDisplayName(raw)
  if (displayName === "") return null

  const nameError = validateDisplayName(displayName)
  if (nameError) return NextResponse.json({ errors: [nameError] }, { status: 400 })

  const { data, error } = await supabase
    .from("users")
    .update({ display_name: displayName })
    .eq("id", userId)
    .select("id")
    .maybeSingle()
  if (error) {
    return NextResponse.json(
      { error: `Couldn't update the name: ${error.message}` },
      { status: 500 }
    )
  }
  if (!data) {
    // No error and no row: RLS filtered the UPDATE to nothing, or the user id
    // doesn't exist. Never report this as success — display_name is what
    // lib/import.ts matches picks to people by, so a name that silently didn't
    // change disables that member's self-bet cap, self-pick flag and opponent
    // block on the next upload.
    return NextResponse.json(
      {
        error:
          "The name didn't save — no matching account, or the database refused the update. " +
          "Check that you're still signed in as an admin.",
      },
      { status: 500 }
    )
  }
  return null
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

  const { tournament, error: tournamentError } = await activeTournament(supabase)
  if (tournamentError) return tournamentError
  if (!tournament) {
    return NextResponse.json({ error: "No tournament to approve into." }, { status: 400 })
  }
  const rules = toTournamentRules(tournament)

  const entryFee = Number(body.entryFee)
  const feeError = validateEntryFee(entryFee, rules)
  if (feeError) return NextResponse.json({ errors: [feeError] }, { status: 400 })

  const isPlayer = body.isPlayer !== false // default true, matches the schema

  // Optional name correction — the admin-verify step (import name-matching).
  const nameFailure = await writeDisplayName(supabase, body.userId, body.displayName)
  if (nameFailure) return nameFailure

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

// Edit an existing participant's entry fee / player flag, and/or correct their
// display name (Sprint 23 / #99).
//
// The name is written INDEPENDENTLY of the participant row, and either half may
// be absent: display_name lives on `users`, so a name-only edit must not fall
// into the "Nothing to update." branch below, and a fee-only edit must not
// touch the name. #99 is a rules fix, not a cosmetic one — lib/import.ts links
// picks to people by matching display_name, so a wrong name silently disables
// that person's self-bet cap, self-pick flag and opponent block.
export async function PATCH(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const body = asObject(await readJson(request))
  if (!body || typeof body.userId !== "string") {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 })
  }

  const { tournament, error: tournamentError } = await activeTournament(supabase)
  if (tournamentError) return tournamentError
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

  const nameGiven = normalizeDisplayName(body.displayName) !== ""
  if (!nameGiven && Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 })
  }

  const nameFailure = await writeDisplayName(supabase, body.userId, body.displayName)
  if (nameFailure) return nameFailure

  // Name-only edit: there's no participant row change to make, and there may
  // not even be a participant row (a stalled member can have a typo'd name too).
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ participant: null })
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

  const { tournament, error: tournamentError } = await activeTournament(supabase)
  if (tournamentError) return tournamentError
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
