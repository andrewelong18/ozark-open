import { NextResponse } from "next/server"
import { requireAdminRoute as requireAdmin } from "@/lib/admin-gate"
import { createClient } from "@/lib/supabase/server"
import { TOURNAMENT_RULE_COLUMNS, toTournamentRules } from "@/lib/placements"
import { validateEntryFee, type TournamentRules } from "@/lib/validation"
import type { Phase } from "@/lib/phases"
import { normalizeDisplayName, validateDisplayName } from "@/lib/profile"
import { parsePaidAmount } from "@/lib/collection"

// Admin bettor-approval endpoint (Sprint 16; per-phase entries since Sprint
// 30 / ADR 0002). This is the automated replacement for hand-adding a
// tournament_participants row in Studio:
//   POST   — approve a registrant (verify/correct their display_name, then
//            CREATE the participant row with one entry per phase they are in
//            + player flag). Also RE-approves: it clears revoked_at on an
//            existing row, which the UNIQUE (user_id, tournament_id)
//            constraint requires anyway.
//   PATCH  — edit an existing participant's phase entries / player flag,
//            record entry money collected (paid_amount / paid_note), and/or
//            correct their display_name (Sprint 23 / #99).
//   DELETE — revoke (stamp revoked_at → back to view-only).
//
// Revoke is a SOFT revoke (Sprint 21 / #91). A hard DELETE took the entry fee
// with it while the bettor's placements survived, so the pool silently shrank.
// Eligibility is now "row exists AND revoked_at IS NULL" AND an entry for the
// phase; the row keeps the entries so re-approval restores the member, their
// entries and their wagers exactly.
//
// AN ENTRY CANNOT DROP BELOW WHAT IS WAGERED IN ITS PHASE. That is not checked
// here — it is enforce_participant_entry() (migration 20260914000000), which
// raises SQLSTATE OZ002 with a sentence an admin can act on, and this route
// maps it to a 400. A TypeScript pre-check would be the read-decide-write A18
// warned about: a placement can land between the read and the write.
//
// Writes to tournament_participants are already admin-only at the DB (RLS);
// the users.display_name write bypasses the self-update guard because it runs
// under an admin session. We still gate is_admin here for clean 403s.

const PARTICIPANT_RETURN =
  "user_id, phase1_entry_fee, phase2_entry_fee, is_player, paid_amount, paid_note"

/** The single active tournament (latest by year) + its rule bounds.
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
 * One phase entry from the body. `undefined` = the field wasn't sent (leave
 * it alone on PATCH); `null`, "" or 0 = not entered in that phase; a number =
 * validated against the tournament's bounds and named by phase.
 */
type ParsedEntry =
  | { ok: true; value: number | null | undefined }
  | { ok: false; error: string }

function parseEntry(raw: unknown, phase: Phase, rules: TournamentRules): ParsedEntry {
  if (raw === undefined) return { ok: true, value: undefined }
  if (raw === null || raw === "" || raw === 0 || raw === "0") return { ok: true, value: null }
  const n = Number(raw)
  if (!Number.isFinite(n)) return { ok: false, error: `Phase ${phase} entry must be a number.` }
  const feeError = validateEntryFee(n, rules, phase)
  if (feeError) return { ok: false, error: feeError }
  return { ok: true, value: n }
}

/** SQLSTATE raised by enforce_participant_entry() when an entry would drop
 *  below the bettor's live wagers in that phase. Read like a rule, not a
 *  crash — the sentence is the trigger's own. */
const ENTRY_UNDER_WAGERS_SQLSTATE = "OZ002"

function entryUnderWagers(error: { code?: string | null; message: string }): boolean {
  return (
    error.code === ENTRY_UNDER_WAGERS_SQLSTATE ||
    /Can't set the Phase [12] entry/.test(error.message)
  )
}

/**
 * Write a corrected display_name, shared by approve (POST) and edit (PATCH).
 * An absent/blank field means "leave it alone" — only approval has a name box
 * that's always populated, and a PATCH that only moves an entry mustn't
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

  const phase1 = parseEntry(body.phase1EntryFee, 1, rules)
  if (!phase1.ok) return NextResponse.json({ errors: [phase1.error] }, { status: 400 })
  const phase2 = parseEntry(body.phase2EntryFee, 2, rules)
  if (!phase2.ok) return NextResponse.json({ errors: [phase2.error] }, { status: 400 })
  // Approval is "they're in": at least one phase, or there is nothing to
  // approve them into. An absent field reads as not entered here — this is
  // the create, so there is nothing to leave alone.
  const entry1 = phase1.value ?? null
  const entry2 = phase2.value ?? null
  if (entry1 === null && entry2 === null) {
    return NextResponse.json(
      { errors: ["Enter at least one phase entry — Phase 1, Phase 2 or both."] },
      { status: 400 }
    )
  }

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
        phase1_entry_fee: entry1,
        phase2_entry_fee: entry2,
        is_player: isPlayer,
        revoked_at: null,
      },
      { onConflict: "user_id,tournament_id" }
    )
    .select(PARTICIPANT_RETURN)
    .single()
  if (error) {
    if (entryUnderWagers(error)) {
      return NextResponse.json({ errors: [error.message] }, { status: 400 })
    }
    return NextResponse.json(
      { error: `Couldn't approve: ${error.message}` },
      { status: 500 }
    )
  }
  return NextResponse.json({ participant: data }, { status: 201 })
}

// Edit an existing participant's phase entries / player flag, and/or correct
// their display name (Sprint 23 / #99).
//
// The name is written INDEPENDENTLY of the participant row, and either half may
// be absent: display_name lives on `users`, so a name-only edit must not fall
// into the "Nothing to update." branch below, and an entry-only edit must not
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

  const update: {
    phase1_entry_fee?: number | null
    phase2_entry_fee?: number | null
    is_player?: boolean
    paid_amount?: number
    paid_at?: string | null
    paid_note?: string | null
  } = {}
  const phase1 = parseEntry(body.phase1EntryFee, 1, rules)
  if (!phase1.ok) return NextResponse.json({ errors: [phase1.error] }, { status: 400 })
  if (phase1.value !== undefined) update.phase1_entry_fee = phase1.value
  const phase2 = parseEntry(body.phase2EntryFee, 2, rules)
  if (!phase2.ok) return NextResponse.json({ errors: [phase2.error] }, { status: 400 })
  if (phase2.value !== undefined) update.phase2_entry_fee = phase2.value
  if (typeof body.isPlayer === "boolean") update.is_player = body.isPlayer

  // Entry collection (A17). Recorded, never decided: this endpoint takes an
  // amount and a note and stamps when it was recorded. It does NOT check the
  // amount against the entries — partial payments and the occasional
  // overpayment are both real, and "paid in full" is derived at read time
  // rather than enforced here. And it is never a pool input: the pots are
  // built from the entries whether or not the money arrived.
  if (body.paidAmount !== undefined) {
    const parsed = parsePaidAmount(body.paidAmount)
    if (!parsed.ok) {
      return NextResponse.json({ errors: [parsed.error] }, { status: 400 })
    }
    update.paid_amount = parsed.amount
    // Stamped on every recorded amount, INCLUDING a correction back to 0 —
    // paid_at answers "when did an admin last touch this", not "when did the
    // money arrive", and clearing it on a correction would lose that.
    update.paid_at = new Date().toISOString()
  }
  if (typeof body.paidNote === "string") {
    update.paid_note = body.paidNote.trim() || null
  }

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
    .select(PARTICIPANT_RETURN)
    .single()
  if (error) {
    if (entryUnderWagers(error)) {
      return NextResponse.json({ errors: [error.message] }, { status: 400 })
    }
    return NextResponse.json({ error: `Couldn't update: ${error.message}` }, { status: 500 })
  }
  return NextResponse.json({ participant: data })
}

// Revoke betting access — stamp revoked_at, keep the row (and the entries).
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
