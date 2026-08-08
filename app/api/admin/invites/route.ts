import { NextResponse } from "next/server"
import { requireAdminRoute as requireAdmin } from "@/lib/admin-gate"
import { parseInviteList } from "@/lib/invites"
import { normalizeEmail } from "@/lib/roster"

// Bulk invite entry (Sprint 20, closes #82). The expected roster used to be
// typed into tournament_invites one Studio row at a time — the step most likely
// to be skipped, which would leave the console's funnel starting one stage in.
//
//   POST — a pasted list of "name, email" lines → invite rows for the active
//          tournament. Additive only: it inserts what's missing and fills in a
//          name that changed. Nothing is ever deleted here (Studio handles the
//          one-off removal; ADR 0001 §7 keeps it the CMS).
//
// Idempotent by construction, so a re-paste of the same list is safe: the diff
// below is computed against the rows already stored, keyed on the normalized
// email — the same key as the table's (tournament_id, lower(email)) unique
// index. That index is on an EXPRESSION, which PostgREST's on_conflict can't
// name, so this diffs and writes rather than upserting.

/** Whole-paste guard — this is a roster of ~32 people, not an import format. */
const MAX_LINES = 500

export async function POST(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    body = null
  }
  const text =
    typeof body === "object" && body !== null && typeof (body as { text?: unknown }).text === "string"
      ? ((body as { text: string }).text)
      : null
  if (text === null) {
    return NextResponse.json({ error: "Paste a list first." }, { status: 400 })
  }
  if (text.split(/\r?\n/).length > MAX_LINES) {
    return NextResponse.json(
      { error: `That's more than ${MAX_LINES} lines — split it up.` },
      { status: 400 }
    )
  }

  const { data: tournamentData } = await supabase
    .from("tournaments")
    .select("id")
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle()
  const tournament = tournamentData as { id: string } | null
  if (!tournament) {
    return NextResponse.json({ error: "No tournament to invite into." }, { status: 400 })
  }

  const { entries, skipped } = parseInviteList(text)
  if (entries.length === 0) {
    return NextResponse.json({ added: 0, updated: 0, unchanged: 0, skipped })
  }

  const { data: existingData, error: readError } = await supabase
    .from("tournament_invites")
    .select("id, email, invited_name")
    .eq("tournament_id", tournament.id)
  if (readError) {
    return NextResponse.json(
      { error: `Couldn't read the invite list: ${readError.message}` },
      { status: 500 }
    )
  }
  const existing = (existingData ?? []) as {
    id: string
    email: string
    invited_name: string | null
  }[]
  const byEmail = new Map(existing.map((row) => [normalizeEmail(row.email), row]))

  const toInsert: { tournament_id: string; email: string; invited_name: string | null }[] = []
  const toRename: { id: string; invited_name: string }[] = []
  let unchanged = 0

  for (const entry of entries) {
    const current = byEmail.get(entry.normalizedEmail)
    if (!current) {
      toInsert.push({
        tournament_id: tournament.id,
        email: entry.email,
        invited_name: entry.name === "" ? null : entry.name,
      })
      continue
    }
    // A re-paste that adds names upgrades the rows; a blank name never wipes
    // one that's already there.
    if (entry.name !== "" && entry.name !== (current.invited_name ?? "")) {
      toRename.push({ id: current.id, invited_name: entry.name })
    } else {
      unchanged += 1
    }
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from("tournament_invites").insert(toInsert)
    if (error) {
      return NextResponse.json(
        { error: `Couldn't add the invites: ${error.message}` },
        { status: 500 }
      )
    }
  }

  for (const row of toRename) {
    const { error } = await supabase
      .from("tournament_invites")
      .update({ invited_name: row.invited_name })
      .eq("id", row.id)
    if (error) {
      return NextResponse.json(
        { error: `Couldn't update a name: ${error.message}` },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({
    added: toInsert.length,
    updated: toRename.length,
    unchanged,
    skipped,
  })
}
