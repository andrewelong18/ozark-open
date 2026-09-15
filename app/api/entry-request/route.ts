import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  entryStatus,
  parseEntryRequestBody,
  requestWindow,
  validateEntryRequest,
} from "@/lib/entry-request"
import {
  PARTICIPANT_ENTRY_COLUMNS,
  TOURNAMENT_CLOCK_COLUMNS,
  TOURNAMENT_RULE_COLUMNS,
  toPhaseClock,
  toTournamentRules,
} from "@/lib/placements"

// The entry request (Sprint 30 / PRD §12 A26): a member's one-time ask to put
// money in. Runs under the caller's own session — RLS lets a member insert
// exactly one row for themselves and nothing else (migration
// 20260914000001), so the "one time" rule is the database's, not this
// file's. What lives here is the money rule (lib/entry-request.ts) and the
// sentence for each way the ask can be refused.

const REQUEST_RETURN = "id, phase1_amount, phase2_amount, is_player, created_at"

/** UNIQUE (tournament_id, user_id) — the second request. */
const UNIQUE_VIOLATION = "23505"

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 })
  }

  let raw: unknown = null
  try {
    raw = await request.json()
  } catch {}
  const parsed = parseEntryRequestBody(raw)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  // The rulebook and the clock. 'completed' is included so the window can
  // say "closed" rather than "no tournament".
  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select(`id, status, ${TOURNAMENT_RULE_COLUMNS}, ${TOURNAMENT_CLOCK_COLUMNS}`)
    .in("status", ["upcoming", "active", "completed"])
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (tournamentError) {
    return NextResponse.json(
      { error: `Couldn't load the tournament: ${tournamentError.message}` },
      { status: 500 }
    )
  }
  if (!tournament) {
    return NextResponse.json({ error: "There's no tournament to enter yet." }, { status: 400 })
  }
  const row = tournament as unknown as Record<string, unknown>
  const rules = toTournamentRules(row)
  const window = requestWindow(toPhaseClock(row), new Date(), {
    completed: row.status === "completed",
  })

  const errors = validateEntryRequest(parsed.value, rules, window)
  if (errors.length > 0) {
    return NextResponse.json({ errors }, { status: 400 })
  }

  // Money already recorded by an admin means the one chance has been used —
  // an approval without a request counts (an admin typing in a Venmo). The
  // own-row read is what RLS allows a member; a failed read is a 500, not a
  // "you have no entry" (#132).
  const { data: participant, error: participantError } = await supabase
    .from("tournament_participants")
    .select(PARTICIPANT_ENTRY_COLUMNS)
    .eq("user_id", user.id)
    .eq("tournament_id", String(row.id))
    .is("revoked_at", null)
    .maybeSingle()
  if (participantError) {
    return NextResponse.json(
      { error: `Couldn't check your entry: ${participantError.message}` },
      { status: 500 }
    )
  }
  if (entryStatus(participant, null) === "entered") {
    return NextResponse.json(
      { error: "Your entry is already recorded — talk to an admin to change it." },
      { status: 409 }
    )
  }

  const { data, error } = await supabase
    .from("entry_requests")
    .insert({
      tournament_id: String(row.id),
      user_id: user.id,
      phase1_amount: parsed.value.phase1,
      phase2_amount: parsed.value.phase2,
      is_player: parsed.value.isPlayer,
    })
    .select(REQUEST_RETURN)
    .single()
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return NextResponse.json(
        {
          error:
            "You've already requested your entry — it can't be changed in the app. Ask an admin if something's wrong.",
        },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: `Couldn't save your request: ${error.message}` },
      { status: 500 }
    )
  }
  return NextResponse.json({ request: data }, { status: 201 })
}
