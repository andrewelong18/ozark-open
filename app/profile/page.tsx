import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { ProfileTabs } from "@/components/profile/profile-tabs"
import { toTournamentRules, TOURNAMENT_RULE_COLUMNS } from "@/lib/placements"

// Self-serve profile (Sprint 15; reorganized into tabbed sub-nav): the one
// place a member sets their own nickname + photo and reads their own status.
// For admins it's also the home of the admin entry point. This page is just
// the data-fetching shell — the tabbed UI lives in <ProfileTabs>.

export default async function ProfilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profileData } = await supabase
    .from("users")
    .select("display_name, nickname, avatar_url, is_admin, email")
    .eq("id", user.id)
    .single()
  const profile = (profileData ?? null) as {
    display_name: string
    nickname: string | null
    avatar_url: string | null
    is_admin: boolean
    email: string
  } | null

  const displayName = profile?.display_name ?? user.email ?? "You"
  const isAdmin = profile?.is_admin ?? false

  const { data: tournamentData } = await supabase
    .from("tournaments")
    .select(`id, name, status, ${TOURNAMENT_RULE_COLUMNS}`)
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle()
  const tournament = tournamentData as
    | ({ id: string; name: string; status: string } & Record<string, unknown>)
    | null
  const rules = tournament ? toTournamentRules(tournament) : null

  const { data: participantData } = tournament
    ? await supabase
        .from("tournament_participants")
        .select("entry_fee, is_player")
        .eq("user_id", user.id)
        .eq("tournament_id", tournament.id)
        .maybeSingle()
    : { data: null }
  const participant = participantData as {
    entry_fee: number
    is_player: boolean
  } | null

  const bettingOpen = tournament?.status === "active"
  const readyToBet = participant !== null && bettingOpen

  return (
    <div className="mx-auto grid max-w-[var(--container-max,1120px)] grid-cols-1 gap-4 px-4 py-6 lg:grid-cols-3 lg:gap-6">
      <div className="lg:col-span-2">
        <ProfileTabs
          userId={user.id}
          displayName={displayName}
          email={profile?.email ?? user.email ?? ""}
          nickname={profile?.nickname ?? null}
          avatarUrl={profile?.avatar_url ?? null}
          isAdmin={isAdmin}
          status={{
            isAdmin,
            hasTournament: tournament !== null,
            participant,
            readyToBet,
          }}
          minPicks={rules?.min_picks_per_phase ?? 1}
          maxPicks={rules?.max_picks_per_phase ?? 1}
        />
      </div>

      {/* Reserved right rail — empty for now (matches dashboard's 2/3 split). */}
      <aside className="hidden lg:col-span-1 lg:block" aria-hidden />
    </div>
  )
}
