import { NextResponse } from "next/server"
import { requireAdminRoute as requireAdmin } from "@/lib/admin-gate"
import { createClient } from "@/lib/supabase/server"
import { finalizeReadiness } from "@/lib/payouts"

// Admin close controls (Sprint 25 / #106, #108) — the two time-critical
// moments of the weekend, which until now both required database access.
//
//   PATCH — set or clear a phase deadline, close a phase now, toggle the
//           countdown. Writes only the tournaments row; NOTHING here touches
//           bets.status, which the spreadsheet upload still owns outright
//           (ADR 0001 §5a).
//   POST  — flip tournaments.status to 'completed', the Saturday-night unlock
//           that reveals /results. Refuses while any pick is pending or any
//           bet is unclosed, because the payout rollup SKIPS pending
//           placements rather than zeroing them: finalizing early splits the
//           whole pool across only the settled wagers and every number still
//           looks plausible.
//
// Writes are admin-only at the DB too ("Admins can write tournaments", RLS);
// the gate here is for clean 401/403s rather than security.

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

// Returns a ready-to-return error response when the LOOKUP fails, separately
// from a null row meaning "there is no active tournament" (#132). Same union
// shape as requireAdminRoute, so callers read the same way.
async function activeTournament(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{
  tournament: { id: string; status: string } | null
  error?: NextResponse
}> {
  const { data, error } = await supabase
    .from("tournaments")
    .select("id, status")
    .in("status", ["upcoming", "active"])
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
  return { tournament: data as { id: string; status: string } | null }
}

// ---------------------------------------------------------------------------
// PATCH — the phase clock
// ---------------------------------------------------------------------------

export async function PATCH(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const body = (await readJson(request)) as Record<string, unknown> | null
  if (!body) {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 })
  }

  const { tournament, error: tournamentError } = await activeTournament(supabase)
  if (tournamentError) return tournamentError
  if (!tournament) {
    return NextResponse.json({ error: "No active tournament." }, { status: 400 })
  }

  const updates: Record<string, string | boolean | null> = {}

  for (const phase of [1, 2] as const) {
    const key = `phase${phase}_closes_at`
    if (!(key in body)) continue
    const value = body[key]
    if (value === null || value === "") {
      // Clearing a deadline reopens the phase — betting falls back to the
      // bets' own statuses, which is the pre-Sprint-25 behaviour.
      updates[key] = null
      continue
    }
    if (typeof value !== "string") {
      return NextResponse.json(
        { error: `${key} must be an ISO timestamp or null.` },
        { status: 400 }
      )
    }
    const at = new Date(value)
    if (Number.isNaN(at.getTime())) {
      return NextResponse.json(
        { error: `${key} isn't a valid date/time.` },
        { status: 400 }
      )
    }
    updates[key] = at.toISOString()
  }

  if ("show_countdown" in body) {
    if (typeof body.show_countdown !== "boolean") {
      return NextResponse.json(
        { error: "show_countdown must be true or false." },
        { status: 400 }
      )
    }
    updates.show_countdown = body.show_countdown
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 })
  }

  // Zero rows is a failure, not a success (#154) — see the note on the
  // finalize write below.
  const { data, error } = await supabase
    .from("tournaments")
    .update(updates)
    .eq("id", tournament.id)
    .select("id")
    .maybeSingle()
  if (error) {
    return NextResponse.json(
      { error: `Updating the clock failed: ${error.message}` },
      { status: 500 }
    )
  }
  if (!data) {
    return NextResponse.json(
      {
        error:
          "The clock didn't change — the database refused the update, so the old deadline still stands. " +
          "Check that you're still signed in as an admin.",
      },
      { status: 500 }
    )
  }
  return NextResponse.json({ updated: updates })
}

// ---------------------------------------------------------------------------
// POST — the guarded final unlock
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const body = (await readJson(request)) as Record<string, unknown> | null
  if (!body || body.action !== "finalize") {
    return NextResponse.json(
      { error: 'Expected { "action": "finalize" }.' },
      { status: 400 }
    )
  }

  const { tournament, error: tournamentError } = await activeTournament(supabase)
  if (tournamentError) return tournamentError
  if (!tournament) {
    return NextResponse.json(
      { error: "No active tournament to finalize." },
      { status: 400 }
    )
  }

  // Count what would make the split wrong. Both are cheap head-only counts.
  const { count: pendingPicks, error: picksError } = await supabase
    .from("bet_picks")
    .select("id, bets!inner(tournament_id)", { count: "exact", head: true })
    .eq("result", "pending")
    .eq("bets.tournament_id", tournament.id)
  if (picksError) {
    return NextResponse.json(
      { error: `Couldn't count unresolved picks: ${picksError.message}` },
      { status: 500 }
    )
  }

  const { count: unclosedBets, error: betsError } = await supabase
    .from("bets")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", tournament.id)
    .neq("status", "closed")
  if (betsError) {
    return NextResponse.json(
      { error: `Couldn't count open bets: ${betsError.message}` },
      { status: 500 }
    )
  }

  const readiness = finalizeReadiness({
    pendingPicks: pendingPicks ?? 0,
    unclosedBets: unclosedBets ?? 0,
  })
  if (!readiness.ok) {
    // 409, not 400: the request is well-formed, the tournament isn't ready.
    return NextResponse.json({ errors: readiness.blockers }, { status: 409 })
  }

  // The sharpest instance of the #154 shape in the app. A PostgREST write that
  // matches zero rows returns success with error === null, so without this
  // check a finalize that never landed would answer { finalized: true } — and
  // /results would stay gated behind status !== 'completed' while the admin
  // believed the tournament was closed out. That is a Saturday-night failure
  // with nothing on screen to explain it.
  const { data, error } = await supabase
    .from("tournaments")
    .update({ status: "completed" })
    .eq("id", tournament.id)
    .select("id")
    .maybeSingle()
  if (error) {
    return NextResponse.json(
      { error: `Finalizing failed: ${error.message}` },
      { status: 500 }
    )
  }
  if (!data) {
    return NextResponse.json(
      {
        error:
          "Finalizing didn't take — the database refused the update, so the tournament is still open " +
          "and the results page stays hidden. Check that you're still signed in as an admin.",
      },
      { status: 500 }
    )
  }
  return NextResponse.json({ finalized: true })
}
