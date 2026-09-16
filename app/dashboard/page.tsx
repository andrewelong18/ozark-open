import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { AccordionSection } from "@/components/ui/accordion-section"
import { StatCard } from "@/components/modules/stat-card"
import { RulesCard } from "@/components/modules/rules-card"
import { EmptyState } from "@/components/modules/empty-state"
import { AdCarousel } from "@/components/ads/ad-carousel"
import { ads } from "@/lib/ads"
import { LoadError } from "@/components/modules/load-error"
import { HowItWorksLauncher } from "@/components/onboarding/how-it-works-launcher"
import { Countdown } from "@/components/countdown"
import Link from "next/link"
import { TriangleAlert } from "lucide-react"
import {
  bettingBadge,
  currentPhase,
  formatDeadline,
  nextDeadline,
  phaseClosedByClock,
} from "@/lib/phases"
import {
  normalizeExistingPlacements,
  PARTICIPANT_ENTRY_COLUMNS,
  toPhaseClock,
  toPhaseEntry,
  toTournamentRules,
  TOURNAMENT_CLOCK_COLUMNS,
  TOURNAMENT_RULE_COLUMNS,
  type PlacementQueryRow,
} from "@/lib/placements"
import { StandingsBoard } from "@/components/results/standings-board"
import { ComplianceBanner } from "@/components/modules/compliance-banner"
import { ActivityFeed } from "@/components/modules/activity-feed"
import { loadActivityFeed } from "@/lib/activity-source"
import type { FeedBet } from "@/lib/activity"
import {
  buildComplianceSummary,
  buildRulesModel,
  enteredPhases,
  toBettor,
  type ParticipantEntries,
} from "@/lib/my-bets"
import { entryStatus } from "@/lib/entry-request"

// Dashboard (reworked in Sprint 5, closing #23): the two pots, the
// participant's entries, and their personalized rules — every number derived
// from the tournaments row through lib/validation.ts, never computed inline.
// Since Sprint 30 (ADR 0002) each phase is its own pot with its own entry,
// and the entry tile is the way in to the one-time entry request.

type Tournament = {
  id: string
  name: string
  year: number
  status: "upcoming" | "active" | "completed"
}

type PoolRow = { phase1_entry_fee: unknown; phase2_entry_fee: unknown }

type EntryRequestRow = { id: string; phase1_amount: number; phase2_amount: number }

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: tournamentData, error: tournamentError } = await supabase
    .from("tournaments")
    .select(`id, name, year, status, ${TOURNAMENT_RULE_COLUMNS}, ${TOURNAMENT_CLOCK_COLUMNS}`)
    // 'completed' is here so the dashboard can BECOME the final standings
    // (Sprint 28 / #197). Without it a finalized tournament returns null and
    // the front door reads "No active tournament" on the one night everybody
    // opens the app.
    .in("status", ["upcoming", "active", "completed"])
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle()

  // "No tournament yet" is a real state a member should believe; a failed
  // read is not, and the dashboard's numbers are all money (#132).
  if (tournamentError) {
    console.error("[dashboard] tournament read failed:", tournamentError.message)
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
          message="There's no tournament open for betting right now. Check back before the next Ozark Open."
        />
      </div>
    )
  }

  const tournament = tournamentData as unknown as Tournament

  // THE SWAP (Sprint 28 / #197, re-shaped Sept 16, 2026). Once the book is
  // closed this page stops being a betting console and becomes the settlement
  // surface — but it keeps its own shell: the header, the badge, and the rail
  // with the feed and the ads. The standings board REPLACES the pool/place-bets
  // content in the middle, rather than replacing the whole page (which is what
  // the previous early return did, and which is why the board had to grow a
  // feed and an ad rail of its own).
  //
  // The early return's other job stands: none of the PER-MEMBER money reads —
  // participant, entry request, placements — runs post-finalize. They are
  // guarded below, so `bettor` is null and nothing downstream computes a
  // balance for a tournament that has already been split.
  const completed = tournament.status === "completed"

  const rules = toTournamentRules(
    tournamentData as unknown as Record<string, unknown>
  )

  // The two pots, from real registrations: each phase's pot is the sum of
  // that phase's entries (ADR 0002 §1 — before any close-time forfeits and
  // refunds, which the standings board accounts for).
  const { data: poolData, error: poolError } = await supabase
    .from("tournament_participants")
    .select("phase1_entry_fee, phase2_entry_fee")
    .eq("tournament_id", tournament.id)
    // A revoked bettor's fee no longer funds the pool (Sprint 21 / #91).
    .is("revoked_at", null)

  // A dropped error here renders a $0 pool with 0 players, which is a
  // confident lie about the money rather than an absence of data (#132).
  if (poolError) {
    console.error("[dashboard] pool read failed:", poolError.message)
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <LoadError subject="the pool" />
      </div>
    )
  }

  const poolRows = (poolData as PoolRow[] | null) ?? []
  const pot = (phase: 1 | 2) => {
    let sum = 0
    let count = 0
    for (const row of poolRows) {
      const entry = toPhaseEntry(phase === 1 ? row.phase1_entry_fee : row.phase2_entry_fee)
      if (entry !== null) {
        sum += entry
        count += 1
      }
    }
    return { sum, count }
  }
  const pot1 = pot(1)
  const pot2 = pot(2)
  const playerCount = poolRows.length

  // This user's registration. Skipped once the tournament is finalized —
  // there is no balance left to compute.
  const { data: participantData, error: participantError } = user && !completed
    ? await supabase
        .from("tournament_participants")
        .select(PARTICIPANT_ENTRY_COLUMNS)
        .eq("user_id", user.id)
        .eq("tournament_id", tournament.id)
        .is("revoked_at", null)
        .maybeSingle()
    : { data: null, error: null }

  if (participantError) {
    console.error("[dashboard] participant read failed:", participantError.message)
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <LoadError subject="your registration" />
      </div>
    )
  }

  const participant = participantData as unknown as ParticipantEntries | null
  const bettor = user && participant ? toBettor(user.id, participant) : null

  // Their entry request, if any (own row under RLS). Decides what the entry
  // tile says and whether it carries the warning icon. A failed read degrades
  // to "no request" — the cautious reading, since it shows the warning.
  const { data: requestData, error: requestError } = user && !completed
    ? await supabase
        .from("entry_requests")
        .select("id, phase1_amount, phase2_amount")
        .eq("user_id", user.id)
        .eq("tournament_id", tournament.id)
        .maybeSingle()
    : { data: null, error: null }
  if (requestError) {
    console.error("[dashboard] entry request read failed:", requestError.message)
  }
  const request = (requestData as EntryRequestRow | null) ?? null
  const status = entryStatus(participant, request)

  // This user's live wagers, joined through picks (placements reference
  // bet_picks, not bets — ADR 0001) and scoped in normalization.
  const { data: placementData, error: placementError } = user && !completed
    ? await supabase
        .from("bet_placements")
        .select(
          "pick_id, amount, bet_picks ( player_user_id, bets ( id, phase, tournament_id ) )"
        )
        .eq("user_id", user.id)
        .is("deleted_at", null)
    : { data: null, error: null }

  // Their wagers drive the balance badge and the "you're all in" state. An
  // empty read would tell a fully-committed bettor they've bet nothing.
  if (placementError) {
    console.error("[dashboard] placements read failed:", placementError.message)
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <LoadError subject="your wagers" />
      </div>
    )
  }

  const existing = normalizeExistingPlacements(
    (placementData ?? []) as unknown as PlacementQueryRow[],
    tournament.id
  )
  const betCount = existing.length

  // #107: this used to read tournaments.status, which has never gated betting
  // (gameplan landmine #2) — so it showed a green "Betting Open" over an empty
  // menu. It now derives from the same phase state /bets renders: the bets
  // themselves say what's published, the clock says whether you can still bet.
  const clock = toPhaseClock(
    tournamentData as unknown as Record<string, unknown>
  )
  const now = new Date()
  // `phase, status` and NOTHING the activity feed wants. This read gates the
  // betting badge, so a column it doesn't need is a column that can take the
  // whole dashboard down — which is exactly what happened on Aug 31, 2026: it
  // briefly selected `opened_at` for the feed, shipped ahead of the migration
  // that adds it, and every member got "We couldn't load the betting status"
  // instead of a dashboard. The feed reads its own columns now
  // (lib/activity-source.ts), where a failure costs one line of ambient colour.
  //
  // The rule that came out of it: a core read on this page may only select
  // columns the page itself needs.
  const { data: phaseBetsData, error: phaseBetsError } = await supabase
    .from("bets")
    .select("phase, status")
    .eq("tournament_id", tournament.id)
  if (phaseBetsError) {
    console.error("[dashboard] phase bets read failed:", phaseBetsError.message)
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <LoadError subject="the betting status" />
      </div>
    )
  }
  const phaseBets = (phaseBetsData ?? []) as FeedBet[]
  const badge = bettingBadge(clock, phaseBets, now)
  const upcoming = clock.show_countdown ? nextDeadline(clock, now) : null

  // The activity feed's first page, rendered server-side so the rail is
  // populated on first paint; the component polls /api/activity from there.
  // It never throws and never blocks the page — a quiet feed beside working
  // money numbers is the right failure mode (lib/activity-source.ts).
  const activity = await loadActivityFeed(
    supabase,
    tournament.id,
    clock,
    phaseBets,
    now
  )
  // The phase the app is in. Every balance and warning below is about this
  // one and no other (PRD §12 A27) — a Phase 2 forfeit warning during Phase 1
  // named money a member could do nothing about.
  const phase = currentPhase(phaseBets)
  const myRules = bettor ? buildRulesModel(bettor, rules, phase) : null
  // UNFILTERED on purpose: this answers "has this member's money arrived at
  // all", which decides the entry tile and the "No money in yet" banner. A
  // member entered only in the phase that isn't current still has money in.
  const myEntries = bettor ? enteredPhases(bettor) : []
  const entryTotal = myEntries.reduce((sum, e) => sum + e.entry, 0)
  const requestTotal = request ? request.phase1_amount + request.phase2_amount : 0

  // Compliance items behind one collapsed header, one set per phase the
  // member is in. Only the warnings count — a success item is the summary's
  // way of saying a phase has nothing wrong, and counting it would put a "1"
  // on a page with nothing to fix. A closed phase contributes one info line
  // stating what happened; telling someone to go bet on results night is
  // worse than saying nothing.
  const alerts = bettor
    ? buildComplianceSummary(existing, bettor, rules, {
        closed: {
          1: phaseClosedByClock(1, clock, now),
          2: phaseClosedByClock(2, clock, now),
        },
        only: phase,
      })
    : []
  const alertCount = alerts.filter((a) => a.tone === "warning").length
  // "You're balanced" is every phase's SUCCESS item, not "no warnings". A
  // member who hasn't wagered gets a warning now (the money it costs them),
  // so nothing here can congratulate them for the one thing they still have
  // to do.
  const balanced = alerts.length > 0 && alerts.every((a) => a.tone === "success")
  // A single info item's title becomes the section header below. Rendering it
  // on the banner too would print the same short phrase twice.
  const soloInfo = alerts.length === 1 && alerts[0].tone === "info"

  const entryCaption =
    status === "entered"
      ? myEntries.map((e) => `P${e.phase} $${e.entry}`).join(" · ")
      : status === "requested"
        ? participant
          ? "Requested · pay on Venmo"
          : "Requested · awaiting approval"
        : "Request your entry"

  return (
    <div className="mx-auto grid max-w-[var(--container-max,1120px)] grid-cols-1 gap-4 px-4 py-6 lg:grid-cols-3 lg:gap-6">
      <div data-enter-stagger className="flex flex-col gap-4 lg:col-span-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl leading-tight text-text-strong">
            {tournament.name}
          </h1>
          <p className="mt-0.5 text-sm text-text-muted">
            {tournament.year} · {playerCount}{" "}
            {playerCount === 1 ? "player" : "players"} registered
          </p>
        </div>
        <Badge variant={badge.open ? "green" : "neutral"} uppercase>
          {badge.label}
        </Badge>
      </div>

      {completed ? (
        // The finalized page: the leaderboard stands where the pots, the entry
        // tile, the Place Bets button, the alerts and the house rules were.
        // heading={false} because the dashboard already printed the tournament
        // name above, and two <h1>s on one page is one too many.
        <StandingsBoard
          tournamentRow={tournamentData as unknown as Record<string, unknown>}
          viewerUserId={user?.id ?? null}
          heading={false}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Phase 1 Pot"
              value={pot1.sum}
              money
              feature
              caption={`${pot1.count} ${pot1.count === 1 ? "entry" : "entries"}`}
            />
            <StatCard
              label="Phase 2 Pot"
              value={pot2.sum}
              money
              feature
              caption={`${pot2.count} ${pot2.count === 1 ? "entry" : "entries"}`}
            />
            {/* The way in to the entry request. The tile is the link — "click in on
                the dashboard where it says their entry amount" — and it carries
                the warning icon until money has been asked for or recorded. */}
            <Link
              href="/entry"
              data-testid="entry-tile"
              aria-label={
                status === "none"
                  ? "Your entry — no money added yet. Request your entry."
                  : "Your entry"
              }
              className="block rounded-xl transition-transform hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            >
              <StatCard
                label="Your Entry"
                value={
                  status === "entered"
                    ? entryTotal
                    : status === "requested"
                      ? requestTotal
                      : "—"
                }
                money={status !== "none"}
                caption={entryCaption}
                badge={
                  status === "none" ? (
                    <TriangleAlert
                      className="size-3.5 text-caution-strong"
                      aria-hidden
                      data-testid="entry-warning"
                    />
                  ) : undefined
                }
                className="h-full"
              />
            </Link>
            <StatCard label="Bets Placed" value={betCount} caption="This tournament" />
          </div>

          {participant && myRules ? (
            <>
              {/* The budget bars moved to /my-bets (where the wagers they summarise
                  actually live), so this is the dashboard's route to the bet menu. */}
              <Button
                variant="gold"
                size="lg"
                className="w-full"
                render={<Link href="/bets" />}
              >
                Place Bets →
              </Button>

              {/* Approved, but no money in either phase: the menu is read-only
                  for them until an entry is recorded, and the one thing to do is
                  the request. */}
              {myEntries.length === 0 && (
                <ComplianceBanner tone="warning" title="No money in yet">
                  {status === "requested" ? (
                    <>
                      Your entry is requested — pay it on Venmo if you haven&apos;t,
                      and your budget appears once an admin records it.{" "}
                      <Link href="/entry" className="font-semibold underline underline-offset-2">
                        See your request
                      </Link>
                    </>
                  ) : (
                    <>
                      Nothing on the menu can be wagered on until your entry is in.{" "}
                      <Link href="/entry" className="font-semibold underline underline-offset-2">
                        Request your entry
                      </Link>{" "}
                      — it&apos;s a one-time form.
                    </>
                  )}
                </ComplianceBanner>
              )}

              {/* Alerts, collapsed, with the count on the header. The banners
                  themselves are unchanged and still say the whole thing when
                  opened — what changed is that two standing warnings no longer
                  push the rest of the dashboard below the fold all weekend.
                  Tone follows the contents: nothing to fix reads as balanced, not
                  as "Alerts 0". */}
              {alerts.length > 0 && (
                <AccordionSection
                  title={
                    alertCount > 0
                      ? "Alerts"
                      : balanced
                        ? "You're balanced"
                        : soloInfo
                          ? alerts[0].title
                          : "Where you stand"
                  }
                  glyph={alertCount > 0 ? "⚠️" : balanced ? "✓" : "ℹ️"}
                  count={alertCount > 0 ? alertCount : undefined}
                  tone={alertCount > 0 ? "caution" : balanced ? "win" : "indigo"}
                  bodyClassName="flex flex-col gap-2 p-3"
                >
                  {alerts.map((item) => (
                    <ComplianceBanner
                      key={`${item.phase}-${item.title}`}
                      tone={item.tone}
                      title={soloInfo ? undefined : item.title}
                    >
                      {item.message}
                    </ComplianceBanner>
                  ))}
                </AccordionSection>
              )}

              <RulesCard
                maxSingle={myRules.max_single_bet}
                minPicks={myRules.min_picks_per_phase}
                entryFeeMin={rules.entry_fee_min}
                phases={myRules.phases.map((p) => ({
                  phase: p.phase,
                  entryFee: p.entry_fee,
                  maxSelf: p.max_self_bet,
                }))}
              />
            </>
          ) : (
            <EmptyState
              glyph="🏌️"
              title="Approval pending"
              message={
                status === "none"
                  ? "You're registered — request your entry above, pay it on Venmo, and an admin approves you to place bets. You can browse the full bet menu in the meantime."
                  : "You're registered — an admin just needs to approve you to place bets. You can browse the full bet menu in the meantime."
              }
            />
          )}

          <HowItWorksLauncher rules={rules} />
        </>
      )}
      </div>

      {/* Activity feed — the right rail on desktop, stacked below on mobile.
          Placeholder until there's a feed to show. */}
      <aside className="flex flex-col gap-4 lg:col-span-1">
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-lg text-text-strong">Activity</h2>
          {/* The next betting deadline when there is one and admins have the
              countdown switched on (#106); otherwise the opening ceremony, as
              before. Same low-key component either way — the brand rule is no
              countdown-timer anxiety, and that holds even now that the thing
              it counts to is a deadline.

              Nothing at all once the tournament is finalized: there is no
              deadline left, and the fallback counts to a fixed date that is by
              then in the past. */}
          {completed ? null : upcoming ? (
            <Card>
              <CardContent className="flex flex-col gap-3">
                <div>
                  <div className="font-heading text-lg text-text-strong">
                    Phase {upcoming.phase} betting closes
                  </div>
                  <p className="text-sm text-text-muted">
                    {formatDeadline(upcoming.at)}
                  </p>
                </div>
                <Countdown target={upcoming.at} />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col gap-3">
                <div>
                  <div className="font-heading text-lg text-text-strong">
                    Opening ceremony
                  </div>
                  <p className="text-sm text-text-muted">Sep 24, 2026 · 8:00 PM CT</p>
                </div>
                <Countdown target={new Date("2026-09-24T20:00:00-05:00")} />
              </CardContent>
            </Card>
          )}
          {/* The feed itself. Names and moments only — who is playing, never
              what they played; the position half stays behind the bet closing
              (PRD §8, §12). It renders its own empty state. */}
          <ActivityFeed
            initialEvents={activity}
            serverNow={now.toISOString()}
          />
        </section>

        {/* Fake-sponsor slot — sits below the feed, rotates on its own. */}
        <AdCarousel ads={ads} className="mx-auto" />
      </aside>
    </div>
  )
}
