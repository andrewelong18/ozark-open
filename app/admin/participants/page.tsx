import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ParticipantsManager } from "@/components/admin/participants-manager"

// Admin bettor-approval (Sprint 16). Non-admins get a 404 — same pattern as
// /admin/import. Registered members show up here after onboarding; approving
// one CREATES their tournament_participants row (entry fee + player flag),
// which is what lets them place bets. Replaces the manual Studio row-add.
export default async function AdminParticipantsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: me } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle()
  if (!(me as { is_admin: boolean } | null)?.is_admin) notFound()

  const { data: tournamentData } = await supabase
    .from("tournaments")
    .select("id, name, entry_fee_min, entry_fee_max")
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle()
  const tournament = tournamentData as {
    id: string
    name: string
    entry_fee_min: number
    entry_fee_max: number
  } | null

  // Every onboarded member, plus who's already a participant for this
  // tournament. Pending = onboarded but no participant row yet.
  const { data: usersData } = await supabase
    .from("users")
    .select("id, display_name, nickname, avatar_url, email, onboarded_at")
    .not("onboarded_at", "is", null)
    .order("display_name", { ascending: true })
  const users = (usersData ?? []) as {
    id: string
    display_name: string
    nickname: string | null
    avatar_url: string | null
    email: string
    onboarded_at: string | null
  }[]

  const { data: participantData } = tournament
    ? await supabase
        .from("tournament_participants")
        .select("user_id, entry_fee, is_player")
        .eq("tournament_id", tournament.id)
    : { data: [] }
  const participants = (participantData ?? []) as {
    user_id: string
    entry_fee: number
    is_player: boolean
  }[]
  const byUser = new Map(participants.map((p) => [p.user_id, p]))

  const pending = users
    .filter((u) => !byUser.has(u.id))
    .map((u) => ({
      id: u.id,
      display_name: u.display_name,
      nickname: u.nickname,
      avatar_url: u.avatar_url,
      email: u.email,
    }))

  const approved = users
    .filter((u) => byUser.has(u.id))
    .map((u) => {
      const p = byUser.get(u.id)!
      return {
        id: u.id,
        display_name: u.display_name,
        nickname: u.nickname,
        avatar_url: u.avatar_url,
        email: u.email,
        entry_fee: Number(p.entry_fee),
        is_player: p.is_player,
      }
    })

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-6">
      <div>
        <h1 className="font-heading text-3xl leading-tight text-text-strong">
          Participants
        </h1>
        <p className="mt-0.5 text-sm text-text-muted">
          {tournament
            ? `Approve registered members to bet in ${tournament.name}. Approving sets their entry fee and creates their pool entry.`
            : "No tournament yet — create one before approving bettors."}
        </p>
      </div>
      {tournament ? (
        <ParticipantsManager
          entryFeeMin={tournament.entry_fee_min}
          entryFeeMax={tournament.entry_fee_max}
          pending={pending}
          approved={approved}
        />
      ) : null}
    </div>
  )
}
