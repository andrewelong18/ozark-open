import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { StatCard } from "@/components/modules/stat-card"
import { BudgetModule } from "@/components/modules/budget-module"
import { RulesCard } from "@/components/modules/rules-card"
import { EmptyState } from "@/components/modules/empty-state"
import Link from "next/link"
import {
  checkPhaseMinimums,
  checkTournamentTotal,
} from "@/lib/validation"
import {
  normalizeExistingPlacements,
  toTournamentRules,
  TOURNAMENT_RULE_COLUMNS,
  type PlacementQueryRow,
} from "@/lib/placements"
import { buildRulesModel, picksLine } from "@/lib/my-bets"

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

  const { data: tournamentData } = await supabase
    .from("tournaments")
    .select(`id, name, year, status, ${TOURNAMENT_RULE_COLUMNS}`)
    .in("status", ["upcoming", "active"])
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle()

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
  const { data: poolData } = await supabase
    .from("tournament_participants")
    .select("entry_fee")
    .eq("tournament_id", tournament.id)

  const poolRows = (poolData as { entry_fee: number }[] | null) ?? []
  const poolTotal = poolRows.reduce((sum, r) => sum + Number(r.entry_fee), 0)
  const playerCount = poolRows.length

  // This user's registration.
  const { data: participantData } = user
    ? await supabase
        .from("tournament_participants")
        .select("entry_fee, is_player")
        .eq("user_id", user.id)
        .eq("tournament_id", tournament.id)
        .maybeSingle()
    : { data: null }

  const participant = participantData as Participant | null

  // This user's live wagers, joined through picks (placements reference
  // bet_picks, not bets — ADR 0001) and scoped in normalization.
  const { data: placementData } = user
    ? await supabase
        .from("bet_placements")
        .select(
          "pick_id, amount, bet_picks ( player_user_id, bets ( id, phase, tournament_id ) )"
        )
        .eq("user_id", user.id)
        .is("deleted_at", null)
    : { data: null }

  const existing = normalizeExistingPlacements(
    (placementData ?? []) as unknown as PlacementQueryRow[],
    tournament.id
  )
  const totals = checkTournamentTotal(
    existing,
    Number(participant?.entry_fee ?? 0)
  )
  const balanced =
    totals.exact &&
    checkPhaseMinimums(existing, rules).every((p) => p.meets_minimum)
  const betCount = existing.length

  const statusOpen = tournament.status === "active"
  const myRules = participant ? buildRulesModel(participant, rules) : null

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-6">
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
        <Badge variant={statusOpen ? "green" : "neutral"} uppercase>
          {statusOpen ? "Betting Open" : "Upcoming"}
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
          caption={participant ? undefined : "Not registered"}
        />
        <StatCard label="Bets Placed" value={betCount} caption="This tournament" />
      </div>

      {participant && myRules ? (
        <>
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
                entryFee={myRules.entry_fee}
                picksLine={picksLine(existing)}
                balanced={balanced}
              />
            </CardContent>
          </Card>

          <RulesCard
            entryFee={myRules.entry_fee}
            maxSingle={myRules.max_single_bet}
            maxSelf={myRules.max_self_bet}
            minBets={myRules.min_picks_per_phase}
            maxBets={myRules.max_picks_per_phase}
          />
        </>
      ) : (
        <EmptyState
          glyph="🏌️"
          title="You're not registered"
          message="Contact an admin to be added to this tournament's pool."
        />
      )}
    </div>
  )
}
