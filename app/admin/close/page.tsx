import { notFound } from "next/navigation"
import { requireAdminPage } from "@/lib/admin-gate"
import { CloseConsole } from "@/components/admin/close-console"
import { buildChaseList, closingPhase, type ChaseParticipant } from "@/lib/chase"
import {
  toPhaseClock,
  toTournamentRules,
  TOURNAMENT_CLOCK_COLUMNS,
  TOURNAMENT_RULE_COLUMNS,
} from "@/lib/placements"
import type { ExistingPlacement } from "@/lib/validation"

// /admin/close (Sprint 25 / #108) — the two most time-critical moments of the
// tournament, which both used to require database access:
//
//   Thursday 10:55am — who hasn't finished betting, and close Phase 1
//   Saturday night   — publish the final results
//
// The chase list is docs/admin/phase-compliance.sql as a page. That SQL file
// stays: it's the fallback for when the app itself is what's broken, and it's
// what a second admin can run without deploy access.
//
// Non-admins get a 404, same pattern as /admin/import — a 403 would confirm
// the page exists.

export default async function AdminClosePage() {
  const { supabase } = await requireAdminPage()

  const { data: tournamentData } = await supabase
    .from("tournaments")
    .select(
      `id, name, status, ${TOURNAMENT_RULE_COLUMNS}, ${TOURNAMENT_CLOCK_COLUMNS}`
    )
    .in("status", ["upcoming", "active", "completed"])
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!tournamentData) notFound()

  const tournamentRow = tournamentData as unknown as Record<string, unknown>
  const tournament = tournamentData as unknown as {
    id: string
    name: string
    status: string
  }
  const rules = toTournamentRules(tournamentRow)
  const clock = toPhaseClock(tournamentRow)

  // Bets tell us which close this is, and how much is left unsettled.
  const { data: betsData } = await supabase
    .from("bets")
    .select("id, phase, status")
    .eq("tournament_id", tournament.id)
  const bets = (betsData ?? []) as { id: string; phase: number; status: string }[]

  const { count: pendingPicks } = await supabase
    .from("bet_picks")
    .select("id, bets!inner(tournament_id)", { count: "exact", head: true })
    .eq("result", "pending")
    .eq("bets.tournament_id", tournament.id)

  const unclosedBets = bets.filter((b) => b.status !== "closed").length

  // Live participants and their live placements — the same two filters the
  // pool arithmetic uses, so the chase list can't disagree with the payouts
  // about who is even in (Sprint 21 / #91).
  const { data: participantData } = await supabase
    .from("tournament_participants")
    .select("user_id, entry_fee, users ( display_name )")
    .eq("tournament_id", tournament.id)
    .is("revoked_at", null)

  type UserJoin = { display_name: string }
  const participants: ChaseParticipant[] = (
    (participantData ?? []) as {
      user_id: string
      entry_fee: number
      users: UserJoin | UserJoin[] | null
    }[]
  ).map((p) => {
    const joined = Array.isArray(p.users) ? p.users[0] : p.users
    return {
      user_id: p.user_id,
      display_name: joined?.display_name ?? "Unknown bettor",
      entry_fee: Number(p.entry_fee),
    }
  })

  const { data: placementData } = await supabase
    .from("bet_placements")
    .select("user_id, pick_id, amount, bet_picks ( bet_id, bets ( phase, tournament_id ) )")
    .is("deleted_at", null)

  type BetJoin = { phase: number; tournament_id: string }
  type PickJoin = { bet_id: string; bets: BetJoin | BetJoin[] | null }
  const byUser = new Map<string, ExistingPlacement[]>()
  for (const row of (placementData ?? []) as {
    user_id: string
    pick_id: string
    amount: number
    bet_picks: PickJoin | PickJoin[] | null
  }[]) {
    const pick = Array.isArray(row.bet_picks) ? row.bet_picks[0] : row.bet_picks
    const bet = pick ? (Array.isArray(pick.bets) ? pick.bets[0] : pick.bets) : null
    if (!bet || bet.tournament_id !== tournament.id) continue
    if (bet.phase !== 1 && bet.phase !== 2) continue
    const list = byUser.get(row.user_id) ?? []
    list.push({
      pick_id: row.pick_id,
      bet_id: pick!.bet_id,
      phase: bet.phase,
      amount: Number(row.amount),
      pick_player_user_id: null,
    })
    byUser.set(row.user_id, list)
  }

  const chase = buildChaseList(
    participants,
    byUser,
    rules,
    closingPhase(bets)
  )

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <div>
        <h1 className="font-heading text-3xl leading-tight text-text-strong">
          Close &amp; settle
        </h1>
        <p className="mt-0.5 text-sm text-text-muted">
          {tournament.name} · chase, close a phase, publish the results
        </p>
      </div>

      <CloseConsole
        chase={chase}
        clock={clock}
        finalized={tournament.status === "completed"}
        pendingPicks={pendingPicks ?? 0}
        unclosedBets={unclosedBets}
      />
    </div>
  )
}
