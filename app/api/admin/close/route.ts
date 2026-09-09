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
//   POST  — { action: "finalize" } flips tournaments.status to 'completed',
//           the Saturday-night post that swaps every member's dashboard to the
//           final standings. Refuses while any pick is pending or any bet is
//           unclosed, because the payout rollup SKIPS pending placements
//           rather than zeroing them: posting early splits the whole pool
//           across only the settled wagers and every number still looks
//           plausible.
//
//           { action: "unfinalize" } is the way back — 'completed' to 'active',
//           refused from any other status. It exists because Sprint 28 let the
//           import OFFER the post: a tap that can be taken back is a tap
//           somebody can afford to make.
//
// THIS ROUTE IS THE ONLY WRITER OF tournaments.status IN THE APP. The import
// doesn't touch it, the console doesn't touch it. One writer, one guard, one
// place to look when the status is wrong.
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

// The newest tournament in any of `statuses`.
//
// Parameterised because unfinalize has to find a tournament the other two
// callers must NOT: ["upcoming", "active"] cannot see a posted leaderboard, so
// taking one down needs ["completed"]. Same shape as /admin/close's own page
// read, which has always included 'completed' — that is how the console knows
// to render "already posted".
//
// Returns a ready-to-return error response when the LOOKUP fails, separately
// from a null row meaning "there is no such tournament" (#132). Same union
// shape as requireAdminRoute, so callers read the same way.
async function latestTournament(
  supabase: Awaited<ReturnType<typeof createClient>>,
  statuses: string[]
): Promise<{
  tournament: { id: string; status: string } | null
  error?: NextResponse
}> {
  const { data, error } = await supabase
    .from("tournaments")
    .select("id, status")
    .in("status", statuses)
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

  const { tournament, error: tournamentError } = await latestTournament(
    supabase,
    ["upcoming", "active"]
  )
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
// POST — posting the leaderboard, and taking it back down
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const body = (await readJson(request)) as Record<string, unknown> | null
  if (!body || (body.action !== "finalize" && body.action !== "unfinalize")) {
    return NextResponse.json(
      { error: 'Expected { "action": "finalize" } or { "action": "unfinalize" }.' },
      { status: 400 }
    )
  }

  if (body.action === "unfinalize") return unfinalize(supabase)

  const { tournament, error: tournamentError } = await latestTournament(
    supabase,
    ["upcoming", "active"]
  )
  if (tournamentError) return tournamentError
  if (!tournament) {
    return NextResponse.json(
      { error: "No active tournament to post." },
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
  // check a post that never landed would answer { finalized: true } — and every
  // member's dashboard would stay a betting console while the admin believed
  // the leaderboard was up. That is a Saturday-night failure with nothing on
  // screen to explain it.
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
          "Posting didn't take — the database refused the update, so the tournament is still open " +
          "and everyone's dashboard still shows the betting console. Check that you're still signed in as an admin.",
      },
      { status: 500 }
    )
  }
  return NextResponse.json({ finalized: true })
}

// ---------------------------------------------------------------------------
// Unpost — the way back
// ---------------------------------------------------------------------------

/**
 * 'completed' → 'active'. Refused from any other status, because there is
 * nothing to take down.
 *
 * No readiness guard, and that asymmetry is deliberate: finalizeReadiness()
 * protects against publishing numbers that are quietly wrong, and this is the
 * button that STOPS publishing them. A guard here would be a guard on the fire
 * exit. Nothing is deleted either — the status is the only thing that moves, so
 * re-posting puts the same standings back.
 */
async function unfinalize(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { tournament, error: tournamentError } = await latestTournament(
    supabase,
    ["completed"]
  )
  if (tournamentError) return tournamentError
  if (!tournament) {
    return NextResponse.json(
      { error: "No posted leaderboard to take down." },
      { status: 400 }
    )
  }

  // `.eq("status", "completed")` as well as the id: if something else moved the
  // status between the read above and this write, we want zero rows and the
  // failure below, not a blind overwrite of whatever it became.
  //
  // Same #154 check as the post. A write that matches nothing comes back with
  // error === null, so without it an unpost that never landed would answer
  // { finalized: false } while ~32 dashboards carried on showing the payouts.
  const { data, error } = await supabase
    .from("tournaments")
    .update({ status: "active" })
    .eq("id", tournament.id)
    .eq("status", "completed")
    .select("id")
    .maybeSingle()
  if (error) {
    return NextResponse.json(
      { error: `Taking the leaderboard down failed: ${error.message}` },
      { status: 500 }
    )
  }
  if (!data) {
    return NextResponse.json(
      {
        error:
          "The leaderboard is still up — the database refused the update, so everyone can still see the payouts. " +
          "Check that you're still signed in as an admin, and reload to see the current state.",
      },
      { status: 500 }
    )
  }
  return NextResponse.json({ finalized: false })
}
