import { createClient } from "@/lib/supabase/server"
import { StatusBadge, type BetStatus } from "@/components/betting/status-badge"
import { BetSlipSummary } from "@/components/betting/bet-slip-summary"
import { EmptyState } from "@/components/modules/empty-state"
import {
  BetsMenu,
  type Bet,
  type BetCategory,
  type Pick,
  type PhaseGroup,
} from "@/components/betting/bets-menu"
import {
  groupPlacementsByPick,
  normalizeClosedPlacements,
  type ClosedPlacementQueryRow,
  type PickPlacements,
} from "@/lib/closed-bets"
import { checkTournamentTotal } from "@/lib/validation"
import { toTournamentRules, TOURNAMENT_RULE_COLUMNS } from "@/lib/placements"
import {
  buildComplianceSummary,
  normalizeMyBets,
  type ComplianceItem,
  type MyBetsQueryRow,
} from "@/lib/my-bets"

const ROUND_ORDER = ["tournament", "round_1", "round_2", "round_3"] as const
const CATEGORY_ORDER = [
  "Top Finisher",
  "Top X Finisher",
  "Match",
  "Group Match",
  "Prop Bet",
]

// The sheet arrives unsorted; the menu orders phase → round → category
// (ADR 0001 §7), bets and picks by their stable sheet IDs.
function groupBets(bets: Bet[]): PhaseGroup[] {
  const phases = new Map<number, Map<string, Map<string, Bet[]>>>()
  for (const bet of bets) {
    const catName = bet.bet_categories?.name ?? "Uncategorized"
    if (!phases.has(bet.phase)) phases.set(bet.phase, new Map())
    const rounds = phases.get(bet.phase)!
    if (!rounds.has(bet.round)) rounds.set(bet.round, new Map())
    const cats = rounds.get(bet.round)!
    if (!cats.has(catName)) cats.set(catName, [])
    cats.get(catName)!.push(bet)
  }

  const roundRank = (r: string) => {
    const i = (ROUND_ORDER as readonly string[]).indexOf(r)
    return i === -1 ? ROUND_ORDER.length : i
  }
  const catRank = (c: string) => {
    const i = CATEGORY_ORDER.indexOf(c)
    return i === -1 ? CATEGORY_ORDER.length : i
  }

  return Array.from(phases.entries())
    .sort(([a], [b]) => a - b)
    .map(([phase, rounds]) => ({
      phase,
      rounds: Array.from(rounds.entries())
        .sort(([a], [b]) => roundRank(a) - roundRank(b))
        .map(([round, cats]) => ({
          round,
          categories: Array.from(cats.entries())
            .sort(([a], [b]) => catRank(a) - catRank(b))
            .map(([name, bets]) => ({
              name,
              bets: bets.sort((a, b) => a.sheet_bet_id - b.sheet_bet_id),
            })),
        })),
    }))
}

// Menu-wide glance: open while anything is still open, closed otherwise.
// (Hidden bets never reach the page; "resolved" lives per pick now.)
function menuStatus(bets: Bet[]): BetStatus {
  return bets.some((b) => b.status === "open") ? "open" : "closed"
}

export default async function BetsPage() {
  const supabase = await createClient()

  const { data: tournament } = await supabase
    .from("tournaments")
    .select(`id, ${TOURNAMENT_RULE_COLUMNS}`)
    .in("status", ["upcoming", "active"])
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle()

  const emptyState = (
    <div className="mx-auto max-w-xl px-4 py-10">
      <EmptyState
        title="No bets published yet"
        message="The book opens when an admin publishes the menu. Check back soon."
      />
    </div>
  )

  if (!tournament) return emptyState
  const tournamentId = (tournament as { id: string }).id

  const { data: betsData } = await supabase
    .from("bets")
    .select(
      "id, sheet_bet_id, title, phase, round, status, total_probability, bet_categories ( name, slug, allows_multiple_picks ), bet_picks ( id, sheet_pick_id, label, american_odds, fractional_odds, probability, result )"
    )
    .eq("tournament_id", tournamentId)
    .neq("status", "hidden")

  // Wagering context: only participants get the inline stake inputs, and
  // their live placements pre-fill them (amount + the locked-odds receipt).
  // Everything below is UX — the placements API re-validates every write
  // server-side.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  let isParticipant = false
  let placements: Record<string, number> = {}
  let lockedOdds: Record<string, number> = {}
  let slip: {
    entryFee: number
    totalWagered: number
    remaining: number
    pickCount: number
    items: ComplianceItem[]
  } | null = null
  if (user) {
    const { data: participant } = await supabase
      .from("tournament_participants")
      .select("entry_fee, is_player")
      .eq("user_id", user.id)
      .eq("tournament_id", tournamentId)
      .maybeSingle()
    isParticipant = participant !== null
    if (participant) {
      const entryFee = Number((participant as { entry_fee: number }).entry_fee)
      const rules = toTournamentRules(
        tournament as unknown as Record<string, unknown>
      )
      // Same query shape as /my-bets, so normalizeMyBets → the §8.1 checks run
      // verbatim and the summary numbers can't drift from that page.
      const { data: placementRows } = await supabase
        .from("bet_placements")
        .select(
          "pick_id, amount, odds_at_placement, bet_picks ( label, sheet_pick_id, player_user_id, result, bets ( id, title, phase, round, status, sheet_bet_id, tournament_id ) )"
        )
        .eq("user_id", user.id)
        .is("deleted_at", null)
      const entries = normalizeMyBets(
        (placementRows ?? []) as unknown as MyBetsQueryRow[],
        tournamentId
      )
      placements = Object.fromEntries(entries.map((e) => [e.pick_id, e.amount]))
      lockedOdds = Object.fromEntries(
        entries.map((e) => [e.pick_id, e.odds_at_placement])
      )
      const totals = checkTournamentTotal(entries, entryFee)
      slip = {
        entryFee,
        totalWagered: totals.total,
        remaining: totals.remaining,
        pickCount: entries.length,
        items: buildComplianceSummary(entries, entryFee, rules),
      }
    }
  }

  const bets: Bet[] = (betsData ?? []).map((bet) => ({
    ...bet,
    bet_categories: Array.isArray(bet.bet_categories)
      ? (bet.bet_categories[0] ?? null)
      : (bet.bet_categories as BetCategory | null),
    bet_picks: (bet.bet_picks ?? []) as Pick[],
  }))

  if (bets.length === 0) return emptyState

  // Everyone's placements on closed bets — RLS opens these rows to all
  // authenticated users the moment a bet closes. One query for every
  // closed pick on the page; soft-deleted wagers stay hidden.
  const closedPickIds = bets
    .filter((bet) => bet.status === "closed")
    .flatMap((bet) => bet.bet_picks.map((pick) => pick.id))
  let placementsByPick: Record<string, PickPlacements> = {}
  if (closedPickIds.length > 0) {
    const { data: closedRows } = await supabase
      .from("bet_placements")
      .select("pick_id, user_id, amount, users ( display_name, nickname, avatar_url )")
      .in("pick_id", closedPickIds)
      .is("deleted_at", null)
    placementsByPick = groupPlacementsByPick(
      normalizeClosedPlacements(
        (closedRows ?? []) as ClosedPlacementQueryRow[]
      )
    )
  }

  const phases = groupBets(bets)

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h1 className="font-heading text-3xl text-text-strong">Bet Menu</h1>
        <StatusBadge status={menuStatus(bets)} />
      </div>

      {user && !isParticipant && (
        <p className="mb-4 rounded-lg border border-border bg-surface-sunken px-4 py-3 text-sm text-text-muted">
          You&apos;re browsing the menu — betting is for registered
          participants. Ask an admin to add you to the pool.
        </p>
      )}

      <div className="mt-3">
        <BetsMenu
          phases={phases}
          isParticipant={isParticipant}
          placements={placements}
          lockedOdds={lockedOdds}
          placementsByPick={placementsByPick}
        />
      </div>

      {slip && (
        <BetSlipSummary
          entryFee={slip.entryFee}
          totalWagered={slip.totalWagered}
          remaining={slip.remaining}
          pickCount={slip.pickCount}
          items={slip.items}
        />
      )}
    </div>
  )
}
