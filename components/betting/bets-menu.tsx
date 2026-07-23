"use client"

import { Fragment, useCallback, useMemo, useState } from "react"

import { Card } from "@/components/ui/card"
import { PlayerChip } from "@/components/player/player-chip"
import { StatusBadge } from "@/components/betting/status-badge"
import { PickRow } from "@/components/betting/pick-row"
import { MoneyDisplay } from "@/components/betting/money-display"
import { BetPlacementCard } from "@/components/betting/bet-placement-card"
import { BetErrorToast } from "@/components/betting/bet-error-toast"
import { EmptyState } from "@/components/modules/empty-state"
import { formatProbability } from "@/lib/format"
import { isBetSettled, toResult, type PickPlacements } from "@/lib/closed-bets"
import { cn } from "@/lib/utils"

export type BetCategory = {
  name: string
  slug: string
  allows_multiple_picks: boolean
}

export type Pick = {
  id: string
  sheet_pick_id: number
  label: string
  american_odds: number
  fractional_odds: string
  probability: number
  result: string
}

export type Bet = {
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

export type CategoryGroup = { name: string; bets: Bet[] }
export type RoundGroup = { round: string; categories: CategoryGroup[] }
export type PhaseGroup = { phase: number; rounds: RoundGroup[] }

const ROUND_LABEL: Record<string, string> = {
  tournament: "Tournament",
  round_1: "Round 1",
  round_2: "Round 2",
  round_3: "Round 3",
}
// Compact labels for the round tab strip — the full names live in the
// section headings once a tab is chosen.
const ROUND_TAB_LABEL: Record<string, string> = {
  tournament: "Tournament",
  round_1: "R1",
  round_2: "R2",
  round_3: "R3",
}
const CATEGORY_ORDER = [
  "Top Finisher",
  "Top X Finisher",
  "Match",
  "Group Match",
  "Prop Bet",
]

type StatusFilter = "all" | "open" | "closed"
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
]

// Open/closed is the bettor-facing split; "closed" folds in settled bets
// (status is never "resolved" — that's derived per pick at render).
function matchesStatus(status: StatusFilter, betStatus: string) {
  if (status === "all") return true
  return status === "open" ? betStatus === "open" : betStatus !== "open"
}

// Everyone's wagers on one closed pick, biggest stake first (PRD §12
// Q11/Q12 — amounts and identities go public the moment the bet closes).
function PickPlacementList({ group }: { group: PickPlacements }) {
  return (
    <div className="border-b border-border bg-surface-sunken px-4 py-2 last:border-b-0">
      {group.placements.map((p) => (
        <div
          key={p.user_id}
          className="flex items-center justify-between gap-3 py-1"
        >
          <PlayerChip
            userId={p.user_id}
            displayName={p.display_name}
            nickname={p.nickname}
            avatarUrl={p.avatar_url}
            className="min-w-0 flex-1"
            nameClassName="text-sm text-text-strong"
          />
          <MoneyDisplay value={p.amount} size="sm" weight="semibold" />
        </div>
      ))}
      {group.placements.length > 1 && (
        <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-1.5">
          <span className="text-[11px] font-bold tracking-wider text-text-muted uppercase">
            {group.placements.length} bettors
          </span>
          <MoneyDisplay
            value={group.total}
            size="sm"
            weight="bold"
            className="text-text-muted"
          />
        </div>
      )}
    </div>
  )
}

export type BetsMenuProps = {
  phases: PhaseGroup[]
  isParticipant: boolean
  placements: Record<string, number>
  lockedOdds: Record<string, number>
  placementsByPick: Record<string, PickPlacements>
}

export function BetsMenu({
  phases,
  isParticipant,
  placements,
  lockedOdds,
  placementsByPick,
}: BetsMenuProps) {
  const [status, setStatus] = useState<StatusFilter>("all")
  const [round, setRound] = useState<string>("all")
  const [categories, setCategories] = useState<string[]>([])
  // Rule-violation messages surface as one floating toast (see BetErrorToast)
  // instead of inline, so the stake input never reflows.
  const [toastError, setToastError] = useState<string | null>(null)
  const dismissToast = useCallback(() => setToastError(null), [])

  // Every bet on the page, flattened — used to decide which controls are
  // even worth showing (a lone round or an all-open menu needs no filter).
  const allBets = useMemo(
    () =>
      phases.flatMap((p) =>
        p.rounds.flatMap((r) => r.categories.flatMap((c) => c.bets))
      ),
    [phases]
  )
  const showStatus =
    allBets.some((b) => b.status === "open") &&
    allBets.some((b) => b.status !== "open")

  // Round tabs in menu order (phases are already sorted round-first upstream).
  const roundTabs = useMemo(() => {
    const seen = new Set<string>()
    const list: string[] = []
    for (const p of phases)
      for (const r of p.rounds)
        if (!seen.has(r.round)) {
          seen.add(r.round)
          list.push(r.round)
        }
    return list
  }, [phases])
  const showRoundTabs = roundTabs.length > 1
  const activeRound = roundTabs.includes(round) ? round : "all"

  // Categories present under the current status + round view — the chip row
  // stays contextual so it never offers a filter that would empty the page.
  const availableCategories = useMemo(() => {
    const seen = new Set<string>()
    for (const p of phases)
      for (const r of p.rounds) {
        if (activeRound !== "all" && r.round !== activeRound) continue
        for (const c of r.categories)
          if (c.bets.some((b) => matchesStatus(status, b.status)))
            seen.add(c.name)
      }
    return CATEGORY_ORDER.filter((c) => seen.has(c)).concat(
      [...seen].filter((c) => !CATEGORY_ORDER.includes(c))
    )
  }, [phases, activeRound, status])
  const showCategoryChips = availableCategories.length > 1

  const filteredPhases = useMemo(
    () =>
      phases
        .map((p) => ({
          phase: p.phase,
          rounds: p.rounds
            .filter((r) => activeRound === "all" || r.round === activeRound)
            .map((r) => ({
              round: r.round,
              categories: r.categories
                .map((c) => ({
                  name: c.name,
                  bets: c.bets.filter((b) => matchesStatus(status, b.status)),
                }))
                .filter((c) => c.bets.length > 0)
                .filter(
                  (c) => categories.length === 0 || categories.includes(c.name)
                ),
            }))
            .filter((r) => r.categories.length > 0),
        }))
        .filter((p) => p.rounds.length > 0),
    [phases, activeRound, status, categories]
  )

  const hasFilters = showStatus || showRoundTabs || showCategoryChips
  const isFiltered =
    status !== "all" || activeRound !== "all" || categories.length > 0

  function selectRound(next: string) {
    setRound(next)
    // A fresh tab is a fresh context — drop category picks so you never land
    // on an empty page with no chip left to undo it.
    setCategories([])
  }
  function toggleCategory(name: string) {
    setCategories((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    )
  }
  function resetFilters() {
    setStatus("all")
    setRound("all")
    setCategories([])
  }

  return (
    <>
      {hasFilters && (
        <div className="mb-6 flex flex-col gap-3">
          {showRoundTabs && (
            <div className="flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {["all", ...roundTabs].map((r) => {
                const active = activeRound === r
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => selectRound(r)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "relative shrink-0 px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors",
                      "after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:transition-colors",
                      active
                        ? "text-indigo-700 after:bg-indigo-700"
                        : "text-text-muted after:bg-transparent hover:text-text-strong"
                    )}
                  >
                    {r === "all" ? "All Bet Rounds" : (ROUND_TAB_LABEL[r] ?? r)}
                  </button>
                )
              })}
            </div>
          )}

          {(showStatus || showCategoryChips) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {showCategoryChips && (
                <div className="flex flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <FilterChip
                    label="All Categories"
                    active={categories.length === 0}
                    onClick={() => setCategories([])}
                  />
                  {availableCategories.map((name) => (
                    <FilterChip
                      key={name}
                      label={name}
                      active={categories.includes(name)}
                      onClick={() => toggleCategory(name)}
                    />
                  ))}
                </div>
              )}

              {showStatus && (
                <div className="ml-auto inline-flex shrink-0 items-center gap-0.5 rounded-full border border-border bg-surface-sunken p-0.5">
                  {STATUS_OPTIONS.map((opt) => {
                    const active = status === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setStatus(opt.value)}
                        aria-pressed={active}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
                          active
                            ? "bg-surface-card text-text-strong shadow-xs"
                            : "text-text-muted hover:text-text-strong"
                        )}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {filteredPhases.length === 0 ? (
        <div className="py-6">
          <EmptyState
            title="No bets match these filters"
            message="Try a different round, category, or status."
            action={
              isFiltered ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-sm font-semibold text-indigo-700 hover:underline"
                >
                  Clear filters
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {filteredPhases.map(({ phase, rounds }) => (
            <section key={phase} className="flex flex-col gap-5">
              {rounds.map(({ round: roundKey, categories: cats }) => (
                <div key={roundKey} className="flex flex-col gap-4">
                  <h3 className="font-heading text-lg text-text-strong">
                    {ROUND_LABEL[roundKey] ?? roundKey}
                  </h3>
                  {cats.map(({ name, bets }) => (
                    <div key={name} className="flex flex-col gap-3">
                      <div className="text-[11px] font-bold tracking-wider text-text-muted uppercase">
                        {name}
                      </div>
                      {bets.map((bet) =>
                        bet.status === "open" && isParticipant ? (
                          <BetPlacementCard
                            key={bet.id}
                            title={bet.title}
                            totalProbability={
                              bet.total_probability != null
                                ? `Total probability ${formatProbability(Number(bet.total_probability))}`
                                : null
                            }
                            allowsMultiplePicks={
                              bet.bet_categories?.allows_multiple_picks ?? true
                            }
                            picks={bet.bet_picks
                              .slice()
                              .sort((a, b) => a.sheet_pick_id - b.sheet_pick_id)
                              .map((pick) => ({
                                id: pick.id,
                                label: pick.label,
                                american_odds: pick.american_odds,
                                fractional_odds: pick.fractional_odds,
                                probability: formatProbability(
                                  Number(pick.probability)
                                ),
                              }))}
                            placements={placements}
                            lockedOdds={lockedOdds}
                            onError={setToastError}
                          />
                        ) : (
                          <Card key={bet.id} className="gap-0 p-0">
                            <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                              <div className="min-w-0 flex-1">
                                <div className="text-base leading-snug font-semibold text-pretty text-text-strong">
                                  {bet.title}
                                </div>
                                {bet.total_probability != null && (
                                  <div className="tabular mt-0.5 text-[11px] text-text-muted">
                                    Total probability{" "}
                                    {formatProbability(
                                      Number(bet.total_probability)
                                    )}
                                  </div>
                                )}
                              </div>
                              {bet.status !== "open" && (
                                <StatusBadge
                                  status={
                                    // Settled is derived at render — every
                                    // pick resolved — never stored.
                                    isBetSettled(bet.bet_picks)
                                      ? "resolved"
                                      : "closed"
                                  }
                                />
                              )}
                            </div>
                            {bet.bet_picks
                              .slice()
                              .sort((a, b) => a.sheet_pick_id - b.sheet_pick_id)
                              .map((pick) => {
                                const group =
                                  bet.status === "closed"
                                    ? placementsByPick[pick.id]
                                    : undefined
                                return (
                                  <Fragment key={pick.id}>
                                    <PickRow
                                      label={pick.label}
                                      americanOdds={pick.american_odds}
                                      fractionalOdds={pick.fractional_odds}
                                      probability={formatProbability(
                                        Number(pick.probability)
                                      )}
                                      result={toResult(pick.result)}
                                    />
                                    {group && <PickPlacementList group={group} />}
                                  </Fragment>
                                )
                              })}
                          </Card>
                        )
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
      <BetErrorToast message={toastError} onDismiss={dismissToast} />
    </>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap transition-colors",
        active
          ? "border-indigo-200 bg-indigo-50 text-indigo-700"
          : "border-border bg-surface-card text-text-muted hover:border-border-strong hover:text-text-strong"
      )}
    >
      {label}
    </button>
  )
}
