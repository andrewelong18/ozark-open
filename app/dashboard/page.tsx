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
import { bettingBadge, formatDeadline, nextDeadline } from "@/lib/phases"
import {
  normalizeExistingPlacements,
  toPhaseClock,
  toTournamentRules,
  TOURNAMENT_CLOCK_COLUMNS,
  TOURNAMENT_RULE_COLUMNS,
  type PlacementQueryRow,
} from "@/lib/placements"
import { ComplianceBanner } from "@/components/modules/compliance-banner"
import { buildComplianceSummary, buildRulesModel } from "@/lib/my-bets"

// Dashboard (reworked in Sprint 5, closing #23): pool total, the
// participant's budget, and their personalized rules — every number derived
// from the tournaments row through lib/validation.ts, never computed inline.

type Tournament = {
  id: string
  name: string
  year: number
  status: "upcoming" | "active" | "completed"
}

type Participant = { entry_fee: number; is_player: boolean }

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: tournamentData, error: tournamentError } = await supabase
    .from("tournaments")
    .select(`id, name, year, status, ${TOURNAMENT_RULE_COLUMNS}, ${TOURNAMENT_CLOCK_COLUMNS}`)
    .in("status", ["upcoming", "active"])
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
  const rules = toTournamentRules(
    tournamentData as unknown as Record<string, unknown>
  )

  // Pool total + player count from real registrations.
  const { data: poolData, error: poolError } = await supabase
    .from("tournament_participants")
    .select("entry_fee")
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

  const poolRows = (poolData as { entry_fee: number }[] | null) ?? []
  const poolTotal = poolRows.reduce((sum, r) => sum + Number(r.entry_fee), 0)
  const playerCount = poolRows.length

  // This user's registration.
  const { data: participantData, error: participantError } = user
    ? await supabase
        .from("tournament_participants")
        .select("entry_fee, is_player")
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

  const participant = participantData as Participant | null

  // This user's live wagers, joined through picks (placements reference
  // bet_picks, not bets — ADR 0001) and scoped in normalization.
  const { data: placementData, error: placementError } = user
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
  const badge = bettingBadge(
    clock,
    (phaseBetsData ?? []) as { phase: number; status: string }[],
    now
  )
  const upcoming = clock.show_countdown ? nextDeadline(clock, now) : null
  const myRules = participant ? buildRulesModel(participant, rules) : null

  // Compliance items behind one collapsed header. Only the warnings count —
  // the "you're balanced" item is the summary's way of saying there are none,
  // and counting it would put a "1" on a page with nothing wrong.
  const alerts = myRules
    ? buildComplianceSummary(existing, myRules.entry_fee, rules)
    : []
  const alertCount = alerts.filter((a) => a.tone === "warning").length

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

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <StatCard
            label="Pool Total"
            value={poolTotal}
            money
            feature
            caption={`${playerCount} ${playerCount === 1 ? "player" : "players"} in`}
          />
        </div>
        <StatCard
          label="Your Entry"
          value={Number(participant?.entry_fee ?? 0)}
          money
          caption={participant ? undefined : "Pending approval"}
        />
        <StatCard label="Bets Placed" value={betCount} caption="This tournament" />
      </div>

      {participant && myRules ? (
        <>
          {/* The budget bar moved to /my-bets (where the wagers it summarises
              actually live), so this is the dashboard's route to the bet menu. */}
          <Button
            variant="gold"
            size="lg"
            className="w-full"
            render={<Link href="/bets" />}
          >
            Place Bets →
          </Button>

          {/* Alerts, collapsed, with the count on the header. The banners
              themselves are unchanged and still say the whole thing when
              opened — what changed is that two standing warnings no longer
              push the rest of the dashboard below the fold all weekend.
              Tone follows the contents: nothing to fix reads as balanced, not
              as "Alerts 0". */}
          {alerts.length > 0 && (
            <AccordionSection
              title={alertCount > 0 ? "Alerts" : "You're balanced"}
              glyph={alertCount > 0 ? "⚠️" : "✓"}
              count={alertCount > 0 ? alertCount : undefined}
              tone={alertCount > 0 ? "caution" : "win"}
              bodyClassName="flex flex-col gap-2 p-3"
            >
              {alerts.map((item) => (
                <ComplianceBanner
                  key={item.title}
                  tone={item.tone}
                  title={item.title}
                >
                  {item.message}
                </ComplianceBanner>
              ))}
            </AccordionSection>
          )}

          <RulesCard
            entryFee={myRules.entry_fee}
            maxSingle={myRules.max_single_bet}
            maxSelf={myRules.max_self_bet}
            minBets={myRules.min_picks_per_tournament}
            maxBets={myRules.max_picks_per_phase}
          />
        </>
      ) : (
        <EmptyState
          glyph="🏌️"
          title="Approval pending"
          message="You're registered — an admin just needs to approve you to place bets. You can browse the full bet menu in the meantime."
        />
      )}

      <HowItWorksLauncher
        minPicks={rules.min_picks_per_tournament}
        maxPicks={rules.max_picks_per_phase}
      />
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
              it counts to is a deadline. */}
          {upcoming ? (
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
          <EmptyState
            glyph="📣"
            title="No activity yet"
            message="Bets, line moves, and pool news will show up here."
          />
        </section>

        {/* Fake-sponsor slot — sits below the feed, rotates on its own. */}
        <AdCarousel ads={ads} className="mx-auto" />
      </aside>
    </div>
  )
}
