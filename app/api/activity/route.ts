import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { ACTIVITY_LIMIT, loadActivityFeed } from "@/lib/activity-source"
import { TOURNAMENT_CLOCK_COLUMNS, toPhaseClock } from "@/lib/placements"
import type { FeedBet } from "@/lib/activity"

// The activity feed's poll target (~20s from components/modules/activity-feed).
//
// It takes NO tournament parameter on purpose. The feed is always the current
// tournament, and resolving that here rather than trusting a query string means
// there is no id to validate and no way to ask about someone else's pool.
//
// Everything the feed is allowed to say is decided in
// supabase/migrations/20260831000000_activity_feed.sql — this route can only
// return what activity_placements() hands it, which is a name and a moment.

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 })
  }

  const { data: tournamentData, error: tournamentError } = await supabase
    .from("tournaments")
    .select(`id, ${TOURNAMENT_CLOCK_COLUMNS}`)
    .in("status", ["upcoming", "active"])
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (tournamentError) {
    return NextResponse.json(
      { error: "Couldn't load the tournament." },
      { status: 500 }
    )
  }
  // No tournament is a real state, not a failure: the dashboard renders its own
  // "no active tournament" empty state, and an empty feed agrees with it.
  if (!tournamentData) return NextResponse.json({ events: [] })

  const tournament = tournamentData as unknown as Record<string, unknown>
  const tournamentId = String(tournament.id)

  // `phase, status` only — loadActivityFeed reads opened_at itself, where a
  // missing column degrades to a quieter feed rather than a 500.
  const { data: betsData, error: betsError } = await supabase
    .from("bets")
    .select("phase, status")
    .eq("tournament_id", tournamentId)

  if (betsError) {
    return NextResponse.json({ error: "Couldn't load the bets." }, { status: 500 })
  }

  const events = await loadActivityFeed(
    supabase,
    tournamentId,
    toPhaseClock(tournament),
    (betsData ?? []) as FeedBet[],
    new Date(),
    ACTIVITY_LIMIT
  )

  return NextResponse.json({ events })
}
