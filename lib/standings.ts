// The Final Standings sort model (Sprint 28 / #198) — column keys, comparators,
// and the pinned-leader rule. NOTHING here computes money.
//
// Every number this module orders comes from lib/payouts.ts:buildResultsTable(),
// which already implements Pat's formula and returns his exact six fields. This
// file decides only what order the rows appear in, so that a disagreement
// between the standings and the payout math is impossible by construction.
//
// Pure module by design — no Supabase, no "@/" alias imports — so the node:test
// suite exercises the exact code the page runs.
//
// NAMING: "leaderboard" is taken. lib/leaderboard.ts and /leaderboard are the
// GOLF standings, mirrored from a Google Sheet tab named, literally, "Sportsbook
// Leaderboard". These are the SPORTSBOOK standings — who won the most money.
// The on-screen heading is "Final Standings"; renaming that heading later must
// not rename this module.

import { cashReturned, type ResultsRow } from "./payouts.ts"

/** The six columns of Pat's written schema, in his order. `rank` is the `#`
 *  column, which is not a value but a reset — see nextSort(). */
export type StandingsColumn =
  | "rank"
  | "display_name"
  | "entry_fee"
  | "theoretical"
  | "payout"
  | "profit_loss"

export type SortDirection = "asc" | "desc"

export type StandingsSort = {
  column: StandingsColumn
  direction: SortDirection
}

/**
 * Profit/Loss descending — Pat's written default: "sorted by profit/loss
 * descending by default".
 *
 * Note this is NOT buildResultsTable()'s own order, which is `actual`
 * descending. That order still serves /admin/view; this one is what members
 * read. Entry fees vary, so the two genuinely differ.
 */
export const DEFAULT_SORT: StandingsSort = {
  column: "profit_loss",
  direction: "desc",
}

/** Column header labels, so the table and any future consumer can't drift. */
export const COLUMN_LABELS: Record<StandingsColumn, string> = {
  rank: "#",
  display_name: "Player",
  entry_fee: "Entry",
  theoretical: "Theo",
  payout: "Payout",
  profit_loss: "P/L",
}

/**
 * The value a column sorts on.
 *
 * `payout` is cashReturned(row) = actual + refunded, NEVER bare `actual`.
 * That is #157: a voided stake is carved out of the pool AND handed back, so a
 * bettor with a $6 void read "$20 in → $10.00 back, −$4.00" and six dollars
 * vanished off the page people open to find out what they are owed. Sorting by
 * a number the column doesn't display would reopen it from the other side.
 */
function sortValue(row: ResultsRow, column: StandingsColumn): number {
  switch (column) {
    case "entry_fee":
      return row.entry_fee
    case "theoretical":
      return row.theoretical
    case "payout":
      return cashReturned(row)
    case "profit_loss":
      return row.profit_loss
    case "rank":
    case "display_name":
      return 0
  }
}

/**
 * Order the rows for display. Returns a new array; the input is never mutated.
 *
 * `display_name` ascending is the universal tie-break, and it stays ascending
 * even under a descending sort — two people on exactly $0.00 should read
 * alphabetically both ways round, not reverse-alphabetically half the time.
 */
export function sortStandings(
  rows: ResultsRow[],
  sort: StandingsSort = DEFAULT_SORT
): ResultsRow[] {
  const factor = sort.direction === "desc" ? -1 : 1
  return [...rows].sort((a, b) => {
    if (sort.column !== "rank" && sort.column !== "display_name") {
      const delta = sortValue(a, sort.column) - sortValue(b, sort.column)
      if (delta !== 0) return delta * factor
      return a.display_name.localeCompare(b.display_name)
    }
    if (sort.column === "display_name") {
      const byName = a.display_name.localeCompare(b.display_name)
      if (byName !== 0) return byName * factor
      return 0
    }
    // `rank` never actually sorts — nextSort() turns a click on it into the
    // default — but ordering by the default here keeps the function total.
    const delta = a.profit_loss - b.profit_loss
    if (delta !== 0) return -delta
    return a.display_name.localeCompare(b.display_name)
  })
}

/**
 * What clicking a header does.
 *
 * Clicking the active column flips its direction. Clicking a new money column
 * starts descending (the interesting end of money is the big end); a new
 * `display_name` starts ascending. Clicking `#` restores the P/L default —
 * that is the way back, and it is why the rank column is clickable at all.
 */
export function nextSort(
  current: StandingsSort,
  column: StandingsColumn
): StandingsSort {
  if (column === "rank") return DEFAULT_SORT
  if (current.column === column) {
    return { column, direction: current.direction === "desc" ? "asc" : "desc" }
  }
  return { column, direction: column === "display_name" ? "asc" : "desc" }
}

/**
 * The winner — highest profit/loss, ties by name.
 *
 * THE ONE NON-OBVIOUS RULE IN THIS FEATURE: this is PINNED to P/L descending
 * and does NOT follow the viewer's active sort. The spotlight and the gold row
 * are a verdict about who won, not a highlight of whichever row happens to sit
 * at the top of the list right now. Let it follow the sort and sorting by Entry
 * Fee crowns whoever paid the most.
 *
 * Returns null for an empty table, and for a provisional one the CALLER
 * suppresses the spotlight and the gold row anyway (#108) — gold on the leader
 * is a verdict too, and it waits until the ordering is settled.
 */
export function standingsLeader(rows: ResultsRow[]): ResultsRow | null {
  return sortStandings(rows, DEFAULT_SORT)[0] ?? null
}
