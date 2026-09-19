import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { TriangleAlert } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatCard } from "@/components/modules/stat-card"
import { BudgetModule } from "@/components/modules/budget-module"
import { EmptyState } from "@/components/modules/empty-state"
import { LoadError } from "@/components/modules/load-error"
import { MoneyDisplay } from "@/components/betting/money-display"
import { OddsChip } from "@/components/betting/odds-chip"
import { ROUND_LABEL } from "@/lib/bet-taxonomy"
import { phaseStandings } from "@/lib/validation"
import {
  PARTICIPANT_ENTRY_COLUMNS,
  toPhaseClock,
  toTournamentRules,
  TOURNAMENT_CLOCK_COLUMNS,
  TOURNAMENT_RULE_COLUMNS,
} from "@/lib/placements"
import { currentPhase, phaseClosedByClock, type Phase } from "@/lib/phases"
import { entryStatus } from "@/lib/entry-request"
import { RulesCard } from "@/components/modules/rules-card"
import { ComplianceBanner } from "@/components/modules/compliance-banner"
import { OutcomeBadge } from "@/components/betting/outcome-badge"
import { PickLabel } from "@/components/betting/pick-label"
import {
  buildComplianceSummary,
  buildRulesModel,
  entryPayout,
  entryRefund,
  groupByPhase,
  normalizeMyBets,
  payoutSummary,
  toBettor,
  type MyBetsQueryRow,
  type ParticipantEntries,
} from "@/lib/my-bets"

// My Bets (Sprint 5): the participant's live placements grouped by phase,
// with one budget bar per phase they are in (Sprint 30 / ADR 0002). The page
// is glue — grouping and join normalization live in lib/my-bets.ts. Each row
// shows the wager's odds_at_placement snapshot, never the pick's live odds
// (those are the bet menu's job, sheet-verbatim).

export default async function MyBetsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: tournamentData, error: tournamentError } = await supabase
    .from("tournaments")
    .select(`id, name, ${TOURNAMENT_RULE_COLUMNS}, ${TOURNAMENT_CLOCK_COLUMNS}`)
    // 'completed' included (Sprint 28 / #197) — people re-read their own card
    // all night once the payouts are up, checking their wagers against it.
    .in("status", ["upcoming", "active", "completed"])
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (tournamentError) {
    console.error("[my-bets] tournament read failed:", tournamentError.message)
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
  const tournament = tournamentData as { id: string; name: string } & Record<
    string,
    unknown
  >
  const rules = toTournamentRules(tournament)
  const clock = toPhaseClock(tournament)
  const now = new Date()
  const closed = { 1: phaseClosedByClock(1, clock, now), 2: phaseClosedByClock(2, clock, now) }

  const { data: participantData, error: participantError } = user
    ? await supabase
        .from("tournament_participants")
        .select(PARTICIPANT_ENTRY_COLUMNS)
        .eq("user_id", user.id)
        .eq("tournament_id", tournament.id)
        .is("revoked_at", null)
        .maybeSingle()
    : { data: null, error: null }
  // Without this, a failed read shows an approved bettor the "Approval
  // pending" card — telling them to go chase an admin who already approved
  // them, on the page where their own money lives (#132).
  if (participantError) {
    console.error("[my-bets] participant read failed:", participantError.message)
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <LoadError subject="your registration" />
      </div>
    )
  }
  const participant = participantData as unknown as ParticipantEntries | null

  if (!participant) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <EmptyState
          glyph="🏌️"
          title="Approval pending"
          message="You're registered — an admin just needs to approve you to place bets. Browse the bet menu in the meantime."
        />
      </div>
    )
  }
  const bettor = toBettor(user!.id, participant)

  // Their request, if any — decides whether the budget card warns that no
  // money has been added yet. Own row under RLS; a failure degrades to "no
  // request", which is the cautious reading (it shows the warning).
  const { data: requestData, error: requestError } = await supabase
    .from("entry_requests")
    .select("id")
    .eq("user_id", user!.id)
    .eq("tournament_id", tournament.id)
    .maybeSingle()
  if (requestError) {
    console.error("[my-bets] entry request read failed:", requestError.message)
  }
  const status = entryStatus(participant, requestData ?? null)

  // Which phase the app is in, so the budget bar and the banners are about
  // that one and no other (PRD §12 A27). The placement join can't answer it —
  // it only carries bets this member already wagered on — so it needs its own
  // read of the menu's phase/status.
  //
  // A FAILED READ FALLS BACK TO BOTH PHASES, not to a guess. Hiding a budget
  // bar because a read failed would quietly tell someone their money isn't
  // theirs; showing one phase too many is the harmless direction.
  const { data: phaseBetsData, error: phaseBetsError } = await supabase
    .from("bets")
    .select("phase, status")
    .eq("tournament_id", tournament.id)
  if (phaseBetsError) {
    console.error("[my-bets] phase bets read failed:", phaseBetsError.message)
  }
  const phase: Phase | undefined = phaseBetsError
    ? undefined
    : currentPhase((phaseBetsData ?? []) as { phase: number; status: string }[])

  // Own live placements across the tournament, flattened for display.
  const { data: placementData, error: placementError } = await supabase
    .from("bet_placements")
    .select(
      "pick_id, amount, odds_at_placement, bet_picks ( label, sheet_pick_id, player_user_id, result, bets ( id, title, phase, round, status, sheet_bet_id, tournament_id ) )"
    )
    .eq("user_id", user!.id)
    .is("deleted_at", null)

  // This page IS the member's wagers. An empty read here is the single most
  // alarming possible false statement the app can make (#132).
  if (placementError) {
    console.error("[my-bets] placements read failed:", placementError.message)
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <LoadError subject="your wagers" />
      </div>
    )
  }

  const entries = normalizeMyBets(
    (placementData ?? []) as unknown as MyBetsQueryRow[],
    tournament.id
  )
  const phases = groupByPhase(entries)
  const standings = phaseStandings(entries, bettor, rules)
  // Two lists, deliberately. `allEntered` answers "has this member's money
  // arrived at all" — the question the "No money in yet" banner and the empty
  // state ask, and the one a current-phase filter must never be allowed to
  // answer wrongly for someone entered only in the OTHER phase. `entered` is
  // what actually renders a budget bar (A27).
  const allEntered = ([1, 2] as const).filter((p) => standings[p] !== undefined)
  const entered =
    phase === undefined ? allEntered : allEntered.filter((p) => p === phase)
  const myRules = buildRulesModel(bettor, rules, phase)
  const compliance = buildComplianceSummary(entries, bettor, rules, {
    closed,
    only: phase,
  })

  // Theoretical payout rollup — shown once any pick has a result. Pushes
  // count inside the total; voids contribute 0 and surface as refunded.
  const payouts = payoutSummary(entries)
  const anyResolved = entries.some((e) => e.result !== "pending")
  const payoutCaption = [
    "Pushes count",
    ...(payouts.refunded > 0 ? [`$${payouts.refunded} refunded on voids`] : []),
    ...(payouts.pending > 0
      ? [`${payouts.pending} pick${payouts.pending === 1 ? "" : "s"} still pending`]
      : []),
  ].join(" · ")

  return (
    <div className="mx-auto grid max-w-[var(--container-max,1120px)] grid-cols-1 gap-4 px-4 py-6 lg:grid-cols-3 lg:gap-6">
      <div className="flex flex-col gap-4 lg:col-span-2">
      <div>
        <h1 className="font-heading text-3xl leading-tight text-text-strong">
          My Bets
        </h1>
        <p className="mt-0.5 text-sm text-text-muted">{tournament.name}</p>
      </div>

      {/* One budget bar per phase the member is in (Sprint 30). Each phase is
          its own pot, so each bar carries its own wagered/entry, its own pick
          count and its own balanced state. Nothing in yet → the way to fix
          that, with the warning icon the user asked for. */}
      <Card>
        <CardContent className="flex flex-col gap-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-heading text-lg text-text-strong">
              Your Budget
              {status === "none" && (
                <Link
                  href="/entry"
                  aria-label="No money added yet — request your entry"
                  className="inline-flex items-center text-caution-strong"
                >
                  <TriangleAlert className="size-5" aria-hidden />
                </Link>
              )}
            </div>
            <Button variant="gold" size="sm" render={<Link href="/bets" />}>
              Place Bets →
            </Button>
          </div>
          {allEntered.length === 0 ? (
            <ComplianceBanner tone="warning" title="No money in yet">
              {status === "requested" ? (
                <>
                  Your entry is requested — pay it on Venmo if you haven&apos;t,
                  and your budget appears here once an admin records it.{" "}
                  <Link href="/entry" className="font-semibold underline underline-offset-2">
                    See your request
                  </Link>
                </>
              ) : (
                <>
                  Nothing can be wagered until your entry is recorded.{" "}
                  <Link href="/entry" className="font-semibold underline underline-offset-2">
                    Request your entry
                  </Link>{" "}
                  — it&apos;s a one-time form.
                </>
              )}
            </ComplianceBanner>
          ) : entered.length === 0 ? (
            // Money IS in — just not in the phase the app is in. Saying "no
            // money in yet" here would be a lie, and a budget bar for a phase
            // with nothing on the menu is a total you cannot move. Which way
            // it misses matters: a phase behind the current one has closed and
            // its money is settled, one ahead simply hasn't opened.
            <p className="text-sm text-text-body" data-testid="budget-other-phase">
              You&apos;re in Phase {allEntered[0]} —{" "}
              <span className="font-semibold">${standings[allEntered[0]]!.entry}</span>.{" "}
              {phase !== undefined && allEntered[0] < phase ? (
                <>
                  That phase has closed; where it finished is on the{" "}
                  <Link
                    href="/standings"
                    className="font-semibold text-indigo-700 underline-offset-4 hover:underline"
                  >
                    Leaderboard
                  </Link>
                  .
                </>
              ) : (
                `Phase ${allEntered[0]} bets aren't open yet — your budget appears here when they are.`
              )}
            </p>
          ) : (
            entered.map((p) => {
              const s = standings[p]!
              return (
                // The wrapper names the phase for tests: the module's own
                // testids repeat once per bar.
                <div key={p} data-testid={`budget-phase-${p}`}>
                  <BudgetModule
                    label={`Phase ${p}`}
                    wagered={s.wagered}
                    entryFee={s.entry}
                    picksLine={`${s.pick_count} ${s.pick_count === 1 ? "pick" : "picks"} · ${rules.min_picks_per_phase} min`}
                    balanced={s.complete}
                  />
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {anyResolved && (
        <StatCard
          label="Theoretical Payout"
          value={payouts.theoretical}
          money
          cents
          caption={payoutCaption}
        />
      )}

      {compliance.map((item) => (
        <ComplianceBanner key={`${item.phase}-${item.title}`} tone={item.tone} title={item.title}>
          {item.message}
        </ComplianceBanner>
      ))}

      {entries.length === 0 ? (
        <EmptyState
          title="No bets placed yet"
          message={
            allEntered.length === 0
              ? "Once your entry is recorded the bet menu is yours."
              : `Each phase you're in needs at least ${rules.min_picks_per_phase} picks totalling your entry for that phase — once you've wagered anything, the first $${rules.entry_fee_min} of an entry stays in the pot whether or not you wager that much. Wager nothing at all and the whole entry comes back.`
          }
          action={
            <Button variant="gold" size="sm" render={<Link href="/bets" />}>
              Place Bets →
            </Button>
          }
        />
      ) : (
        phases.map((group, i) => (
          // Cascades by phase section rather than by row: there are only two or
          // three sections, and staggering every placement inside them would be
          // noise on a page someone opens to check a number.
          <section
            key={group.phase}
            style={{ "--index": i } as React.CSSProperties}
            className="flex flex-col gap-2 motion-safe:animate-rise-in motion-safe:stagger"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-heading text-2xl text-indigo-700">
                Phase {group.phase}
              </h2>
              <span className="tabular text-xs text-text-muted">
                {group.pick_count} {group.pick_count === 1 ? "pick" : "picks"} ·{" "}
                <MoneyDisplay
                  value={group.subtotal}
                  size="xs"
                  weight="semibold"
                  className="text-inherit"
                />
                {standings[group.phase] && ` of $${standings[group.phase]!.entry}`}
              </span>
            </div>
            <Card className="gap-0 p-0">
              {group.entries.map((entry) => {
                const theoretical = entryPayout(entry)
                const refunded = entryRefund(entry)
                return (
                  <div
                    key={entry.pick_id}
                    className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 first:border-t-0"
                  >
                    <div className="min-w-0 flex-1">
                      {/* Same name + stroke-badge treatment as the menu
                          (#102). No profile link here — this page is your own
                          slate, not a directory of other people. */}
                      <PickLabel
                        label={entry.pick_label}
                        nameClassName="text-[15px] leading-snug font-semibold text-text-strong"
                      />
                      <div className="mt-0.5 text-xs text-text-muted">
                        {ROUND_LABEL[entry.round] ?? entry.round} ·{" "}
                        {entry.bet_title}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <div className="flex items-center gap-2.5">
                        <OddsChip odds={entry.odds_at_placement} size="sm" />
                        <MoneyDisplay
                          value={entry.amount}
                          size="sm"
                          weight="bold"
                        />
                      </div>
                      {/* Result line — only once the pick's result is
                          uploaded (ADR 0001 §6). Voids show the stake as
                          refunded, never as a payout. */}
                      {entry.result !== "pending" && (
                        <div className="flex items-center gap-2">
                          <OutcomeBadge outcome={entry.result} size="sm" />
                          {entry.result === "void" ? (
                            <span className="text-xs text-text-muted">
                              <MoneyDisplay
                                value={refunded}
                                size="xs"
                                weight="semibold"
                                className="text-inherit"
                              />{" "}
                              refunded
                            </span>
                          ) : (
                            <MoneyDisplay
                              value={theoretical ?? 0}
                              cents
                              size="sm"
                              weight="bold"
                              className={
                                entry.result === "hit"
                                  ? "text-money-up"
                                  : "text-text-body"
                              }
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </Card>
          </section>
        ))
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
      </div>

      {/* Reserved right rail — empty for now (matches dashboard's 2/3 split). */}
      <aside className="hidden lg:col-span-1 lg:block" aria-hidden />
    </div>
  )
}
