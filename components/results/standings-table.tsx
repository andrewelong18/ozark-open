"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { PlayerChip } from "@/components/player/player-chip"
import { MoneyDisplay } from "@/components/betting/money-display"
import { cashReturned, type ResultsRow } from "@/lib/payouts"
import {
  COLUMN_LABELS,
  DEFAULT_SORT,
  nextSort,
  sortStandings,
  type StandingsColumn,
  type StandingsSort,
} from "@/lib/standings"

// The Final Standings table (Sprint 28 / #198) — Pat's six columns, sorted
// profit/loss descending, every header re-sorts.
//
// Lifted intact from app/results/page.tsx, which retired to a redirect in the
// same sprint. The GRID const, the MoneyCell helper, the sm:contents mobile
// restack and the refunded sub-line all came across unchanged: that table was
// un-scrollered in Sprint 9's mobile pass (it used to sit behind a 480px
// horizontal scroller, which put "what did I win" one drag away on the device
// it is actually read on). Don't regress it.
//
// Client component for one reason: the sorting. All the money arrives already
// computed from lib/payouts.ts.

// Stacked on a phone, six columns at sm+ — see the note on the header row.
const GRID =
  "grid grid-cols-[24px_1fr] items-baseline gap-x-2 px-4 sm:grid-cols-[24px_1fr_repeat(4,68px)]"

/** The five columns a header click can sort by, in Pat's order. `rank` is the
 *  reset rather than a sixth ordering. */
const SORTABLE: StandingsColumn[] = [
  "display_name",
  "entry_fee",
  "theoretical",
  "payout",
  "profit_loss",
]

function caret(active: boolean, direction: "asc" | "desc") {
  if (!active) return ""
  return direction === "desc" ? " ↓" : " ↑"
}

// One money column. On a phone the header row is gone, so each value carries
// its own label; at sm+ the label disappears and the value right-aligns under
// the heading it belongs to.
function MoneyCell({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <span className="inline-flex items-baseline gap-1 sm:block sm:text-right">
      <span className="text-[10px] font-bold tracking-wider text-text-muted uppercase sm:hidden">
        {label}
      </span>
      {children}
    </span>
  )
}

/** A clickable column heading. Right-aligned for the money columns, which is
 *  where their values sit. */
function SortHeader({
  column,
  sort,
  onSort,
  align = "left",
}: {
  column: StandingsColumn
  sort: StandingsSort
  onSort: (column: StandingsColumn) => void
  align?: "left" | "right"
}) {
  const active = sort.column === column
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      // aria-sort belongs to a columnheader, and this is a CSS grid with no
      // table roles on it — so the state is spoken as a toggle instead.
      aria-pressed={active}
      aria-label={
        active
          ? `${COLUMN_LABELS[column]}, sorted ${sort.direction === "desc" ? "high to low" : "low to high"}. Activate to reverse.`
          : `Sort by ${COLUMN_LABELS[column]}`
      }
      className={
        "cursor-pointer text-[10px] font-bold tracking-wider uppercase transition-colors hover:text-text-strong " +
        (active ? "text-text-strong" : "text-text-muted") +
        (align === "right" ? " text-right" : " text-left")
      }
    >
      {COLUMN_LABELS[column]}
      {caret(active, sort.direction)}
    </button>
  )
}

export function StandingsTable({
  rows,
  pending,
  leaderUserId,
  viewerUserId,
}: {
  rows: ResultsRow[]
  /** Placements across the pool with no result yet. Non-zero suppresses the
   *  gold leader row (#108) — see below. */
  pending: number
  /** The pinned P/L-descending winner, decided by the SERVER and passed in.
   *  Not "whoever is in row 1" — see the comment on the gold row. */
  leaderUserId: string | null
  /** The signed-in member, so they can find themselves in 32 rows. */
  viewerUserId: string | null
}) {
  const [sort, setSort] = useState<StandingsSort>(DEFAULT_SORT)
  const sorted = sortStandings(rows, sort)
  const onSort = (column: StandingsColumn) =>
    setSort((current) => nextSort(current, column))

  return (
    <div className="flex flex-col gap-2">
      {/* The sort control for phones. The header row below is sm+ only — it
          has to be, because the columns restack under the name on a narrow
          screen — so without this, "click any column to re-sort" would not
          exist at all on the device this page is read on. Wraps rather than
          scrolls: /results was already caught once putting the money behind a
          horizontal drag. */}
      <div className="flex flex-wrap items-center gap-1.5 sm:hidden">
        <span className="text-[10px] font-bold tracking-wider text-text-muted uppercase">
          Sort
        </span>
        {SORTABLE.map((column) => {
          const active = sort.column === column
          return (
            <button
              key={column}
              type="button"
              onClick={() => onSort(column)}
              aria-pressed={active}
              className={
                "min-h-8 rounded-full border px-2.5 text-xs font-semibold transition-colors " +
                (active
                  ? "border-indigo-300 bg-indigo-100 text-indigo-800"
                  : "border-border bg-surface-card text-text-muted")
              }
            >
              {COLUMN_LABELS[column]}
              {caret(active, sort.direction)}
            </button>
          )
        })}
      </div>

      <Card className="gap-0 p-0">
        {/* Named so tests can scope to the ROWS. The mobile sort chips above
            carry the same five words ("Entry", "Theo", "Payout", "P/L"), and an
            unscoped text match would find a chip and pass while the stacked
            per-row labels were missing — which is the exact defect
            e2e/mobile-results.spec.ts exists to catch. */}
        <div data-testid="standings-rows">
          {/* Six columns on a laptop, stacked on a phone — the same
              `sm:contents` move as the people console and the leaderboard.
              Every heading is a button; `#` is the way back to the default. */}
          <div
            className={`${GRID} hidden border-b border-border py-2.5 sm:grid`}
          >
            <button
              type="button"
              onClick={() => onSort("rank")}
              title="Back to profit/loss order"
              className="cursor-pointer text-left text-[10px] font-bold tracking-wider text-text-muted uppercase transition-colors hover:text-text-strong"
            >
              {COLUMN_LABELS.rank}
            </button>
            <SortHeader column="display_name" sort={sort} onSort={onSort} />
            <SortHeader column="entry_fee" sort={sort} onSort={onSort} align="right" />
            <SortHeader column="theoretical" sort={sort} onSort={onSort} align="right" />
            <SortHeader column="payout" sort={sort} onSort={onSort} align="right" />
            <SortHeader column="profit_loss" sort={sort} onSort={onSort} align="right" />
          </div>
          {sorted.map((row, i) => {
            // THE ONE NON-OBVIOUS RULE IN THIS COMPONENT: gold marks the
            // WINNER, not row 1. leaderUserId is pinned to profit/loss
            // descending and does not follow the viewer's sort — otherwise
            // sorting by Entry Fee would crown whoever paid the most. So when
            // the viewer re-sorts, the gold travels with the person.
            //
            // It still waits for a settled table: gold on the leader is a
            // verdict, and `pending > 0` means every share is split across a
            // shrunken denominator and reads high (#108).
            const isLeader = pending === 0 && row.user_id === leaderUserId
            const isViewer = viewerUserId !== null && row.user_id === viewerUserId
            return (
              <div
                key={row.user_id}
                // Cascade on the row, not on the sm:contents wrapper inside
                // it — see the note in app/leaderboard/page.tsx.
                style={{ "--index": i } as React.CSSProperties}
                className={
                  `${GRID} border-t border-border py-3 first:border-t-0 sm:items-center motion-safe:animate-rise-in motion-safe:stagger` +
                  (isLeader
                    ? " bg-gold-100"
                    : isViewer
                      ? " bg-indigo-50"
                      : "")
                }
              >
                <span
                  className={
                    "tabular text-sm font-bold " +
                    (isLeader ? "text-gold-700" : "text-text-muted")
                  }
                >
                  {i + 1}
                </span>
                <div className="flex min-w-0 items-center gap-1.5">
                  {/* Face + name + link to the profile, one tap target — the
                      same treatment every other name in the app carries (the
                      bet menu's pick labels, the reveal list, the activity
                      feed). `underline` because a hover-only affordance is
                      invisible on a phone, and this table is read on one. */}
                  <PlayerChip
                    userId={row.user_id}
                    displayName={row.display_name}
                    nickname={row.nickname}
                    avatarUrl={row.avatar_url}
                    underline
                    className="min-w-0"
                    nameClassName="text-sm font-semibold text-text-strong"
                  />
                  {/* Finding your own name in 32 rows on a phone is the first
                      thing anyone does with this table. */}
                  {isViewer && (
                    <span className="shrink-0 rounded-full bg-indigo-700 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white uppercase">
                      You
                    </span>
                  )}
                </div>
                {/* The four money columns wrap under the name on a phone,
                    each labelled since the header row is sm+ only; at sm+
                    `contents` dissolves this and they are columns again. */}
                <div className="col-start-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 pt-1 sm:contents">
                  <MoneyCell label="Entry">
                    <MoneyDisplay
                      value={row.entry_fee}
                      size="sm"
                      weight="regular"
                      className="text-text-muted"
                    />
                  </MoneyCell>
                  <MoneyCell label="Theo">
                    <MoneyDisplay
                      value={row.theoretical}
                      cents
                      size="sm"
                      weight="regular"
                      className="text-text-body"
                    />
                  </MoneyCell>
                  <MoneyCell label="Payout">
                    {/* actual + refunded: the cash that changes hands, not
                        the pool share alone (#157). A voided stake was
                        handed back out of band, so a row showing bare
                        `actual` read "$20 in, $10.00 back, −$4.00" — six
                        dollars unaccounted for, on the page people open to
                        find out what they are owed. With the refund folded
                        in, every row reconciles across, and the table agrees
                        with the settlement text that gets pasted into the
                        group thread. The Payout COLUMN SORTS on the same
                        figure, for the same reason. */}
                    <MoneyDisplay
                      value={cashReturned(row)}
                      cents
                      size="sm"
                      weight="bold"
                    />
                    {row.refunded > 0 && (
                      <span className="block text-[11px] font-normal text-text-muted">
                        incl.{" "}
                        <MoneyDisplay
                          value={row.refunded}
                          cents
                          size="xs"
                          weight="regular"
                          className="text-text-muted"
                        />{" "}
                        refunded
                      </span>
                    )}
                  </MoneyCell>
                  <MoneyCell label="P/L">
                    <MoneyDisplay
                      value={row.profit_loss}
                      cents
                      pl
                      size="sm"
                      weight="semibold"
                    />
                  </MoneyCell>
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
