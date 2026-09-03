import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatCard } from "@/components/modules/stat-card"
import { BudgetModule } from "@/components/modules/budget-module"
import { EmptyState } from "@/components/modules/empty-state"
import { LoadError } from "@/components/modules/load-error"
import { MoneyDisplay } from "@/components/betting/money-display"
import { OddsChip } from "@/components/betting/odds-chip"
import { checkPickMinimum, checkTournamentTotal } from "@/lib/validation"
import { toTournamentRules, TOURNAMENT_RULE_COLUMNS } from "@/lib/placements"
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
  picksLine,
  type MyBetsQueryRow,
} from "@/lib/my-bets"

// My Bets (Sprint 5): the participant's live placements grouped by phase,
// with running total and remaining budget. The page is glue — grouping and
// join normalization live in lib/my-bets.ts. Each row shows the wager's
// odds_at_placement snapshot, never the pick's live odds (those are the bet
// menu's job, sheet-verbatim).

const ROUND_LABEL: Record<string, string> = {
  tournament: "Tournament",
  round_1: "Round 1",
  round_2: "Round 2",
  round_3: "Round 3",
}

type Participant = { entry_fee: number; is_player: boolean }

export default async function MyBetsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: tournamentData, error: tournamentError } = await supabase
    .from("tournaments")
    .select(`id, name, ${TOURNAMENT_RULE_COLUMNS}`)
    .in("status", ["upcoming", "active"])
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

  const { data: participantData, error: participantError } = user
    ? await supabase
        .from("tournament_participants")
        .select("entry_fee, is_player")
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
  const participant = participantData as Participant | null

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
  const entryFee = Number(participant.entry_fee)

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
  const totals = checkTournamentTotal(entries, entryFee)
  const myRules = buildRulesModel(participant, rules)
  // The zero-placement item is skipped HERE and only here: the page renders its
  // own "No bets placed yet" empty state a few lines down, and the banner would
  // be that same sentence twice in a row. The empty state carries the
  // requirement instead.
  const compliance =
    entries.length === 0
      ? []
      : buildComplianceSummary(entries, entryFee, rules)
  // §8.1 balanced: the exact total AND the pick minimum, same pair the
  // dashboard used to compute for this bar.
  const balanced = totals.exact && checkPickMinimum(entries, rules).meets_minimum

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

      {/* The budget bar, moved here from the dashboard. It replaces the Total
          Wagered and Remaining Budget stat cards, which said the same two
          numbers with no sense of how close together they were — and said them
          a page away from the wagers that produced them. One bar carries both,
          plus the per-phase pick counts and the balanced state. */}
      <Card>
        <CardContent className="flex flex-col gap-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="font-heading text-lg text-text-strong">
              Your Budget
            </div>
            <Button variant="gold" size="sm" render={<Link href="/bets" />}>
              Place Bets →
            </Button>
          </div>
          <BudgetModule
            wagered={totals.total}
            entryFee={entryFee}
            picksLine={picksLine(entries)}
            balanced={balanced}
          />
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
        <ComplianceBanner key={item.title} tone={item.tone} title={item.title}>
          {item.message}
        </ComplianceBanner>
      ))}

      {entries.length === 0 ? (
        <EmptyState
          title="No bets placed yet"
          message={`Your $${entryFee} entry is waiting on the bet menu — at least ${rules.min_picks_per_tournament} picks totalling exactly $${entryFee} by the Phase 2 deadline.`}
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
                {/* Per-phase header shows the per-phase limit only — the
                    minimum spans both phases and lives on the banner (#96). */}
                {group.pick_count} of {rules.max_picks_per_phase} picks ·{" "}
                <MoneyDisplay
                  value={group.subtotal}
                  size="xs"
                  weight="semibold"
                  className="text-inherit"
                />
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
        entryFee={myRules.entry_fee}
        maxSingle={myRules.max_single_bet}
        maxSelf={myRules.max_self_bet}
        minBets={myRules.min_picks_per_tournament}
        maxBets={myRules.max_picks_per_phase}
      />
      </div>

      {/* Reserved right rail — empty for now (matches dashboard's 2/3 split). */}
      <aside className="hidden lg:col-span-1 lg:block" aria-hidden />
    </div>
  )
}
