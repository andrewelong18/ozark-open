import { createClient } from "@/lib/supabase/server"
import { Card } from "@/components/ui/card"
import { StatusBadge, type BetStatus } from "@/components/betting/status-badge"
import { PickRow, type PickResult } from "@/components/betting/pick-row"
import { EmptyState } from "@/components/modules/empty-state"
import { formatProbability } from "@/lib/format"

type BetCategory = { name: string; slug: string }

type Pick = {
  id: string
  sheet_pick_id: number
  label: string
  american_odds: number
  fractional_odds: string
  probability: number
  result: string
}

type Bet = {
  id: string
  sheet_bet_id: number
  title: string
  phase: number
  round: string
  status: string
  total_probability: number | null
  bet_categories: BetCategory | null
  bet_picks: Pick[]
}

const ROUND_ORDER = ["tournament", "round_1", "round_2", "round_3"] as const
const ROUND_LABEL: Record<string, string> = {
  tournament: "Tournament",
  round_1: "Round 1",
  round_2: "Round 2",
  round_3: "Round 3",
}
const CATEGORY_ORDER = [
  "Top Finisher",
  "Top X Finisher",
  "Match",
  "Group Match",
  "Prop Bet",
]

type CategoryGroup = { name: string; bets: Bet[] }
type RoundGroup = { round: string; categories: CategoryGroup[] }
type PhaseGroup = { phase: number; rounds: RoundGroup[] }

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

const RESULTS: PickResult[] = ["pending", "hit", "miss", "push", "void"]

function toResult(result: string): PickResult {
  return (RESULTS as string[]).includes(result)
    ? (result as PickResult)
    : "pending"
}

export default async function BetsPage() {
  const supabase = await createClient()

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id")
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

  const { data: betsData } = await supabase
    .from("bets")
    .select(
      "id, sheet_bet_id, title, phase, round, status, total_probability, bet_categories ( name, slug ), bet_picks ( id, sheet_pick_id, label, american_odds, fractional_odds, probability, result )"
    )
    .eq("tournament_id", (tournament as { id: string }).id)
    .neq("status", "hidden")

  const bets: Bet[] = (betsData ?? []).map((bet) => ({
    ...bet,
    bet_categories: Array.isArray(bet.bet_categories)
      ? (bet.bet_categories[0] ?? null)
      : (bet.bet_categories as BetCategory | null),
    bet_picks: (bet.bet_picks ?? []) as Pick[],
  }))

  if (bets.length === 0) return emptyState

  const phases = groupBets(bets)

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h1 className="font-heading text-3xl text-text-strong">Bet Menu</h1>
        <StatusBadge status={menuStatus(bets)} />
      </div>

      <div className="mt-3 flex flex-col gap-8">
        {phases.map(({ phase, rounds }) => (
          <section key={phase} className="flex flex-col gap-5">
            <h2 className="font-heading text-2xl text-indigo-700">
              Phase {phase}
            </h2>
            {rounds.map(({ round, categories }) => (
              <div key={round} className="flex flex-col gap-4">
                <h3 className="font-heading text-lg text-text-strong">
                  {ROUND_LABEL[round] ?? round}
                </h3>
                {categories.map(({ name, bets }) => (
                  <div key={name} className="flex flex-col gap-3">
                    <div className="text-[11px] font-bold tracking-wider text-text-muted uppercase">
                      {name}
                    </div>
                    {bets.map((bet) => (
                      <Card key={bet.id} className="gap-0 p-0">
                        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-base leading-snug font-semibold text-pretty text-text-strong">
                              {bet.title}
                            </div>
                            {bet.total_probability != null && (
                              <div className="tabular mt-0.5 text-[11px] text-text-muted">
                                Total probability{" "}
                                {formatProbability(Number(bet.total_probability))}
                              </div>
                            )}
                          </div>
                          {bet.status !== "open" && (
                            <StatusBadge status="closed" />
                          )}
                        </div>
                        {bet.bet_picks
                          .sort((a, b) => a.sheet_pick_id - b.sheet_pick_id)
                          .map((pick) => (
                            <PickRow
                              key={pick.id}
                              label={pick.label}
                              americanOdds={pick.american_odds}
                              fractionalOdds={pick.fractional_odds}
                              probability={formatProbability(
                                Number(pick.probability)
                              )}
                              result={toResult(pick.result)}
                            />
                          ))}
                      </Card>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
