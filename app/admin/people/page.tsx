import { requireAdminPage } from "@/lib/admin-gate"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/modules/empty-state"
import { LoadError } from "@/components/modules/load-error"
import { StatCard } from "@/components/modules/stat-card"
import { PeopleConsole } from "@/components/admin/people-console"
import {
  buildRoster,
  type AuthActivityQueryRow,
  type InviteQueryRow,
  type ParticipantQueryRow,
  type RosterPerson,
  type UserQueryRow,
} from "@/lib/roster"

// The admin people console (Sprint 20) — the merge of Sprint 10's read-only
// /admin/roster and Sprint 16's /admin/participants, which were two views of
// one access funnel and disagreed about who exists. Both routes now redirect
// here. Non-admins get a 404, same pattern as /admin/import.
//
// "People", not "Participants", because it deliberately covers people who are
// NOT participants: an invite with no account, a member who signed in and
// abandoned onboarding. Seeing someone is stuck and unsticking them are the
// same page now.

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

export default async function AdminPeoplePage() {
  const { supabase } = await requireAdminPage()

  // The fee bounds come off the tournaments row — the approve/edit forms never
  // hardcode a dollar figure (and the API re-validates against the same row).
  const { data: tournamentData, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, name, entry_fee_min, entry_fee_max")
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle()
  // "No tournament yet" below is a real state; a failed read is not, and this
  // row carries the fee bounds the approve form validates against (#132).
  if (tournamentError) {
    console.error("[admin/people] tournament read failed:", tournamentError.message)
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
        <h1 className="font-heading text-3xl leading-tight text-text-strong">
          People
        </h1>
        <LoadError subject="the tournament" />
      </div>
    )
  }
  const tournament = tournamentData as {
    id: string
    name: string
    entry_fee_min: number
    entry_fee_max: number
  } | null

  if (!tournament) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
        <h1 className="font-heading text-3xl leading-tight text-text-strong">
          People
        </h1>
        <EmptyState
          title="No tournament yet"
          message="Create a tournament before there's a roster to read."
        />
      </div>
    )
  }

  // NOTE the users query has no onboarded_at filter. The old
  // /admin/participants page filtered them out, which made a member who
  // clicked the magic link and abandoned onboarding invisible on the very page
  // you'd go to in order to help them — that's the bug this merge fixes.
  const [invitesRes, usersRes, participantsRes, activityRes] = await Promise.all([
    supabase
      .from("tournament_invites")
      .select("email, invited_name")
      .eq("tournament_id", tournament.id),
    supabase
      .from("users")
      .select("id, email, display_name, nickname, avatar_url, is_admin, onboarded_at"),
    supabase
      // Revoked rows are NOT filtered out here — the console has to show a
      // revoked person so an admin can re-approve them (Sprint 21 / #91).
      .from("tournament_participants")
      .select("user_id, entry_fee, is_player, revoked_at")
      .eq("tournament_id", tournament.id),
    // Degrades to "Never" everywhere if it fails — losing last-login must not
    // take down the chase page.
    supabase.rpc("admin_auth_activity"),
  ])

  // The three roster reads are the page. A silent failure renders an empty
  // access funnel — "nobody has registered" — on the console an admin uses to
  // decide who still needs chasing (#132). activityRes stays excluded on
  // purpose: its degrade-to-"Never" is a decision, documented above.
  const rosterError =
    invitesRes.error ?? usersRes.error ?? participantsRes.error
  if (rosterError) {
    console.error("[admin/people] roster read failed:", rosterError.message)
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
        <h1 className="font-heading text-3xl leading-tight text-text-strong">
          People
        </h1>
        <LoadError subject="the roster" />
      </div>
    )
  }
  if (activityRes.error) {
    console.error(
      "[admin/people] auth-activity RPC failed, last-login shows Never:",
      activityRes.error.message
    )
  }

  const roster = buildRoster({
    invites: (invitesRes.data ?? []) as InviteQueryRow[],
    users: (usersRes.data ?? []) as UserQueryRow[],
    participants: (participantsRes.data ?? []) as ParticipantQueryRow[],
    authActivity: (activityRes.data ?? []) as AuthActivityQueryRow[],
  })

  const { funnel, notRegistered, notReady } = roster
  const allClear = notRegistered.length === 0 && notReady.length === 0

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <div>
        <h1 className="font-heading text-3xl leading-tight text-text-strong">
          People
        </h1>
        <p className="mt-0.5 text-sm text-text-muted">
          {tournament.name} · everyone&apos;s stage in the funnel, and the lever
          for it
        </p>
      </div>

      {/* The funnel, left to right. Every count is a filter over the same
          sorted array the table renders, so the header and the table cannot
          disagree. A fee-unset participant row counts as awaiting approval —
          it is still awaiting a valid one. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <StatCard label="No account" value={funnel.noAccount.length} />
        <StatCard label="Not onboarded" value={funnel.notOnboarded.length} />
        <StatCard label="Awaiting approval" value={funnel.awaitingApproval.length} />
        <StatCard label="Approved" value={funnel.approved.length} feature />
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
                hint="Approve them on their row below, or fix an email mismatch in Studio."
                people={notReady}
              />
            )}
          </>
        )}
      </Card>

      <PeopleConsole
        people={roster.people}
        hasInvites={roster.hasInvites}
        entryFeeMin={tournament.entry_fee_min}
        entryFeeMax={tournament.entry_fee_max}
      />

      <p className="text-center text-xs text-text-muted">
        Approving creates the <code>tournament_participants</code> row that
        grants betting access; revoking marks that row revoked rather than
        deleting it, so the entry fee and the bettor&apos;s wagers leave the
        pool together and both come back on re-approval. Invites only say who we
        expect — they never touch pool math.
      </p>
    </div>
  )
}
