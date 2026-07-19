import Link from "next/link"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { Avatar } from "@/components/avatar"
import { UserName } from "@/components/user-name"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ProfileForm } from "@/components/profile/profile-form"

// Self-serve profile (Sprint 15): the one place a member sets their own
// nickname + photo and reads their own status. For admins it's also the home
// of the admin entry point (the top-nav Admin pill was retired here).

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
    .select("id, name, status")
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle()
  const tournament = tournamentData as {
    id: string
    name: string
    status: string
  } | null

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
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-6">
      {/* Hero — the face + name people see everywhere else in the app. */}
      <div className="flex items-center gap-4">
        <Avatar src={profile?.avatar_url} name={displayName} size="lg" />
        <div className="min-w-0">
          <h1 className="font-heading text-3xl leading-tight text-text-strong">
            <UserName displayName={displayName} nickname={profile?.nickname} />
          </h1>
          <p className="mt-0.5 truncate text-sm text-text-muted">
            {profile?.email ?? user.email}
          </p>
          <div className="mt-1.5">
            <Badge variant={isAdmin ? "gold" : "indigo"} uppercase>
              {isAdmin ? "Admin" : "Participant"}
            </Badge>
          </div>
        </div>
      </div>

      <ProfileForm
        userId={user.id}
        displayName={displayName}
        initialNickname={profile?.nickname ?? null}
        initialAvatarUrl={profile?.avatar_url ?? null}
      />

      {/* Status — where the member stands for the current tournament. */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="font-heading text-lg text-text-strong">
            Your status
          </div>
          <StatusRow label="Role" value={isAdmin ? "Admin" : "Participant"} />
          <StatusRow
            label="Registration"
            value={
              !tournament
                ? "No tournament yet"
                : participant
                  ? `Registered${participant.is_player ? "" : " (non-player)"}`
                  : "Not registered"
            }
            tone={participant ? "good" : "muted"}
          />
          <StatusRow
            label="Entry fee"
            value={participant ? `$${participant.entry_fee}` : "—"}
          />
          <StatusRow
            label="Ready to bet"
            value={
              !participant
                ? "Ask an admin to add you to the pool"
                : readyToBet
                  ? "Yes — the book is open"
                  : "Registered — betting opens when the book does"
            }
            tone={readyToBet ? "good" : "muted"}
          />
        </CardContent>
      </Card>

      {/* Admin entry point — this page is where the admin tools live now. */}
      {isAdmin && (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="font-heading text-lg text-text-strong">Admin</div>
            <p className="text-sm text-text-muted">
              You&apos;re an admin. Manage the pool from here.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" render={<Link href="/admin/view" />}>
                View All
              </Button>
              <Button variant="secondary" size="sm" render={<Link href="/admin/import" />}>
                Import Bets
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* How the pool works — plain-language primer. */}
      <Card>
        <CardContent className="flex flex-col gap-2">
          <div className="font-heading text-lg text-text-strong">
            How this pool works
          </div>
          <p className="text-sm text-text-muted">
            The Ozark Open is a pari-mutuel pool — no house, no rake. Everyone&apos;s
            entry fees make the pot, and it pays itself back out in proportion to
            each bettor&apos;s theoretical winnings. Place your bets on the{" "}
            <Link href="/bets" className="font-medium text-primary underline-offset-4 hover:underline">
              Bet Menu
            </Link>{" "}
            and track where you stand on your{" "}
            <Link href="/dashboard" className="font-medium text-primary underline-offset-4 hover:underline">
              Dashboard
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      {/* Log out — moved here from the header. */}
      <form method="POST" action="/auth/signout">
        <Button variant="secondary" type="submit" className="w-full">
          Log out
        </Button>
      </form>
    </div>
  )
}

function StatusRow({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: string
  tone?: "default" | "good" | "muted"
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <span className="text-sm text-text-muted">{label}</span>
      <span
        className={
          "text-right text-sm font-semibold " +
          (tone === "good"
            ? "text-win-strong"
            : tone === "muted"
              ? "text-text-muted"
              : "text-text-strong")
        }
      >
        {value}
      </span>
    </div>
  )
}
