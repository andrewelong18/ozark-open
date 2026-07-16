import { createClient } from "@/lib/supabase/server"
import { Card } from "@/components/ui/card"
import { StatusBadge, type BetStatus } from "@/components/betting/status-badge"
import { BetRow } from "@/components/betting/bet-row"
import { type Outcome } from "@/components/betting/outcome-badge"
import { EmptyState } from "@/components/modules/empty-state"

type BetCategory = { name: string }

type Bet = {
  id: string
  bet_number: number
  description: string
  american_odds: number
  round_number: number
  status: string
  outcome: string | null
  bet_categories: BetCategory | null
}

type CategoryGroup = { name: string; bets: Bet[] }
type RoundGroup = { round: number; categories: CategoryGroup[] }

function groupBets(bets: Bet[]): RoundGroup[] {
  const rounds = new Map<number, Map<string, Bet[]>>()
  for (const bet of bets) {
    const catName = bet.bet_categories?.name ?? "Uncategorized"
    if (!rounds.has(bet.round_number)) rounds.set(bet.round_number, new Map())
    const cats = rounds.get(bet.round_number)!
    if (!cats.has(catName)) cats.set(catName, [])
    cats.get(catName)!.push(bet)
  }
  return Array.from(rounds.entries())
    .sort(([a], [b]) => a - b)
    .map(([round, cats]) => ({
      round,
      categories: Array.from(cats.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, bets]) => ({ name, bets })),
    }))
}

// A menu-wide status glance: resolved once nothing is open/closed, closed when
// nothing is open, otherwise open.
function menuStatus(bets: Bet[]): BetStatus {
  if (bets.some((b) => b.status === "open")) return "open"
  if (bets.some((b) => b.status === "closed")) return "closed"
  return "resolved"
}

const BET_STATUSES: BetStatus[] = ["open", "closed", "resolved"]
const OUTCOMES: Outcome[] = ["hit", "miss", "push", "void"]

function toBetStatus(status: string): BetStatus {
  return (BET_STATUSES as string[]).includes(status)
    ? (status as BetStatus)
    : "closed"
}

function toOutcome(outcome: string | null): Outcome | null {
  return outcome && (OUTCOMES as string[]).includes(outcome)
    ? (outcome as Outcome)
    : null
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
      "id, bet_number, description, american_odds, round_number, status, outcome, bet_categories ( name )"
    )
    .eq("tournament_id", (tournament as { id: string }).id)
    .neq("status", "draft")
    .order("round_number")
    .order("bet_number")

  const bets: Bet[] = (betsData ?? []).map((bet) => ({
    ...bet,
    bet_categories: Array.isArray(bet.bet_categories)
      ? (bet.bet_categories[0] ?? null)
      : (bet.bet_categories as BetCategory | null),
  }))

  if (bets.length === 0) return emptyState

  const rounds = groupBets(bets)

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h1 className="font-heading text-3xl text-text-strong">Bet Menu</h1>
        <StatusBadge status={menuStatus(bets)} />
      </div>

      <div className="mt-3 flex flex-col gap-6">
        {rounds.map(({ round, categories }) => (
          <section key={round} className="flex flex-col gap-4">
            <h2 className="font-heading text-xl text-indigo-700">
              Round {round}
            </h2>
            {categories.map(({ name, bets }) => (
              <div key={name}>
                <h3 className="mb-2 text-[11px] font-bold tracking-wider text-text-muted uppercase">
                  {name}
                </h3>
                <Card className="gap-0 p-0">
                  {bets.map((bet) => (
                    <BetRow
                      key={bet.id}
                      number={bet.bet_number}
                      description={bet.description}
                      odds={bet.american_odds}
                      status={toBetStatus(bet.status)}
                      outcome={toOutcome(bet.outcome)}
                    />
                  ))}
                </Card>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
