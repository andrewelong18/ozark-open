// The one read behind the activity feed, so the dashboard's first paint and the
// poll that follows it cannot disagree about what the feed says.
//
// Kept apart from lib/activity.ts, which is pure and unit-tested: this module
// takes a Supabase client, the way lib/placement-write.ts does, and does
// nothing but fetch and hand the rows to that module.

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  buildFeed,
  phaseEvents,
  placementEvents,
  type ActivityEvent,
  type FeedBet,
  type PlacementActivityRow,
} from "./activity.ts"
import type { PhaseClock } from "./phases.ts"

/** How many placements the feed reaches back for. The function clamps to 100;
 *  40 is a busy Saturday's worth without making the first paint a scroll. */
export const ACTIVITY_LIMIT = 40

/**
 * The feed for one tournament: everyone's placements as name-and-moment, the
 * phase events derived from the caller's own bet rows and clock, and the quips
 * interleaved deterministically.
 *
 * The placements come through the `activity_placements` RPC rather than a table
 * read, and that is not an optimisation — RLS makes a plain read return the
 * viewer's own wagers and nothing else until the parent bet closes. The
 * function returns five columns and never the pick or the amount; see
 * supabase/migrations/20260831000000_activity_feed.sql for why that list is
 * load-bearing.
 *
 * A failed read yields an empty feed rather than throwing: this is ambient
 * colour in a rail beside the money, and a dashboard that 500s because the
 * quips didn't load would be a worse outcome than a quiet feed. The caller
 * logs; nothing here is a number anyone acts on.
 */
export async function loadActivityFeed(
  supabase: SupabaseClient,
  tournamentId: string,
  clock: PhaseClock,
  bets: FeedBet[],
  now: Date,
  limit: number = ACTIVITY_LIMIT
): Promise<ActivityEvent[]> {
  const { data, error } = await supabase.rpc("activity_placements", {
    p_tournament_id: tournamentId,
    p_limit: limit,
  })

  if (error) {
    console.error("[activity] placement read failed:", error.message)
    return buildFeed(phaseEvents(bets, clock, now))
  }

  const rows = (data ?? []) as PlacementActivityRow[]
  return buildFeed([
    ...placementEvents(rows),
    ...phaseEvents(bets, clock, now),
  ])
}
