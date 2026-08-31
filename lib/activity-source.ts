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
  type FeedMember,
  type PlacementActivityRow,
} from "./activity.ts"
import { ACTIVITY_QUIPS } from "./activity-quips.ts"
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
 * EVERY read here is allowed to fail, and each failure costs only its own part
 * of the rail — the wagers, the profile links, or the phase-open line. This is
 * ambient colour beside the money, and a dashboard that breaks because the feed
 * could not load is the worse outcome by a distance. Nothing here is a number
 * anyone acts on.
 */
export async function loadActivityFeed(
  supabase: SupabaseClient,
  tournamentId: string,
  clock: PhaseClock,
  bets: FeedBet[],
  now: Date,
  limit: number = ACTIVITY_LIMIT
): Promise<ActivityEvent[]> {
  // Three reads, in parallel, and EVERY ONE of them is allowed to fail. The
  // caller is a page full of money; this is a rail of ambient colour beside it,
  // so nothing here may take that page down. That is not a hypothetical: the
  // dashboard briefly read `opened_at` itself for the phase events, shipped
  // ahead of the migration adding the column, and every member got an error
  // card where their dashboard should have been (Aug 31, 2026).
  //
  //   - the wagers, through the definer RPC
  //   - the roster, to give the house lines their profile links
  //     (public.users is authenticated-read-all since 20260717000002, ~32 rows)
  //   - opened_at, which is the feed's own column and is read HERE rather than
  //     by the page, so a database that doesn't have it yet costs one line of
  //     the feed instead of the whole dashboard
  const [placements, members, stamps] = await Promise.all([
    supabase.rpc("activity_placements", {
      p_tournament_id: tournamentId,
      p_limit: limit,
    }),
    supabase.from("users").select("id, display_name, avatar_url"),
    supabase
      .from("bets")
      .select("phase, status, opened_at")
      .eq("tournament_id", tournamentId),
  ])

  // A failed member read costs the links, not the feed: the lines still render
  // with plain-text names, which is the same fallback a member without an
  // account gets.
  if (members.error) {
    console.error("[activity] member read failed:", members.error.message)
  }
  const roster = (members.data ?? []) as FeedMember[]

  // A failed stamp read costs the "Phase N is open" line and nothing else: the
  // caller's rows still carry phase and status, so the phase CLOSE events (which
  // come from the clock, not the column) and every wager row survive it.
  if (stamps.error) {
    console.error("[activity] opened_at read failed:", stamps.error.message)
  }
  const stamped = stamps.error ? bets : ((stamps.data ?? []) as FeedBet[])
  const phases = phaseEvents(stamped, clock, now)

  if (placements.error) {
    console.error("[activity] placement read failed:", placements.error.message)
    return buildFeed(phases, ACTIVITY_QUIPS, roster)
  }

  const rows = (placements.data ?? []) as PlacementActivityRow[]
  return buildFeed(
    [...placementEvents(rows), ...phases],
    ACTIVITY_QUIPS,
    roster
  )
}
