import { createClient } from "@/lib/supabase/server"
import { EmptyState } from "@/components/modules/empty-state"
import { LoadError } from "@/components/modules/load-error"
import { StandingsBoard } from "@/components/results/standings-board"
import { TOURNAMENT_CLOCK_COLUMNS, TOURNAMENT_RULE_COLUMNS } from "@/lib/placements"

// /standings — "Leaderboard" in the nav (Sprint 30 / ADR 0002). The route is
// /standings because /leaderboard is the Google-Sheets golf leaderboard,
// kept unlinked but deployed at Andrew's call (OUTSTANDING_DECISIONS §2b.4);
// reusing it would silently reverse that. The board itself is shared with
// the completed dashboard — one component, two mounts.

export default async function StandingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: tournamentData, error: tournamentError } = await supabase
    .from("tournaments")
    .select(`id, name, year, status, ${TOURNAMENT_RULE_COLUMNS}, ${TOURNAMENT_CLOCK_COLUMNS}`)
    .in("status", ["upcoming", "active", "completed"])
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (tournamentError) {
    console.error("[standings] tournament read failed:", tournamentError.message)
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <LoadError subject="the tournament" />
      </div>
    )
  }
  if (!tournamentData) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <EmptyState
          title="No active tournament"
          message="There's no tournament to rank right now. Check back before the next Ozark Open."
        />
      </div>
    )
  }

  return (
    <StandingsBoard
      tournamentRow={tournamentData as unknown as Record<string, unknown>}
      viewerUserId={user?.id ?? null}
    />
  )
}
