import { NextResponse } from "next/server"
import { requireAdminRoute as requireAdmin } from "@/lib/admin-gate"
import { createClient } from "@/lib/supabase/server"
import { AdminClientUnavailableError, createAdminClient } from "@/lib/supabase/admin"
import { parseNewMemberBody, validateNewMember } from "@/lib/members"

// Create a member without an email round-trip (Sprint 23 / #124 — half 1 of
// #101). Pat's ask from the Jul 31 dry run: some members won't get through the
// magic-link flow, and Thursday morning with ~32 people is the wrong time to
// discover there's no way to add them.
//
// THE ONLY IMPORTER OF lib/supabase/admin.ts. That is a load-bearing property,
// pinned by lib/admin-client-containment.test.ts — read that file's header
// before adding a second one.
//
// ---------------------------------------------------------------------------
// The shape of the flow, and why it's split
//
//   1. POST here          — create the auth account + name it.
//   2. POST /api/admin/participants — approve them (entry fee, player flag).
//
// Two calls, not one, on purpose: step 2 is the ALREADY-SHIPPED approval path
// (Sprint 16 / #91), and it owns the money. It validates the entry fee against
// the tournaments row and it's what creates the tournament_participants row
// whose existence — with revoked_at IS NULL — *is* betting eligibility
// (PRD §12 A12/A13). Re-implementing any of that here would give the pool two
// sources of truth. The console makes both calls back to back so it's one
// button to the admin.
//
// If step 2 fails, the person is left exactly where a normal registrant sits
// before approval: visible in the console, not eligible to bet, no entry fee in
// the pool. That's a safe resting state, not a broken one.
//
// ---------------------------------------------------------------------------
// Where the service-role key is used, and where it deliberately isn't
//
// It creates the auth account. That's all. The public.users write below runs on
// the ADMIN'S OWN SESSION and is authorized by the "Admins can update any user"
// policy (20260814000000) — so RLS stays the real boundary instead of becoming
// something we bypassed because a bypass was already in the file.

/** Escape LIKE metacharacters before using a user-supplied value as an ilike
 *  pattern. `_` is legal in an email address and is a single-char wildcard in
 *  LIKE, so an unescaped `dan_smith@x.com` would also match `danXsmith@x.com`
 *  and report a duplicate that doesn't exist. */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase, user } = gate

  const parsed = parseNewMemberBody(await readJson(request))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const verdict = validateNewMember(parsed.value)
  if (!verdict.ok) return NextResponse.json({ errors: verdict.errors }, { status: 400 })

  const { email, normalizedEmail, displayName } = parsed.value

  // Pre-check for an existing account. Pat will absolutely try this on someone
  // who already registered — the console shows registered-but-unapproved people
  // in the same place — so the answer needs to point at Approve rather than
  // read as a failure.
  const { data: existing, error: existingError } = await supabase
    .from("users")
    .select("id, display_name")
    .ilike("email", escapeLikePattern(normalizedEmail))
    .maybeSingle()
  if (existingError) {
    return NextResponse.json(
      { error: `Couldn't check for an existing account: ${existingError.message}` },
      { status: 500 }
    )
  }
  if (existing) {
    const row = existing as { id: string; display_name: string }
    return NextResponse.json(
      {
        error: `${row.display_name} already has an account with that address — approve them from the list instead of adding them again.`,
        userId: row.id,
      },
      { status: 409 }
    )
  }

  // --- the one service-role call ------------------------------------------
  let adminClient: ReturnType<typeof createAdminClient>
  try {
    adminClient = createAdminClient()
  } catch (error) {
    if (error instanceof AdminClientUnavailableError) {
      // 503, not 500: the deployment is missing configuration, and the admin
      // can neither retry into success nor fix it from the app.
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    throw error
  }

  // email_confirm: true is the entire point — it marks the address confirmed
  // WITHOUT sending anything, so no email round-trip happens. The account is a
  // completely ordinary one: if this member later works out the magic link,
  // they sign in to THIS account and their wagers, fee and name are all intact.
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    email_confirm: true,
  })
  if (createError || !created?.user) {
    const message = createError?.message ?? "Supabase returned no account."
    // GoTrue enforces email uniqueness too. Losing the pre-check race, or an
    // auth.users row with no public.users row, both land here.
    const isDuplicate = /already been registered|already exists|duplicate/i.test(message)
    return NextResponse.json(
      {
        error: isDuplicate
          ? "That address already has an account. Refresh the page — they should be in the list."
          : `Couldn't create the account: ${message}`,
      },
      { status: isDuplicate ? 409 : 500 }
    )
  }

  const userId = created.user.id

  // --- back on the admin's own session, subject to RLS ---------------------
  //
  // handle_new_user() has already inserted the public.users row, seeding
  // display_name with the email address. Replace it with the real name, and
  // stamp onboarded_at.
  //
  // onboarded_at is stamped DELIBERATELY. Leaving it NULL would drop this
  // member into the first-run onboarding gate, where guard_users_self_update
  // lets them overwrite display_name — mid-tournament, on the field
  // lib/import.ts matches picks by. The admin has just named them, so
  // onboarding is done: the name stays admin-owned (PRD §12 A10/A12), and the
  // member lands on /dashboard if they do sign in. 20260720000000 stamped the
  // same column for the same reason when it shipped.
  //
  // .select() and a zero-row check, because an UPDATE that RLS filters to
  // nothing returns success with no error — exactly the bug this sprint found
  // in writeDisplayName() and fixed in 20260814000000.
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .update({
      display_name: displayName,
      onboarded_at: new Date().toISOString(),
      created_by_user_id: user.id,
    })
    .eq("id", userId)
    .select("id")
    .maybeSingle()

  if (profileError || !profile) {
    // The account exists and cannot be un-created safely, so say so precisely.
    // The resting state is recoverable and visible: the person shows up in the
    // console with their email as their display name, and the existing edit
    // panel fixes it. Returning userId lets the console point straight at them.
    return NextResponse.json(
      {
        error:
          `The account was created, but setting the name failed` +
          `${profileError ? `: ${profileError.message}` : " (no row updated)"}. ` +
          `Find ${email} in the list and set their name before uploading picks — ` +
          `pick matching depends on it.`,
        userId,
      },
      { status: 500 }
    )
  }

  return NextResponse.json({ userId, email, displayName }, { status: 201 })
}
