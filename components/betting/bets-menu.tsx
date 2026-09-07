"use client"

import { Fragment, useCallback, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Collapse } from "@/components/ui/collapse"
import { PlayerChip } from "@/components/player/player-chip"
import { StatusBadge, type BetStatus } from "@/components/betting/status-badge"
import { PickRow } from "@/components/betting/pick-row"
import { MoneyDisplay } from "@/components/betting/money-display"
import { BetPlacementCard } from "@/components/betting/bet-placement-card"
import { BetErrorToast } from "@/components/betting/bet-error-toast"
import {
  BetCelebration,
  type BetCelebrationHandle,
} from "@/components/betting/bet-celebration"
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
  filterPhases,
  phaseHasBets,
  reconcileFacet,
  type Facet,
} from "@/lib/bet-filters"
import type { Phase, PhaseState } from "@/lib/phases"
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
// The compact round labels ("R1", "R3") are gone with the tab strip that held
// them (Sprint 26 / #193 — Andrew): rounds are chips in one scrolling row
// alongside the categories now, and they're spelled out. ROUND_LABEL above
// already had the full names, so the chips and the section headings finally
// read the same.
const PHASE_OPTIONS: Phase[] = [1, 2]

/** A phase's own state, as a badge. `phaseState()` already answers this for the
 *  dashboard's betting badge, so this mapping is deliberately total and
 *  boring — the interesting logic stays in one place (lib/phases.ts). */
const PHASE_BADGE: Record<PhaseState, BetStatus> = {
  open: "open",
  closed: "closed",
  unpublished: "unpublished",
}

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
        <StatusBadge status={betBadge(bet)} />
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

/**
 * A bet's badge — ONE expression, used by both cards, so they cannot disagree.
 *
 * It keys off `wagering_open` rather than `status`, and that is the whole fix
 * for #195. ClosedBetCard used to gate its badge on `bet.status !== "open"`,
 * which left a real state unbadged: between a phase's deadline and the admin's
 * closing upload — about ten hours on Thursday and again on Saturday, both when
 * the page is refreshed hardest — a bet is past its deadline while the sheet
 * still calls it `open`, so it rendered through ClosedBetCard with no badge at
 * all. `wagering_open` is already the field that decides WHICH card renders, so
 * asking it for the label makes the two agree by construction.
 *
 * "Resolved" stays derived at render (every pick has a verdict), never stored.
 */
function betBadge(bet: Bet): BetStatus {
  if (bet.wagering_open) return "open"
  return isBetSettled(bet.bet_picks) ? "resolved" : "closed"
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
  /** Each phase's own state, computed server-side from the phase clock and the
   * published bets (`phaseState()` in lib/phases.ts). Drives the badge beside
   * the toggle — and it is NOT derivable from `phases` alone, because a phase
   * closes on the clock as well as on its bets' statuses (ADR 0001 §5a). */
  phaseStates: Record<Phase, PhaseState>
  /** Which tab to open on — `closingPhase()` in lib/chase.ts, computed on the
   * server where the bets still carry their phase. */
  defaultPhase: Phase
}

export function BetsMenu({
  phases,
  isParticipant,
  placements,
  lockedOdds,
  placementsByPick,
  revealUnavailable = false,
  onBehalfOf = null,
  phaseStates,
  defaultPhase,
}: BetsMenuProps) {
  // Which phase the menu opens on. Decided on the server by closingPhase() —
  // Phase 2 the moment any Phase 2 bet is published, Phase 1 before that — so
  // the tab you land on is the one the tournament is actually in.
  const [phase, setPhase] = useState<Phase>(defaultPhase)
  // Exactly ONE secondary filter at a time — a round, or a category, or
  // neither. Never both; that's what "one filter at a time" buys, and it's
  // why no selection can empty the page.
  const [facet, setFacet] = useState<Facet>(ALL_FACET)
  // Rule-violation messages surface as one floating toast (see BetErrorToast)
  // instead of inline, so the stake input never reflows.
  const [toastError, setToastError] = useState<string | null>(null)
  const dismissToast = useCallback(() => setToastError(null), [])
  // The celebration is driven imperatively rather than by a state prop,
  // because arming it has to happen INSIDE the confirm click and a state
  // round-trip would land a render too late — after the await, with the
  // gesture already expired. See BetCelebration's header.
  const celebration = useRef<BetCelebrationHandle>(null)
  const armCelebration = useCallback(() => celebration.current?.arm(), [])
  const celebrate = useCallback(() => celebration.current?.celebrate(), [])

  // Has this phase been published at all? Hidden bets never reach the menu, so
  // an empty phase is one the admin hasn't opened yet — which is a state with
  // its own message, not an error (Sprint 26 / #193).
  const published = useMemo(() => phaseHasBets(phases, phase), [phases, phase])

  // Rounds and categories present IN THE SELECTED PHASE, so every chip offered
  // is guaranteed to match at least one bet.
  const roundChips = useMemo(
    () => availableRounds(phases, phase),
    [phases, phase]
  )
  const categoryChips = useMemo(
    () => availableCategories(phases, phase),
    [phases, phase]
  )
  // One row, rounds then categories (Sprint 26 / #193 — Andrew). It's worth
  // rendering only when there's an actual choice to make: a single chip beside
  // "All Bets" filters nothing.
  const chips = useMemo(
    () => [
      ...roundChips.map((value) => ({ kind: "round" as const, value, label: ROUND_LABEL[value] ?? value })),
      ...categoryChips.map((value) => ({ kind: "category" as const, value, label: value })),
    ],
    [roundChips, categoryChips]
  )
  const showChips = chips.length > 1

  // A selection made in one phase may not exist in the other — Round 1 is a
  // Phase 1 round and Round 3 a Phase 2 one, so a round facet essentially never
  // survives a tab change. Reconcile rather than render an empty page.
  const activeFacet = useMemo(
    () => reconcileFacet(phases, phase, facet),
    [phases, phase, facet]
  )

  const filteredPhases = useMemo(
    () => filterPhases(phases, phase, activeFacet),
    [phases, phase, activeFacet]
  )

  // What the active chip is called, so an empty result can name the thing that
  // emptied it rather than saying "no bets" and leaving the reader to work out
  // which of the controls above did it.
  /** The tab that isn't selected. Two phases, so this is a flip, not a search. */
  const otherPhase: Phase = phase === 1 ? 2 : 1

  const activeChipLabel =
    activeFacet.kind === "all"
      ? null
      : (chips.find(
          (c) => c.kind === activeFacet.kind && c.value === activeFacet.value
        )?.label ?? activeFacet.value)

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
  const facetKey = `${phase}|${activeFacet.kind}|${
    activeFacet.kind === "all" ? "" : activeFacet.value
  }`
  const [swap, setSwap] = useState({ key: facetKey, phase: "a" as "a" | "b" })
  if (swap.key !== facetKey) {
    setSwap({ key: facetKey, phase: swap.phase === "a" ? "b" : "a" })
  }

  // Selecting any chip replaces whatever was selected — one facet at a time,
  // which is what lets a single row hold both dimensions without anything to
  // reason about.
  const selectChip = (next: Facet) => setFacet(next)

  return (
    <>
      <div className="mb-6 flex flex-col gap-3">
        {/* Row 1: the PHASE, which is what the weekend is organised around, and
            beside it that phase's own state. The badge used to sit next to the
            <h1> and describe the whole book, which is why it read "Open"
            mid-tournament while the phase you were looking at was closed
            (#194). It belongs with the control that decides what it describes. */}
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex w-fit items-center gap-0.5 rounded-full border border-border bg-surface-sunken p-0.5">
            {PHASE_OPTIONS.map((value) => {
              const active = phase === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPhase(value)}
                  aria-pressed={active}
                  className={cn(
                    "min-h-11 cursor-pointer rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-fast ease-standard",
                    active
                      ? "bg-surface-card text-text-strong shadow-xs"
                      : "text-text-muted hover:text-text-strong"
                  )}
                >
                  Phase {value}
                </button>
              )
            })}
          </div>
          <StatusBadge status={PHASE_BADGE[phaseStates[phase]]} />
        </div>

        {/* Row 2: ONE chip row holding both secondary dimensions — rounds then
            categories (Sprint 26 / #193 — Andrew). They were a tab strip and a
            chip row on separate lines, which was two rows of chrome for a model
            that has only ever allowed one selection at a time. Merging them is
            the honest rendering of that, and it gives the page back a row on
            the device it's read on. Scrolls horizontally with no visible
            scrollbar; every chip is a 44px target. */}
        {showChips && (
          <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <FilterChip
              label="All Bets"
              active={activeFacet.kind === "all"}
              onClick={() => selectChip(ALL_FACET)}
            />
            {chips.map((chip) => (
              <FilterChip
                key={`${chip.kind}:${chip.value}`}
                label={chip.label}
                active={
                  activeFacet.kind === chip.kind &&
                  activeFacet.value === chip.value
                }
                onClick={() => selectChip({ kind: chip.kind, value: chip.value })}
              />
            ))}
          </div>
        )}
      </div>

      {/* THREE different nothings, and conflating them is how a member decides
          the app is broken. Each one names the thing that caused it and offers
          the tap that undoes it.

          1. The phase has nothing published — the bets exist but are still
             `hidden`, so the admin hasn’t opened the window. Pat asked for this
             one by name.
          2. The phase has bets but the active chip matches none of them. This is
             unreachable by construction — one facet at a time, every chip derived
             from this phase (lib/bet-filters.ts) — and it is here anyway,
             because "unreachable" is a property of today’s code and a member
             staring at a blank list deserves better than our confidence. */}
      {!published ? (
        <div className="py-6">
          <EmptyState
            glyph="⏳"
            title={`No bets in Phase ${phase} yet`}
            message={
              phase === 2
                ? "Phase 2 isn’t open yet — it opens after Round 2, once the admin uploads the menu. Nothing to see here until then."
                : "Phase 1 isn’t open yet — the book opens when an admin uploads the menu. Check back soon."
            }
            action={
              // Only offered when there is somewhere to go: on opening night
              // neither phase has anything, and a button back to an equally
              // empty tab is worse than no button.
              phaseHasBets(phases, otherPhase) ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPhase(otherPhase)}
                >
                  See Phase {otherPhase} instead
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : filteredPhases.length === 0 ? (
        <div className="py-6">
          <EmptyState
            glyph="🔍"
            title="No bets match this filter"
            message={
              activeChipLabel
                ? `Nothing in Phase ${phase} is filed under “${activeChipLabel}”.`
                : `Nothing in Phase ${phase} matches the current filter.`
            }
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => selectChip(ALL_FACET)}
              >
                Show all Phase {phase} bets
              </Button>
            }
          />
        </div>
      ) : (
        <div data-swap={swap.phase} className="flex flex-col gap-8">
          {filteredPhases.map(({ phase: phaseNumber, rounds }) => (
            <section key={phaseNumber} className="flex flex-col gap-5">
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
                            badge={betBadge(bet)}
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
                            onArm={armCelebration}
                            onPlaced={celebrate}
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
      <BetCelebration ref={celebration} />
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
