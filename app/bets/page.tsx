import Link from "next/link"
import { notFound } from "next/navigation"
import { cn } from "@/lib/utils"
import { requireAdminPage } from "@/lib/admin-gate"
import { createClient } from "@/lib/supabase/server"
import { StatusBadge, type BetStatus } from "@/components/betting/status-badge"
import { BetSlipSummary } from "@/components/betting/bet-slip-summary"
import { EmptyState } from "@/components/modules/empty-state"
import { LoadError } from "@/components/modules/load-error"
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
import {
  toPhaseClock,
  toTournamentRules,
  TOURNAMENT_CLOCK_COLUMNS,
  TOURNAMENT_RULE_COLUMNS,
} from "@/lib/placements"
import { phaseClosedByClock, wageringOpen } from "@/lib/phases"
import { sortPicks } from "@/lib/pick-order"
import {
  buildComplianceSummary,
  normalizeMyBets,
  type ComplianceItem,
  type MyBetsQueryRow,
} from "@/lib/my-bets"

// Raw pick shape from the bets query: the display Pick plus the embedded
// player row (supabase serializes a to-one join as object OR 1-el array),
// which we flatten to `player_avatar_url` before handing picks to the menu.
type PickQueryRow = Omit<Pick, "player_avatar_url"> & {
  users: { avatar_url: string | null } | { avatar_url: string | null }[] | null
}

const ROUND_ORDER = ["tournament", "round_1", "round_2", "round_3"] as const
const CATEGORY_ORDER = [
  "Top Finisher",
  "Top X Finisher",
  "Match",
  "Group Match",
  "Prop Bet",
]

// The sheet arrives unsorted; the menu orders phase → round → category
// (ADR 0001 §7), bets by their stable sheet IDs, and picks favourites-first
// (#105 — the query has no ORDER BY, so without sortPicks the order is
// whatever Postgres returns and an upsert can reshuffle it).
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
              bets: bets
                .sort((a, b) => a.sheet_bet_id - b.sheet_bet_id)
                .map((bet) => ({ ...bet, bet_picks: sortPicks(bet.bet_picks) })),
            })),
        })),
    }))
}

// Menu-wide glance: open while anything is still open, closed otherwise.
// (Hidden bets never reach the page; "resolved" lives per pick now.)
function menuStatus(bets: Bet[]): BetStatus {
  return bets.some((b) => b.status === "open") ? "open" : "closed"
}

/**
 * `/bets?for=<userId>` — an admin entering wagers for a member (Sprint 23 /
 * #101). Resolve the member, or return null when there's no `for` at all.
 *
 * requireAdminPage() rather than a soft check: a non-admin who guesses the URL
 * gets a 404, not a silent render of their OWN menu, which would look like it
 * worked and would be the most misleading possible outcome.
 */
async function resolveOnBehalf(
  forParam: string | undefined
): Promise<{ userId: string; name: string } | null> {
  if (!forParam) return null
  const { supabase } = await requireAdminPage()
  const { data, error } = await supabase
    .from("users")
    .select("id, display_name")
    .eq("id", forParam)
    .maybeSingle()
  // A failed lookup must not 404 as "no such member" (#132) — an admin would
  // read that as "I typed the wrong id" and go hunting for a user who exists.
  if (error) {
    throw new Error(`Couldn't look up that member: ${error.message}`)
  }
  const member = data as { id: string; display_name: string } | null
  if (!member) notFound()
  return { userId: member.id, name: member.display_name }
}

export default async function BetsPage({
  searchParams,
}: {
  searchParams: Promise<{ for?: string }>
}) {
  const supabase = await createClient()
  const onBehalfOf = await resolveOnBehalf((await searchParams).for)
  // Every wagering read below is about the BETTOR. In on-behalf mode that's
  // the member, so the budget, the locked odds and the bet slip all describe
  // them — the admin sees the menu as they would see it.
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser()
  const bettorId = onBehalfOf?.userId ?? viewer?.id ?? null

  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select(`id, ${TOURNAMENT_RULE_COLUMNS}, ${TOURNAMENT_CLOCK_COLUMNS}`)
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

  const loadErrorState = (subject: string) => (
    <div className="mx-auto max-w-xl px-4 py-10">
      <LoadError subject={subject} />
    </div>
  )

  if (tournamentError) {
    console.error("[bets] tournament read failed:", tournamentError.message)
    return loadErrorState("the betting menu")
  }
  if (!tournament) return emptyState
  const tournamentId = (tournament as { id: string }).id
  // One `now` for the render, so two bets in the same phase can't disagree
  // about whether the deadline has passed (Sprint 25 / #106).
  const clock = toPhaseClock(tournament as unknown as Record<string, unknown>)
  const now = new Date()

  const { data: betsData, error: betsError } = await supabase
    .from("bets")
    .select(
      "id, sheet_bet_id, title, phase, round, status, total_probability, bet_categories ( name, slug, allows_multiple_picks ), bet_picks ( id, sheet_pick_id, label, american_odds, fractional_odds, probability, result, player_user_id, users ( avatar_url ) )"
    )
    .eq("tournament_id", tournamentId)
    .neq("status", "hidden")
  if (betsError) {
    console.error("[bets] menu read failed:", betsError.message)
    return loadErrorState("the betting menu")
  }

  // Wagering context: only participants get the inline stake inputs, and
  // their live placements pre-fill them (amount + the locked-odds receipt).
  // Everything below is UX — the placements API re-validates every write
  // server-side, against the bettor.
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
  if (bettorId) {
    const { data: participant, error: participantError } = await supabase
      .from("tournament_participants")
      .select("entry_fee, is_player")
      .eq("user_id", bettorId)
      .eq("tournament_id", tournamentId)
      .is("revoked_at", null)
      .maybeSingle()
    // Failing here would silently hide the stake inputs and show the "waiting
    // for approval" note to an approved bettor — a wrong statement about their
    // standing, not a missing feature (#132).
    if (participantError) {
      console.error("[bets] participant read failed:", participantError.message)
      return loadErrorState("your betting status")
    }
    isParticipant = participant !== null
    if (participant) {
      const entryFee = Number((participant as { entry_fee: number }).entry_fee)
      const rules = toTournamentRules(
        tournament as unknown as Record<string, unknown>
      )
      // Same query shape as /my-bets, so normalizeMyBets → the §8.1 checks run
      // verbatim and the summary numbers can't drift from that page.
      const { data: placementRows, error: placementRowsError } = await supabase
        .from("bet_placements")
        .select(
          "pick_id, amount, odds_at_placement, bet_picks ( label, sheet_pick_id, player_user_id, result, bets ( id, title, phase, round, status, sheet_bet_id, tournament_id ) )"
        )
        .eq("user_id", bettorId)
        .is("deleted_at", null)
      // Their own money. An empty read here would show a full budget and no
      // existing stakes — an invitation to re-bet what they've already bet.
      if (placementRowsError) {
        console.error("[bets] placements read failed:", placementRowsError.message)
        return loadErrorState("your wagers")
      }
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
        items: buildComplianceSummary(entries, entryFee, rules, {
          wageringOver: phaseClosedByClock(2, clock, now),
        }),
      }
    }
  }

  const bets: Bet[] = (betsData ?? []).map((bet) => ({
    ...bet,
    // The deadline closes wagering; only the admin's upload closes the bet
    // and reveals everyone's picks. Keeping these separate means the stake
    // inputs vanish at 11:00 without the reveal firing early — which RLS
    // would refuse anyway, leaving an empty panel that looked broken.
    wagering_open: wageringOpen(
      { phase: bet.phase, status: bet.status },
      clock,
      now
    ),
    bet_categories: Array.isArray(bet.bet_categories)
      ? (bet.bet_categories[0] ?? null)
      : (bet.bet_categories as BetCategory | null),
    // Flatten each pick's embedded player row (object or 1-el array) into a
    // scalar avatar url — powers the golfer-name → profile link on the menu.
    bet_picks: ((bet.bet_picks ?? []) as PickQueryRow[]).map((pick) => {
      const player = Array.isArray(pick.users)
        ? (pick.users[0] ?? null)
        : pick.users
      const { users: _users, ...rest } = pick
      void _users
      return { ...rest, player_avatar_url: player?.avatar_url ?? null }
    }) as Pick[],
  }))

  if (bets.length === 0) return emptyState

  // Everyone's placements on closed bets — RLS opens these rows to all
  // authenticated users the moment a bet closes. One query for every
  // closed pick on the page; soft-deleted wagers stay hidden.
  const closedPickIds = bets
    .filter((bet) => bet.status === "closed")
    .flatMap((bet) => bet.bet_picks.map((pick) => pick.id))
  let placementsByPick: Record<string, PickPlacements> = {}
  let revealUnavailable = false
  if (closedPickIds.length > 0) {
    const { data: closedRows, error: closedRowsError } = await supabase
      .from("bet_placements")
      // `users!bet_placements_user_id_fkey`, not a bare `users`: since Sprint 23
      // added placed_by_user_id there are TWO foreign keys from this table to
      // users, so an unqualified embed is ambiguous and PostgREST rejects the
      // whole request with PGRST201. The error was never checked, so `data`
      // came back null and every closed bet quietly rendered "No wagers on this
      // bet" — the reveal, gone, with nothing in the UI to say so.
      .select(
        "pick_id, user_id, amount, users!bet_placements_user_id_fkey ( display_name, nickname, avatar_url )"
      )
      .in("pick_id", closedPickIds)
      .is("deleted_at", null)
    // THE regression this issue is named for. The rest of the menu is still
    // worth rendering, so this degrades rather than replacing the page — but
    // the flag makes each closed bet say "couldn't load" instead of the
    // "No wagers on this bet" that hid the outage for two sprints (#132).
    if (closedRowsError) {
      console.error("[bets] closed-bet reveal read failed:", closedRowsError.message)
      revealUnavailable = true
    }
    placementsByPick = groupPlacementsByPick(
      normalizeClosedPlacements(
        (closedRows ?? []) as ClosedPlacementQueryRow[]
      )
    )
  }

  const phases = groupBets(bets)

  return (
    <div
      className={cn(
        "mx-auto grid max-w-[var(--container-max,1120px)] grid-cols-1 gap-4 px-4 py-6 lg:grid-cols-3 lg:gap-6",
        // Clear the fixed review bar so it never covers the last content.
        // 7rem is the old pb-28; the inset is what a phone's home indicator
        // adds to the bar's own bottom padding now that it resolves to a real
        // number (app/layout.tsx sets viewportFit: "cover").
        slip && "pb-[calc(7rem+env(safe-area-inset-bottom))]"
      )}
    >
      {/* data-enter-stagger goes on the INNER column, never the outer grid:
          BetSlipSummary is a direct child of the grid and is position:
          fixed, and a transform-animated ancestor would become its
          containing block and peel it off the viewport. */}
      <div data-enter-stagger className="lg:col-span-2">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h1 className="font-heading text-3xl text-text-strong">Bet Menu</h1>
        <StatusBadge status={menuStatus(bets)} />
      </div>

      {/* On-behalf mode is loud on purpose. Everything below — the budget, the
          pre-filled stakes, the limits in the §7 messages — belongs to the
          member, and an admin who forgets whose menu they're looking at is
          exactly how the wrong person ends up with a wager. */}
      {onBehalfOf && (
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-caution-border bg-caution-surface px-4 py-3 text-sm text-caution-strong">
          <span className="font-semibold">
            Placing wagers as {onBehalfOf.name}.
          </span>
          <span>
            Their entry fee and their limits apply, and the wager is recorded as
            entered by you.
          </span>
          <Link href="/bets" className="underline underline-offset-2">
            Back to your own menu
          </Link>
        </div>
      )}

      {onBehalfOf && !isParticipant && (
        <p className="mb-4 rounded-lg border border-loss-border bg-loss-surface px-4 py-3 text-sm text-loss-strong">
          {onBehalfOf.name} isn&apos;t an approved bettor for this tournament,
          so there&apos;s nothing to place. Approve them on{" "}
          <Link href="/admin/people" className="underline underline-offset-2">
            the people console
          </Link>{" "}
          first.
        </p>
      )}

      {!onBehalfOf && viewer && !isParticipant && (
        <p className="mb-4 rounded-lg border border-border bg-surface-sunken px-4 py-3 text-sm text-text-muted">
          You&apos;re registered — an admin just needs to approve you before you
          can place bets. Browse the full menu in the meantime.
        </p>
      )}

      <div className="mt-3">
        <BetsMenu
          phases={phases}
          isParticipant={isParticipant}
          placements={placements}
          lockedOdds={lockedOdds}
          placementsByPick={placementsByPick}
          revealUnavailable={revealUnavailable}
          onBehalfOf={onBehalfOf}
        />
      </div>
      </div>

      {/* Reserved right rail — empty for now (matches dashboard's 2/3 split). */}
      <aside className="hidden lg:col-span-1 lg:block" aria-hidden />

      {/* Fixed review bar — pinned to the viewport bottom, outside the grid flow
          so it doesn't reserve a row. */}
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
