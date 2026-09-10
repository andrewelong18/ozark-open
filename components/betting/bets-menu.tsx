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
  ALL,
  allOf,
  filterPhases,
  phaseHasBets,
  reconcileFilter,
  roundOptions,
  type BetFilter,
} from "@/lib/bet-filters"
import { ScrollFadeRow } from "@/components/betting/scroll-fade-row"
import { CATEGORIES, ROUND_LABEL } from "@/lib/bet-taxonomy"
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
  //
  // All three levels live in ONE piece of state, because level 1 reconciles
  // level 2 (Round 1 does not exist in Phase 2) and a phase flip has to move
  // both atomically. Pat, Sept 10: three filters, each a radio group, all three
  // composing.
  const [filter, setFilter] = useState<BetFilter>(() => allOf(defaultPhase))
  const phase = filter.phase
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

  // The rounds this phase CAN hold (ADR 0001 §4), not the ones it currently
  // holds. Static on purpose — see lib/bet-filters.ts's header. Phase 1 offers
  // Round 1 before a Round 1 bet exists, and the empty state below covers it.
  const rounds = roundOptions(phase)

  const filteredPhases = useMemo(
    () => filterPhases(phases, filter),
    [phases, filter]
  )

  /** The tab that isn't selected. Two phases, so this is a flip, not a search. */
  const otherPhase: Phase = phase === 1 ? 2 : 1

  // What is currently narrowing the phase, in the order the rows are stacked,
  // so an empty result names every condition that caused it rather than saying
  // "no bets" and leaving the reader to work out which of three rows did it.
  const activeLabels = [
    filter.round === ALL ? null : (ROUND_LABEL[filter.round] ?? filter.round),
    filter.category === ALL ? null : filter.category,
  ].filter((label): label is string => label !== null)

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
  const filterKey = `${filter.phase}|${filter.round}|${filter.category}`
  const [swap, setSwap] = useState({ key: filterKey, phase: "a" as "a" | "b" })
  if (swap.key !== filterKey) {
    setSwap({ key: filterKey, phase: swap.phase === "a" ? "b" : "a" })
  }

  // Each row is a radio group: a click REPLACES that row's value and leaves the
  // other two rows alone. Clicking the active chip is a no-op rather than a
  // deselect — that's what makes it a radio and not a checkbox, and it's the
  // behaviour Pat asked for by name.
  const selectPhase = (next: Phase) =>
    setFilter((current) => reconcileFilter(current, next))
  const selectRound = (round: BetFilter["round"]) =>
    setFilter((current) => ({ ...current, round }))
  const selectCategory = (category: BetFilter["category"]) =>
    setFilter((current) => ({ ...current, category }))
  const clearFacets = () =>
    setFilter((current) => ({ ...current, round: ALL, category: ALL }))

  return (
    <>
      <div className="mb-6 flex flex-col gap-3">
        {/* Row 1: the PHASE, which is what the weekend is organised around, and
            underneath it that phase's own state. The badge used to sit next to
            the <h1> and describe the whole book, which is why it read "Open"
            mid-tournament while the phase you were looking at was closed
            (#194). It belongs with the control that decides what it describes.

            It was a pill-shaped segmented control pinned left with the badge
            floating off to the right — which on desktop put the two apart by
            most of a column, and left the reader to infer that the badge
            described the selected tab rather than the page. It is now a full
            -width heading rule: two tabs sharing the row, the active one
            underlined, and the badge centred beneath both. Full width means the
            menu's width, since this sits inside the same column the cards do —
            edge to edge on a phone, the content column on a desktop.

            It LOOKS like a tab bar and is deliberately not one in ARIA: the
            tabs pattern owes a tabpanel, aria-controls and roving tabindex, and
            a half-built one is worse than none. Same call as the chips — these
            stay aria-pressed buttons in a labelled group. */}
        <div
          role="group"
          aria-label="Filter by phase"
          // An outlined, sunken track with a raised active segment — the
          // segmented-control vocabulary the pill version had, at the width and
          // weight of a heading. The outline is what makes it read as ONE
          // control with two states rather than two links that happen to sit in
          // a row; a bare underline left the unselected phase looking like body
          // copy.
          className="flex w-full gap-1 rounded-xl border border-border bg-surface-sunken p-1"
        >
          {PHASE_OPTIONS.map((value) => {
            const active = phase === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => selectPhase(value)}
                aria-pressed={active}
                // The badge lives INSIDE the button, so without an explicit
                // label the button's accessible name becomes "Phase 2 Not open
                // yet" — a name that changes as the tournament runs, and one no
                // locator or spoken instruction can rely on. The name is pinned
                // to "Phase N"; the status is announced after it, as the
                // description it actually is.
                aria-label={`Phase ${value}`}
                aria-describedby={`phase-${value}-state`}
                className={cn(
                  "flex flex-1 cursor-pointer flex-col items-center gap-1.5 rounded-lg border-b-2 px-2 pt-2 pb-2 transition-colors duration-fast ease-standard",
                  active
                    ? "border-indigo-700 bg-surface-card shadow-xs"
                    : "border-transparent hover:bg-surface-card/60"
                )}
              >
                <span
                  className={cn(
                    // Azalea, matching the round headings this sits above —
                    // DESIGN_SYSTEM: display type is for headings, and that is
                    // what these are now. Indigo-700 for the selected one is
                    // the same treatment the UI kit gives a section heading.
                    "font-heading text-lg leading-none transition-colors duration-fast ease-standard",
                    active ? "text-indigo-700" : "text-text-muted"
                  )}
                >
                  Phase {value}
                </span>
                {/* BOTH phases show their own state, each under its own label.
                    One badge for the selected phase made the reader carry the
                    other one in their head — "is Phase 2 open yet?" is the
                    question the tab is there to answer, and answering it only
                    after you tap is answering it too late. */}
                <span id={`phase-${value}-state`}>
                  <StatusBadge status={PHASE_BADGE[phaseStates[value]]} />
                </span>
              </button>
            )
          })}
        </div>

        {/* Rows 2 and 3: the ROUND, then the CATEGORY. They were one merged
            chip row (Sprint 26 / #193) because the model underneath allowed
            only one of them to be active at a time; Pat rejected that on Sept
            10 and asked for three levels that compose, so they are two rows
            again — and this time they are genuinely independent.

            BOTH ROWS ALWAYS RENDER, and their options are fixed. Nothing here
            is derived from the bets that happen to be loaded, so the row you
            reach for is in the same place on Thursday morning and Saturday
            night. Each scrolls horizontally with no visible scrollbar; every
            chip is a 44px target.

            They are aria-pressed buttons in a labelled group rather than
            role="radio". Pat's "function like a radio button" is a statement
            about BEHAVIOUR — exactly one active, and clicking the active one
            never deselects it — which selectRound/selectCategory guarantee
            either way. */}
        {/* Rows 2 and 3 are STYLED THE SAME, deliberately, because the label in
            front of each is now what tells them apart. An earlier pass gave them
            different shapes and weights to do that job wordlessly; naming them
            says it outright, and once it is said the shape difference is just
            two controls that look unrelated for no reason. */}
        <FilterRow label="Round">
          <FilterChip
            label="All"
            srLabel="All Rounds"
            active={filter.round === ALL}
            onClick={() => selectRound(ALL)}
          />
          {rounds.map((round) => (
            <FilterChip
              key={round}
              label={ROUND_LABEL[round] ?? round}
              active={filter.round === round}
              onClick={() => selectRound(round)}
            />
          ))}
        </FilterRow>

        <FilterRow label="Category">
          <FilterChip
            label="All"
            srLabel="All Categories"
            active={filter.category === ALL}
            onClick={() => selectCategory(ALL)}
          />
          {CATEGORIES.map((category) => (
            <FilterChip
              key={category}
              label={category}
              active={filter.category === category}
              onClick={() => selectCategory(category)}
            />
          ))}
        </FilterRow>
      </div>

      {/* TWO different nothings, and conflating them is how a member decides
          the app is broken. Each names what caused it and offers the tap that
          undoes it.

          1. The phase has nothing published — the bets exist but are still
             `hidden`, so the admin hasn’t opened the window. Pat asked for this
             one by name.
          2. The phase has bets but this combination of round and category
             matches none of them. Sprint 26 shipped this as unreachable by
             construction; three independent filters make it REACHABLE, which is
             the price of Pat's Sept 10 revision (PRD §12 A23). It is a designed
             screen now, not a hedge: it names every active condition, because
             with two rows narrowing at once "no bets" would leave the reader to
             work out which one did it. */}
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
                  onClick={() => selectPhase(otherPhase)}
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
              activeLabels.length > 0
                ? `Nothing in Phase ${phase} is filed under ${activeLabels
                    .map((label) => `“${label}”`)
                    .join(" + ")}.`
                : `Nothing in Phase ${phase} matches the current filter.`
            }
            action={
              <Button variant="secondary" size="sm" onClick={clearFacets}>
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

/**
 * The row that carries one filter level: its name, then its options.
 *
 * The label is what distinguishes the round row from the category row now, so
 * the two rows are free to look identical — which is the point. It is a real
 * visible label rather than an aria one, and the group is `aria-labelledby` it
 * rather than carrying a duplicate string, so what a screen reader announces and
 * what is painted cannot drift apart.
 *
 * The fixed label column costs about 60px of a phone's ~358px. That is real, and
 * it is the trade being made knowingly: naming the levels beats inferring them
 * from a leading "All Rounds" chip, and the row scrolls, so what the label takes
 * is reachable rather than lost.
 */
function FilterRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  const id = `filter-row-${label.toLowerCase()}`
  return (
    <ScrollFadeRow
      role="group"
      aria-labelledby={id}
      className="items-center gap-1.5"
    >
      {/* The label rides INSIDE the scroller, as the row's first item. As a
          fixed column outside it, it held 60px of a phone's 358px hostage on
          every row forever; here it scrolls away with everything else, so the
          width it costs is borrowed rather than spent.

          Its width is its text, not a fixed column, so the gap to the first chip
          is the same as the gap between chips — one rhythm per row. That does
          mean "Round" and "Category" start their chips at different x
          positions, which is fine: the label is read, not aligned to. */}
      <span
        id={id}
        className="shrink-0 pr-1 text-[10px] font-bold tracking-[0.09em] text-text-body uppercase"
      >
        {label}
      </span>
      {children}
    </ScrollFadeRow>
  )
}

/**
 * One radio option in a filter row.
 *
 * A small rectangle: solid indigo when selected, white when not. Both rows use
 * it, because the row labels now say which level you are looking at and two
 * controls doing the same job have no reason to look unrelated.
 *
 * The painted chip is 32px and the button around it is 44px — the tap target the
 * repo holds every control to (`e2e/mobile-layout.spec.ts`). Keeping them
 * separate is what lets the chip be small without the target following it down;
 * the spec measures reach from the centre and counts the button or any
 * descendant as a hit, so the transparent padding still registers.
 */
function FilterChip({
  label,
  srLabel,
  active,
  onClick,
}: {
  label: string
  /** Accessible name, when the visible text is too terse to stand alone —
   *  two buttons both reading "All" are ambiguous to a screen reader and to a
   *  locator alike. Must CONTAIN the visible text (WCAG 2.5.3). */
  srLabel?: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={srLabel}
      className="group inline-flex min-h-11 shrink-0 cursor-pointer items-center"
    >
      <span
        className={cn(
          "inline-flex h-8 items-center rounded-sm border px-3 text-xs font-semibold whitespace-nowrap transition-colors duration-fast ease-standard",
          active
            ? "border-indigo-700 bg-indigo-700 text-white"
            : "border-border bg-surface-card text-text-muted group-hover:border-border-strong group-hover:text-text-strong"
        )}
      >
        {label}
      </span>
    </button>
  )
}
