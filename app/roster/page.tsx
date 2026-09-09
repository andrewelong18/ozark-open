import { createClient } from "@/lib/supabase/server"
import { EmptyState } from "@/components/modules/empty-state"
import { LoadError } from "@/components/modules/load-error"
import { RosterGrid } from "@/components/player/roster-grid"
import {
  buildFieldRoster,
  type RosterParticipantRow,
  type RosterUserRow,
} from "@/lib/roster-page"

// Roster (Sprint 26): the field, as faces. Who's playing, and a way into any
// of their profiles — the same modal every other page opens.
//
// The page is glue; who counts as "in the field" lives in lib/roster-page.ts.
// Both reads are open to any authenticated member by existing RLS
// (users_read_all, and "Authenticated users can read participants"), so this
// runs on the anon key with the viewer's session like everything else.

export default async function RosterPage() {
  const supabase = await createClient()

  const { data: tournamentData, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, name")
    .in("status", ["upcoming", "active"])
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (tournamentError) {
    console.error("[roster] tournament read failed:", tournamentError.message)
    return (
      <Shell>
        <LoadError subject="the tournament" />
      </Shell>
    )
  }

  if (!tournamentData) {
    return (
      <Shell>
        <EmptyState
          title="No active tournament"
          message="There's no tournament open right now. Check back before the next Ozark Open."
        />
      </Shell>
    )
  }
  const tournament = tournamentData as { id: string; name: string }

  const [participantResult, userResult] = await Promise.all([
    supabase
      .from("tournament_participants")
      .select("user_id, entry_fee, is_player, revoked_at")
      .eq("tournament_id", tournament.id),
    supabase.from("users").select("id, display_name, nickname, avatar_url"),
  ])

  // A half-loaded roster is worse than no roster — it reads as "these are the
  // only people playing", which is a wrong answer rather than a missing one.
  if (participantResult.error || userResult.error) {
    console.error(
      "[roster] read failed:",
      participantResult.error?.message ?? userResult.error?.message
    )
    return (
      <Shell name={tournament.name}>
        <LoadError subject="the roster" />
      </Shell>
    )
  }

  const players = buildFieldRoster({
    users: (userResult.data ?? []) as RosterUserRow[],
    participants: (participantResult.data ?? []) as RosterParticipantRow[],
  })

  return (
    <Shell
      name={tournament.name}
      count={players.length > 0 ? players.length : undefined}
    >
      {players.length === 0 ? (
        <EmptyState
          glyph="🏌️"
          title="No players yet"
          message="Nobody's been approved for this year's field yet. Check back once entries are in."
        />
      ) : (
        <RosterGrid players={players} />
      )}
    </Shell>
  )
}

function Shell({
  name,
  count,
  children,
}: {
  name?: string
  count?: number
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto flex max-w-[var(--container-max,1120px)] flex-col gap-4 px-4 py-6">
      <div>
        <h1 className="font-heading text-3xl leading-tight text-text-strong">
          Roster
        </h1>
        <p className="mt-0.5 text-sm text-text-muted">
          {name}
          {count != null && (
            <>
              {name && " · "}
              <span className="tabular">{count}</span>{" "}
              {count === 1 ? "player" : "players"}
            </>
          )}
        </p>
      </div>
      {children}
    </div>
  )
}
