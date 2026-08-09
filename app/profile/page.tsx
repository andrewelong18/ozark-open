import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { ProfileTabs } from "@/components/profile/profile-tabs"
import { LoadError } from "@/components/modules/load-error"
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

  const { data: profileData, error: profileError } = await supabase
    .from("users")
    .select("display_name, nickname, avatar_url, is_admin, email")
    .eq("id", user.id)
    .single()
  // This read IS the page's identity, and it carries is_admin — a dropped
  // error renders you as "You" with the admin entry point missing, which
  // reads as "my access was revoked" rather than "something broke" (#132).
  if (profileError) {
    console.error("[profile] profile read failed:", profileError.message)
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <LoadError subject="your profile" />
      </div>
    )
  }
  const profile = (profileData ?? null) as {
    display_name: string
    nickname: string | null
    avatar_url: string | null
    is_admin: boolean
    email: string
  } | null

  const displayName = profile?.display_name ?? user.email ?? "You"
  const isAdmin = profile?.is_admin ?? false

  // The two reads below only feed the status strip. They log and degrade to
  // null rather than replacing the page: blocking /profile on a tournament
  // read would also block the avatar and nickname controls, which are the
  // reason a member came here. A decided fail direction, not an inherited one
  // (#132) — same judgement call middleware.ts:62 documents.
  const { data: tournamentData, error: tournamentError } = await supabase
    .from("tournaments")
    .select(`id, name, status, ${TOURNAMENT_RULE_COLUMNS}`)
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (tournamentError) {
    console.error("[profile] tournament read failed:", tournamentError.message)
  }
  const tournament = tournamentData as
    | ({ id: string; name: string; status: string } & Record<string, unknown>)
    | null
  const rules = tournament ? toTournamentRules(tournament) : null

  const { data: participantData, error: participantError } = tournament
    ? await supabase
        .from("tournament_participants")
        .select("entry_fee, is_player")
        .eq("user_id", user.id)
        .eq("tournament_id", tournament.id)
        .is("revoked_at", null)
        .maybeSingle()
    : { data: null, error: null }
  if (participantError) {
    console.error("[profile] participant read failed:", participantError.message)
  }
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
          minPicks={rules?.min_picks_per_tournament ?? 1}
          maxPicks={rules?.max_picks_per_phase ?? 1}
        />
      </div>

      {/* Reserved right rail — empty for now (matches dashboard's 2/3 split). */}
      <aside className="hidden lg:col-span-1 lg:block" aria-hidden />
    </div>
  )
}
