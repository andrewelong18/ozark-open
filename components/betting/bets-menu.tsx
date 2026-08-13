"use client"

import { Fragment, useCallback, useMemo, useState } from "react"

import { Card } from "@/components/ui/card"
import { Collapse } from "@/components/ui/collapse"
import { PlayerChip } from "@/components/player/player-chip"
import { StatusBadge } from "@/components/betting/status-badge"
import { PickRow } from "@/components/betting/pick-row"
import { MoneyDisplay } from "@/components/betting/money-display"
import { BetPlacementCard } from "@/components/betting/bet-placement-card"
import { BetErrorToast } from "@/components/betting/bet-error-toast"
import { EmptyState } from "@/components/modules/empty-state"
import { formatProbability } from "@/lib/format"
import {
  isBetSettled,
  summarizeBetReveal,
  toResult,
  type PickPlacements,
} from "@/lib/closed-bets"
import type { OnBehalfOf } from "@/lib/placements"
import {
  ALL_FACET,
  availableCategories,
  availableRounds,
  defaultStatusView,
  filterPhases,
  reconcileFacet,
  showStatusToggle,
  type Facet,
  type StatusView,
} from "@/lib/bet-filters"
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
  /** The golfer this pick names (FK → users.id); null for Field, Yes/No
   * props, and unmatched labels — those stay plain, unlinked text. */
  player_user_id: string | null
  /** That golfer's avatar, flattened from the query join (null → initials). */
  player_avatar_url: string | null
}

export type Bet = {
  id: string
  sheet_bet_id: number
  title: string
  phase: number
  round: string
  /** The bet's own status, from the sheet. Drives the post-close REVEAL, which
   * RLS gates on the same value — so this must never be faked. */
  status: string
  /**
   * Whether wagers can still be placed, computed server-side from the phase
   * deadline as well as the status (Sprint 25 / #106). Distinct from `status`
   * on purpose: the clock closes WAGERING, the upload closes THE BET. Between
   * the deadline and the admin's closing upload, the stake inputs are gone but
   * nobody's picks are revealed yet.
   */
  wagering_open: boolean
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
const STATUS_OPTIONS: { value: StatusView; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
]

// Everyone's wagers on one closed pick, biggest stake first (PRD §12
// Q11/Q12 — amounts and identities go public the moment the bet closes).
// The DETAIL half of the reveal: shown only once the accordion is open.
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

/**
 * The AT-A-GLANCE half of the reveal (#103): one pick's bettor count and
 * money, shown while the accordion is collapsed. The totals are the value you
 * want without tapping — who backed what is the detail behind them.
 */
function PickPlacementTotal({ group }: { group: PickPlacements }) {
  const n = group.placements.length
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-sunken px-4 py-1.5 last:border-b-0">
      <span className="text-[11px] font-bold tracking-wider text-text-muted uppercase">
        {n} {n === 1 ? "bettor" : "bettors"}
      </span>
      <MoneyDisplay
        value={group.total}
        size="sm"
        weight="bold"
        className="text-text-muted"
      />
    </div>
  )
}

/**
 * A bet the viewer can't wager on right now: closed, or open-but-they're-not
 * an approved bettor.
 *
 * For a CLOSED bet this is the weekend's social moment — every bettor's name
 * and stake on every pick (Q11). Rendering all of that inline made a closed
 * menu a wall of names on the page people refresh all weekend, one-handed, on
 * a phone. So the names collapse behind an "x bettors" toggle, closed by
 * default, while the per-pick totals stay on screen. Still a reveal, just not
 * a wall.
 */
function ClosedBetCard({
  bet,
  placementsByPick,
  revealUnavailable = false,
}: {
  bet: Bet
  placementsByPick: Record<string, PickPlacements>
  revealUnavailable?: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  // Only a CLOSED bet has a reveal. This card also renders OPEN bets for
  // people who aren't approved bettors yet, and those have nothing to show —
  // RLS wouldn't return the rows anyway.
  const revealed = bet.status === "closed"
  const reveal = useMemo(
    () =>
      revealed
        ? summarizeBetReveal(
            bet.bet_picks.map((p) => p.id),
            placementsByPick
          )
        : null,
    [revealed, bet.bet_picks, placementsByPick]
  )
  const panelId = `reveal-${bet.id}`

  return (
    <Card className="gap-0 p-0">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-base leading-snug font-semibold text-pretty text-text-strong">
            {bet.title}
          </div>
          {bet.total_probability != null && (
            <div className="tabular mt-0.5 text-[11px] text-text-muted">
              Total probability {formatProbability(Number(bet.total_probability))}
            </div>
          )}
          {/* The reveal control. A bet nobody backed still renders — it just
              says so, in plain muted text, with nothing to tap. */}
          {/* "Nobody bet" and "we couldn't load the bets" are the same shape
              of nothing, and conflating them is exactly how the reveal stayed
              broken for two sprints (#132). Say which one it is. */}
          {reveal &&
            (revealUnavailable ? (
              <div className="mt-1 text-[11px] font-semibold text-amber-700">
                Couldn&rsquo;t load the wagers on this bet
              </div>
            ) : reveal.bettorCount === 0 ? (
              <div className="mt-1 text-[11px] text-text-muted">
                No wagers on this bet
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                aria-controls={panelId}
                // The one control on a closed bet, and the weekend's social
                // moment is behind it — 19px of it was not enough on the page
                // people refresh one-handed all weekend.
                className="-mt-1 -ml-2 inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold text-indigo-700 transition-colors duration-fast ease-standard hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span>
                  {expanded ? "Hide" : "Show"} {reveal.bettorCount}{" "}
                  {reveal.bettorCount === 1 ? "bettor" : "bettors"}
                </span>
                <span className="tabular text-text-muted">
                  · <MoneyDisplayInline value={reveal.total} />
                </span>
                <ChevronGlyph open={expanded} />
              </button>
            ))}
        </div>
        {bet.status !== "open" && (
          <StatusBadge
            status={
              // Settled is derived at render — every pick resolved — never
              // stored.
              isBetSettled(bet.bet_picks) ? "resolved" : "closed"
            }
          />
        )}
      </div>
      <div id={panelId}>
        {bet.bet_picks
          // Favourites-first from the page — see above.
          .map((pick) => {
            const group = revealed ? placementsByPick[pick.id] : undefined
            return (
              <Fragment key={pick.id}>
                <PickRow
                  label={pick.label}
                  americanOdds={pick.american_odds}
                  fractionalOdds={pick.fractional_odds}
                  probability={formatProbability(Number(pick.probability))}
                  result={toResult(pick.result)}
                  playerUserId={pick.player_user_id}
                  playerAvatarUrl={pick.player_avatar_url}
                />
                {/* Two opposed collapses: the totals line closes as the bettor
                    list opens, so the card's height moves monotonically instead
                    of jumping between two different-sized blocks.

                    An earlier pass shipped this with both halves permanently
                    mounted and had to revert — the collapsed names stayed
                    findable in the DOM, which would have gutted the
                    reveal-at-close assertion in e2e/bets-menu.spec.ts (#103).
                    <Collapse> mounts on open and unmounts after the close
                    transition, so the steady closed state is genuinely empty
                    and that guard still holds. */}
                {group && (
                  <>
                    <Collapse open={!expanded}>
                      <PickPlacementTotal group={group} />
                    </Collapse>
                    <Collapse open={expanded}>
                      <PickPlacementList group={group} />
                    </Collapse>
                  </>
                )}
              </Fragment>
            )
          })}
      </div>
    </Card>
  )
}

/** Money inside a line of running text — MoneyDisplay is a block treatment. */
function MoneyDisplayInline({ value }: { value: number }) {
  return <span className="tabular">${value}</span>
}

/** A bare chevron. The DS ships no icon set (readme §Iconography) and leans on
 * typographic marks, so this is a rotated caret rather than a Lucide import. */
function ChevronGlyph({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block text-[9px] leading-none text-text-muted transition-transform duration-fast ease-standard",
        open && "rotate-180"
      )}
    >
      ▼
    </span>
  )
}

export type BetsMenuProps = {
  phases: PhaseGroup[]
  isParticipant: boolean
  placements: Record<string, number>
  lockedOdds: Record<string, number>
  placementsByPick: Record<string, PickPlacements>
  /** The closed-bet reveal query failed, so placementsByPick is empty because
   * we don't know, not because nobody bet (#132). */
  revealUnavailable?: boolean
  /** Set when an admin is entering wagers for a member (Sprint 23 / #101) —
   * passed straight down to the placement cards, which swap endpoints. Every
   * other prop already describes the MEMBER in that mode: the page loads their
   * placements and their locked odds, not the admin's.
   *
   * Optional here (a plain member's menu has no on-behalf mode) but REQUIRED
   * on BetPlacementCard, so the hand-off below can't be dropped silently. */
  onBehalfOf?: OnBehalfOf
}

export function BetsMenu({
  phases,
  isParticipant,
  placements,
  lockedOdds,
  placementsByPick,
  revealUnavailable = false,
  onBehalfOf = null,
}: BetsMenuProps) {
  // The view the menu opens on, computed from the bets actually on the page:
  // open if anything is open, else closed. Mid-tournament Phase 1 is closed
  // while Phase 2 is open, so this can't key off the phase (#104).
  const [status, setStatus] = useState<StatusView>(() =>
    defaultStatusView(phases)
  )
  // Exactly ONE secondary filter at a time — a round, or a category, or
  // neither. Never both; that's what "one filter at a time" buys, and it's
  // why no selection can empty the page.
  const [facet, setFacet] = useState<Facet>(ALL_FACET)
  // Rule-violation messages surface as one floating toast (see BetErrorToast)
  // instead of inline, so the stake input never reflows.
  const [toastError, setToastError] = useState<string | null>(null)
  const dismissToast = useCallback(() => setToastError(null), [])

  const showStatus = useMemo(() => showStatusToggle(phases), [phases])

  // Rounds and categories present IN THE CURRENT VIEW, so every option
  // offered is guaranteed to match at least one bet.
  const roundTabs = useMemo(
    () => availableRounds(phases, status),
    [phases, status]
  )
  const categoryChips = useMemo(
    () => availableCategories(phases, status),
    [phases, status]
  )
  const showRoundTabs = roundTabs.length > 1
  const showCategoryChips = categoryChips.length > 1

  // A selection made in one view may not exist in the other (filter to Round
  // 3, flip to Closed). Reconcile rather than render an empty page.
  const activeFacet = useMemo(
    () => reconcileFacet(phases, status, facet),
    [phases, status, facet]
  )

  const filteredPhases = useMemo(
    () => filterPhases(phases, status, activeFacet),
    [phases, status, activeFacet]
  )

  // Replays the list's entrance whenever the filter changes, by alternating
  // between two identical keyframes (a CSS animation restarts only when its
  // name changes). See the [data-swap] rules in app/globals.css for why this
  // is a flip-flop and not a `key` on the container — a key would remount every
  // BetPlacementCard and discard typed stakes and pending confirms.
  //
  // Adjusting state during render is React's sanctioned escape hatch for
  // derived state: it discards this render and re-runs immediately, before
  // paint. In an effect it would be a cascading render, and
  // react-hooks/set-state-in-effect rejects it.
  const facetKey = `${status}|${activeFacet.kind}|${
    activeFacet.kind === "all" ? "" : activeFacet.value
  }`
  const [swap, setSwap] = useState({ key: facetKey, phase: "a" as "a" | "b" })
  if (swap.key !== facetKey) {
    setSwap({ key: facetKey, phase: swap.phase === "a" ? "b" : "a" })
  }

  const hasFilters = showStatus || showRoundTabs || showCategoryChips

  // Selecting either dimension clears the other — they never combine.
  const selectRound = (round: string) =>
    setFacet(round === "all" ? ALL_FACET : { kind: "round", value: round })
  const selectCategory = (name: string | null) =>
    setFacet(name === null ? ALL_FACET : { kind: "category", value: name })

  return (
    <>
      {hasFilters && (
        <div className="mb-6 flex flex-col gap-3">
          {/* The open/closed VIEW sits on top, alone on its row, because it
              partitions the menu rather than narrowing it — and because
              during the tournament it's the control people reach for most. */}
          {showStatus && (
            <div className="inline-flex w-fit items-center gap-0.5 rounded-full border border-border bg-surface-sunken p-0.5">
              {STATUS_OPTIONS.map((opt) => {
                const active = status === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatus(opt.value)}
                    aria-pressed={active}
                    className={cn(
                      "min-h-11 cursor-pointer rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-fast ease-standard",
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

          {/* Then ONE secondary dimension. Rounds win the tab strip when there
              are several to choose between; otherwise categories get it. Both
              are single-select and mutually exclusive, so there is never a
              combination to reason about. */}
          {showRoundTabs && (
            <div className="flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {["all", ...roundTabs].map((r) => {
                const active =
                  r === "all"
                    ? activeFacet.kind !== "round"
                    : activeFacet.kind === "round" && activeFacet.value === r
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => selectRound(r)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "relative min-h-11 shrink-0 cursor-pointer px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors duration-fast ease-standard",
                      "after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:transition-colors duration-fast ease-standard",
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

          {showCategoryChips && (
            <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <FilterChip
                label="All Categories"
                active={activeFacet.kind !== "category"}
                onClick={() => selectCategory(null)}
              />
              {categoryChips.map((name) => (
                <FilterChip
                  key={name}
                  label={name}
                  active={
                    activeFacet.kind === "category" && activeFacet.value === name
                  }
                  onClick={() => selectCategory(name)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Unreachable by construction — one facet at a time, every option
          derived from the current view (see lib/bet-filters.ts). Kept as a
          floor rather than a message about filters, because the only way to
          land here now is a menu with nothing in the chosen view at all. */}
      {filteredPhases.length === 0 ? (
        <div className="py-6">
          <EmptyState
            title={status === "open" ? "No open bets" : "No closed bets yet"}
            message={
              status === "open"
                ? "Nothing is taking wagers right now. Check the closed bets for how everyone did."
                : "Nothing has closed yet. Every bet on the menu is still taking wagers."
            }
          />
        </div>
      ) : (
        <div data-swap={swap.phase} className="flex flex-col gap-8">
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
                      {bets.map((bet) => (
                        // The sheet's bet id is the one stable, human-readable
                        // handle on a card — the title repeats ("Match — Round
                        // 1" three times) and nothing else here is a heading.
                        // The E2E journeys anchor on it; see e2e/bets-menu.spec.ts.
                        <div key={bet.id} data-testid={`bet-${bet.sheet_bet_id}`}>
                        {bet.wagering_open && isParticipant ? (
                          <BetPlacementCard
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
                              // Already favourites-first from the page
                              // (sortPicks — #105). Re-sorting here is what
                              // silently overrode it until Sprint 24.
                              .map((pick) => ({
                                id: pick.id,
                                label: pick.label,
                                american_odds: pick.american_odds,
                                fractional_odds: pick.fractional_odds,
                                probability: formatProbability(
                                  Number(pick.probability)
                                ),
                                player_user_id: pick.player_user_id,
                                player_avatar_url: pick.player_avatar_url,
                              }))}
                            placements={placements}
                            lockedOdds={lockedOdds}
                            onError={setToastError}
                            onBehalfOf={onBehalfOf}
                          />
                        ) : (
                          <ClosedBetCard
                            bet={bet}
                            placementsByPick={placementsByPick}
                            revealUnavailable={revealUnavailable}
                          />
                        )}
                        </div>
                      ))}
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
        // min-h-11 rather than an expanded pseudo hit area: chips sit shoulder
        // to shoulder in a scrolling row, so overlapping targets would just
        // move the mis-tap somewhere else.
        "inline-flex min-h-11 shrink-0 items-center rounded-full border px-3.5 text-xs font-semibold whitespace-nowrap transition-colors duration-fast ease-standard",
        active
          ? "border-indigo-200 bg-indigo-50 text-indigo-700"
          : "border-border bg-surface-card text-text-muted hover:border-border-strong hover:text-text-strong"
      )}
    >
      {label}
    </button>
  )
}
