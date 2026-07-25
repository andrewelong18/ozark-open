import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Avatar } from "@/components/avatar"
import { UserName } from "@/components/user-name"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/modules/empty-state"
import { StatCard } from "@/components/modules/stat-card"
import { formatRelativeTime, formatTimestamp } from "@/lib/format"
import {
  buildRoster,
  type AuthActivityQueryRow,
  type InviteQueryRow,
  type ParticipantQueryRow,
  type RosterPerson,
  type UserQueryRow,
} from "@/lib/roster"

// Admin roster (Sprint 10). Read-only — who's in, who's stuck, who's missing,
// replacing the chase SQL an admin used to run by hand in Studio. Non-admins
// get a 404, same pattern as /admin/import and /admin/participants.
//
// Nothing here writes: the expected roster is typed into tournament_invites in
// Studio, and approvals happen on /admin/participants.

// Mobile shows the person block + status; sm+ gives last login its own column,
// with the mobile copy repeated inside the person block. Long email addresses
// make a horizontally scrolling table hostile on the phone the admin is
// actually holding while texting people.
const GRID = "grid grid-cols-[1fr_auto] gap-x-3 px-4 sm:grid-cols-[1fr_120px_132px]"

/** The one status badge per person. Admin is a separate badge, not a status. */
function StatusPill({ person }: { person: RosterPerson }) {
  if (person.status === "ready") {
    return <Badge variant="green">Ready to bet</Badge>
  }
  if (person.status === "not_registered") {
    return <Badge variant="red">No account</Badge>
  }
  const label =
    person.reason === "not_onboarded"
      ? "Not onboarded"
      : person.reason === "fee_unset"
        ? "Fee unset"
        : "Needs approval"
  return <Badge variant="amber">{label}</Badge>
}

function LastLogin({ person }: { person: RosterPerson }) {
  return (
    <time
      dateTime={person.last_sign_in_at ?? undefined}
      title={formatTimestamp(person.last_sign_in_at)}
    >
      {formatRelativeTime(person.last_sign_in_at)}
    </time>
  )
}

/** One chase list — the count, what to do about it, and the names to copy. */
function ChaseBlock({
  tone,
  count,
  heading,
  hint,
  people,
}: {
  tone: "red" | "amber"
  count: number
  heading: string
  hint: string
  people: RosterPerson[]
}) {
  return (
    <div className="border-t border-border px-4 py-3 first:border-t-0">
      <div className="flex items-center gap-2">
        <Badge variant={tone}>{count}</Badge>
        <span className="text-sm font-semibold text-text-strong">{heading}</span>
      </div>
      <p className="mt-0.5 text-xs text-text-muted">{hint}</p>
      {/* Plain text, not chips — this is the list an admin copies into a group
          text or reads off while making calls. */}
      <p className="mt-1.5 text-sm leading-normal text-text-body">
        {people.map((p) => p.name).join(", ")}
      </p>
    </div>
  )
}

export default async function AdminRosterPage() {
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
    .select("id, name")
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle()
  const tournament = tournamentData as { id: string; name: string } | null

  if (!tournament) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
        <h1 className="font-heading text-3xl leading-tight text-text-strong">
          Roster
        </h1>
        <EmptyState
          title="No tournament yet"
          message="Create a tournament before there's a roster to read."
        />
      </div>
    )
  }

  // Note the users query has no onboarded_at filter, unlike /admin/participants:
  // members who signed in but never finished onboarding are exactly what this
  // page exists to surface.
  const [invitesRes, usersRes, participantsRes, activityRes] = await Promise.all([
    supabase
      .from("tournament_invites")
      .select("email, invited_name")
      .eq("tournament_id", tournament.id),
    supabase
      .from("users")
      .select("id, email, display_name, nickname, avatar_url, is_admin, onboarded_at"),
    supabase
      .from("tournament_participants")
      .select("user_id, entry_fee")
      .eq("tournament_id", tournament.id),
    // Degrades to "Never" everywhere if it fails — losing last-login must not
    // take down the chase page.
    supabase.rpc("admin_auth_activity"),
  ])

  const roster = buildRoster({
    invites: (invitesRes.data ?? []) as InviteQueryRow[],
    users: (usersRes.data ?? []) as UserQueryRow[],
    participants: (participantsRes.data ?? []) as ParticipantQueryRow[],
    authActivity: (activityRes.data ?? []) as AuthActivityQueryRow[],
  })

  const { counts, notRegistered, notReady } = roster
  const allClear = notRegistered.length === 0 && notReady.length === 0

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <div>
        <h1 className="font-heading text-3xl leading-tight text-text-strong">
          Roster
        </h1>
        <p className="mt-0.5 text-sm text-text-muted">
          {tournament.name} · who&apos;s in, who&apos;s stuck, who&apos;s missing
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <StatCard label="Ready" value={counts.ready} feature />
        <StatCard label="Not ready" value={counts.notReady} />
        <StatCard label="No account" value={counts.notRegistered} />
      </div>

      <Card className="gap-0 p-0">
        {allClear ? (
          <div className="flex items-center gap-2 px-4 py-3">
            <Badge variant="green">All clear</Badge>
            <span className="text-sm text-text-body">
              Everyone on the roster is set up to bet.
            </span>
          </div>
        ) : (
          <>
            {notRegistered.length > 0 && (
              <ChaseBlock
                tone="red"
                count={notRegistered.length}
                heading="Hasn't registered yet"
                hint="Send them the login link — no account exists for this email yet."
                people={notRegistered}
              />
            )}
            {notReady.length > 0 && (
              <ChaseBlock
                tone="amber"
                count={notReady.length}
                heading="Registered but not set up to bet"
                hint="Approve them on /admin/participants, or fix an email mismatch in Studio."
                people={notReady}
              />
            )}
          </>
        )}
      </Card>

      {roster.people.length === 0 ? (
        <EmptyState
          title="Nobody yet"
          message="Add the people you expect to tournament_invites in Studio — anyone who logs in shows up here automatically."
        />
      ) : (
        <Card className="gap-0 p-0">
          <div
            className={`${GRID} border-b border-border py-2.5 text-[10px] font-bold tracking-wider uppercase text-text-muted`}
          >
            <span>Member</span>
            <span className="hidden sm:block">Last login</span>
            <span className="justify-self-end sm:justify-self-start">Status</span>
          </div>
          {roster.people.map((person) => (
            <div
              key={person.key}
              className={`${GRID} items-center border-t border-border py-3 first:border-t-0`}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                {person.user_id ? (
                  <Avatar
                    src={person.avatar_url}
                    name={person.name}
                    size="sm"
                  />
                ) : (
                  // No person behind this row yet — initials from an email
                  // address would read as noise.
                  <span
                    aria-hidden
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong text-xs text-text-muted"
                  >
                    ✉
                  </span>
                )}
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <UserName
                      displayName={person.name}
                      nickname={person.nickname}
                      className="truncate text-[15px] font-semibold text-text-strong"
                    />
                    {person.is_admin && <Badge variant="gold">Admin</Badge>}
                  </div>
                  <div className="truncate text-xs text-text-muted">
                    {person.email}
                    {roster.hasInvites && !person.invited && (
                      <span className="ml-1.5">· not on the invite list</span>
                    )}
                  </div>
                  <div className="text-xs text-text-muted sm:hidden">
                    <LastLogin person={person} />
                  </div>
                </div>
              </div>
              <span className="hidden text-xs text-text-muted sm:block">
                <LastLogin person={person} />
              </span>
              <span className="justify-self-end sm:justify-self-start">
                <StatusPill person={person} />
              </span>
            </div>
          ))}
        </Card>
      )}

      <p className="text-center text-xs text-text-muted">
        Read-only. The expected roster lives in <code>tournament_invites</code>{" "}
        (Studio); approvals happen on /admin/participants.
      </p>
    </div>
  )
}
