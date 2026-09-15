import Link from "next/link"
import { redirect } from "next/navigation"
import { ExternalLink } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/modules/empty-state"
import { LoadError } from "@/components/modules/load-error"
import { EntryRequestForm } from "@/components/entry/entry-request-form"
import {
  describeRequest,
  entryStatus,
  requestWindow,
  VENMO_MEMO,
  VENMO_URL,
} from "@/lib/entry-request"
import {
  PARTICIPANT_ENTRY_COLUMNS,
  toPhaseClock,
  toTournamentRules,
  TOURNAMENT_CLOCK_COLUMNS,
  TOURNAMENT_RULE_COLUMNS,
} from "@/lib/placements"
import { enteredPhases, toBettor, type ParticipantEntries } from "@/lib/my-bets"

// /entry — the one-time entry request (Sprint 30 / PRD §12 A26), reached
// from the dashboard's entry tile, the My Bets budget header, and the
// onboarding step. The form renders only while nothing is on record; after
// that the page is a receipt — what was asked, the Venmo link again, and
// what an admin has recorded.

type EntryRequestRow = {
  id: string
  phase1_amount: number
  phase2_amount: number
  is_player: boolean
  created_at: string
}

export default async function EntryPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: tournamentData, error: tournamentError } = await supabase
    .from("tournaments")
    .select(`id, name, status, ${TOURNAMENT_RULE_COLUMNS}, ${TOURNAMENT_CLOCK_COLUMNS}`)
    .in("status", ["upcoming", "active", "completed"])
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (tournamentError) {
    console.error("[entry] tournament read failed:", tournamentError.message)
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
          title="No tournament to enter yet"
          message="Entries open once the next Ozark Open is set up. Check back soon."
        />
      </div>
    )
  }
  const tournament = tournamentData as unknown as { id: string; name: string; status: string } &
    Record<string, unknown>
  const rules = toTournamentRules(tournament)
  const now = new Date()
  const window = requestWindow(toPhaseClock(tournament), now, {
    completed: tournament.status === "completed",
  })

  const { data: participantData, error: participantError } = await supabase
    .from("tournament_participants")
    .select(PARTICIPANT_ENTRY_COLUMNS)
    .eq("user_id", user.id)
    .eq("tournament_id", tournament.id)
    .is("revoked_at", null)
    .maybeSingle()
  // A failed read here would offer the form to someone whose money is already
  // in — and the API would refuse it, but only after they'd typed it all in.
  if (participantError) {
    console.error("[entry] participant read failed:", participantError.message)
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <LoadError subject="your registration" />
      </div>
    )
  }
  const participant = participantData as unknown as ParticipantEntries | null

  const { data: requestData, error: requestError } = await supabase
    .from("entry_requests")
    .select("id, phase1_amount, phase2_amount, is_player, created_at")
    .eq("user_id", user.id)
    .eq("tournament_id", tournament.id)
    .maybeSingle()
  if (requestError) {
    console.error("[entry] entry request read failed:", requestError.message)
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <LoadError subject="your entry request" />
      </div>
    )
  }
  const request = (requestData as EntryRequestRow | null) ?? null
  const status = entryStatus(participant, request)

  let body: React.ReactNode
  if (status === "entered" && participant) {
    const entries = enteredPhases(toBettor(user.id, participant))
    body = (
      <Card accent elevated>
        <CardContent className="flex flex-col gap-4">
          <div>
            <div className="font-heading text-2xl text-text-strong">Your entry is in</div>
            <p className="mt-1 text-sm leading-normal text-text-muted">
              Recorded by an admin. Each phase is its own pot — wager the full
              amount in every phase you&apos;re in.
            </p>
          </div>
          <ul className="flex flex-col gap-1 text-sm text-text-body">
            {entries.map((e) => (
              <li key={e.phase} className="flex justify-between">
                <span>Phase {e.phase}</span>
                <span className="font-semibold">${e.entry}</span>
              </li>
            ))}
            {entries.length === 1 && (
              <li className="text-xs text-text-muted">
                Not in Phase {entries[0].phase === 1 ? 2 : 1} — ask an admin if that&apos;s wrong.
              </li>
            )}
          </ul>
          <Button variant="gold" size="lg" className="w-full" render={<Link href="/bets" />}>
            Place Bets →
          </Button>
        </CardContent>
      </Card>
    )
  } else if (status === "requested" && request) {
    const total = request.phase1_amount + request.phase2_amount
    body = (
      <Card accent elevated data-testid="entry-requested">
        <CardContent className="flex flex-col gap-4">
          <div>
            <div className="font-heading text-2xl text-text-strong">
              Requested: ${total}
            </div>
            <p className="mt-1 text-sm leading-normal text-text-muted">
              {describeRequest(request)}
              {request.is_player ? "" : " · not playing"}. Waiting on an admin to
              record the money — pay it on Venmo if you haven&apos;t yet, memo{" "}
              <strong className="text-text-strong">{VENMO_MEMO}</strong>.
            </p>
          </div>
          <Button
            variant="gold"
            size="lg"
            className="w-full"
            render={<a href={VENMO_URL} target="_blank" rel="noopener noreferrer" />}
          >
            Open Venmo <ExternalLink className="size-4" aria-hidden />
          </Button>
          <p className="text-xs text-text-muted">
            A request can&apos;t be changed in the app. If something&apos;s
            wrong, tell an admin.
          </p>
        </CardContent>
      </Card>
    )
  } else if (window.state === "closed") {
    body = (
      <EmptyState
        title="Entry requests are closed"
        message="Betting has closed for both phases, so there's nothing left to enter. Talk to an admin if you think that's wrong."
      />
    )
  } else {
    body = (
      <>
        {window.state === "phase2_only" && (
          <p className="rounded-lg border border-caution-border bg-caution-surface px-4 py-3 text-sm text-caution-strong">
            Phase 1 has closed — only Phase 2 can be entered now.
          </p>
        )}
        <EntryRequestForm
          rules={rules}
          window={window}
          defaultIsPlayer={participant?.is_player ?? true}
          doneHref="/bets"
        />
      </>
    )
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
      <div>
        <h1 className="font-heading text-3xl leading-tight text-text-strong">Your Entry</h1>
        <p className="mt-0.5 text-sm text-text-muted">{tournament.name}</p>
      </div>
      {body}
      <Link
        href="/dashboard"
        className="text-center text-sm text-text-muted underline-offset-4 hover:underline"
      >
        Back to the dashboard
      </Link>
    </div>
  )
}
