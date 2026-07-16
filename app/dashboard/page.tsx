import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { StatCard } from "@/components/modules/stat-card"
import { BudgetModule } from "@/components/modules/budget-module"
import { RulesCard } from "@/components/modules/rules-card"
import { EmptyState } from "@/components/modules/empty-state"
import Link from "next/link"

type Tournament = {
  id: string
  name: string
  year: number
  status: "upcoming" | "active" | "completed"
  min_bets_per_round: number
  max_bets_per_round: number
  max_single_bet_pct: number
  max_single_bet_cap: number
  max_self_bet_pct: number
  max_self_bet_cap: number
}

type Participant = { entry_fee: number; is_player: boolean }

function capped(entryFee: number, pct: number, cap: number): number {
  return Math.min(Math.round(entryFee * pct), cap)
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: tournamentData } = await supabase
    .from("tournaments")
    .select(
      "id, name, year, status, min_bets_per_round, max_bets_per_round, max_single_bet_pct, max_single_bet_cap, max_self_bet_pct, max_self_bet_cap"
    )
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

  const tournament = tournamentData as Tournament

  // Pool total + player count from real registrations.
  const { data: poolData } = await supabase
    .from("tournament_participants")
    .select("entry_fee")
    .eq("tournament_id", tournament.id)

  const poolRows = (poolData as { entry_fee: number }[] | null) ?? []
  const poolTotal = poolRows.reduce((sum, r) => sum + r.entry_fee, 0)
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

  // This user's actual wagers on this tournament's bets.
  const { data: placementData } = user
    ? await supabase
        .from("bet_placements")
        .select("amount, bets!inner(tournament_id)")
        .eq("user_id", user.id)
        .eq("bets.tournament_id", tournament.id)
    : { data: null }

  const placements = (placementData as { amount: number }[] | null) ?? []
  const wagered = placements.reduce((sum, p) => sum + p.amount, 0)
  const betCount = placements.length

  const statusOpen = tournament.status === "active"

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
          value={participant?.entry_fee ?? 0}
          money
          caption={participant ? undefined : "Not registered"}
        />
        <StatCard label="Bets Placed" value={betCount} caption="This tournament" />
      </div>

      {participant ? (
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
                wagered={wagered}
                entryFee={participant.entry_fee}
                betCount={betCount}
                minBets={tournament.min_bets_per_round}
                maxBets={tournament.max_bets_per_round}
              />
            </CardContent>
          </Card>

          <RulesCard
            entryFee={participant.entry_fee}
            maxSingle={capped(
              participant.entry_fee,
              tournament.max_single_bet_pct,
              tournament.max_single_bet_cap
            )}
            maxSelf={capped(
              participant.entry_fee,
              tournament.max_self_bet_pct,
              tournament.max_self_bet_cap
            )}
            minBets={tournament.min_bets_per_round}
            maxBets={tournament.max_bets_per_round}
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
