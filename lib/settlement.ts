// The settlement summary — the last mile of the whole product.
//
// Everything the app does culminates in "who pays whom", and until now that
// step was somebody reading 32 rows off a phone at 11pm on Saturday and
// retyping them into a group text. Payment is Venmo, out of band (CLAUDE.md),
// so the app's job ends at *telling people the number* — and it wasn't doing
// that in any form you could send.
//
// Same move as lib/chase.ts at the other end of the weekend: notifications are
// out of scope, so the sanctioned answer is copyable text that goes into the
// group thread where the conversation already happens.
//
// Pure module by design — no Supabase, no "@/" alias imports — so the
// node:test suite exercises the exact code the page renders.
//
// This adds NO payout math. Every number comes from buildResultsTable(); this
// module only decides which of them a human needs to see and how to word it.
// If a figure here disagrees with the standings on the dashboard,
// lib/payouts.ts is the one that's right and this file is the bug.

import { roundCents, type ResultsTable,
  cashReturned,
} from "./payouts.ts"
import { DEFAULT_SORT, sortStandings } from "./standings.ts"
import type { CollectionStanding } from "./collection.ts"

/** U+2212 MINUS SIGN, matching MoneyDisplay rather than a hyphen. Reads as a
 *  minus at text size instead of as a dash between two numbers. */
const MINUS = "−"

/** Always two decimals: these are cents-exact payouts (PRD §12 Q5), and a
 *  trailing "$54.2" in a group text looks like a typo. */
function money(value: number): string {
  return `$${roundCents(value).toFixed(2)}`
}

/** A signed net, with an explicit + so a win never reads as a bare number.
 *  Zero is "even" — "+$0.00" invites a squint about whether it rounded. */
function signedNet(value: number): string {
  const rounded = roundCents(value)
  if (rounded === 0) return "even"
  return rounded > 0 ? `+${money(rounded)}` : `${MINUS}${money(Math.abs(rounded))}`
}

/**
 * Build the copyable summary.
 *
 * **NOT CURRENTLY RENDERED ANYWHERE** (Sept 8, 2026 / PRD §12 A22). The
 * member-facing "Send the payouts" card came off the dashboard once the
 * standings themselves became the channel. This function and its tests are kept
 * deliberately rather than by accident: they encode two money rules the project
 * has already paid for once — `actual + refunded` (#157) and the PROVISIONAL
 * caveat living inside the pasted string rather than on the page around it
 * (#108). Re-homing the text somewhere admin-only starts here; if that never
 * happens, delete this and its suite together.
 *
 * TWO things here are not cosmetic.
 *
 * 1. **What "gets back" means.** A voided stake is carved out of the pool
 *    (pool = Σ entry fees − Σ voided stakes) and returned to the bettor, so the
 *    cash they actually receive is `actual + refunded`, not `actual`. A line
 *    printing bare `actual` doesn't add up in a text that people PAY FROM:
 *
 *        $20 in → $10.00  (−$4.00)      ← where did $6 go?
 *
 *    So this prints the amount they actually get back, and names the refund
 *    explicitly on the rows that have one. The Payout COLUMN on the standings
 *    shows the same figure through the same cashReturned() helper — it didn't
 *    always, and the month it didn't is #157.
 *
 * 2. **A provisional split must not travel.** `pending > 0` means the
 *    tournament was finalized with unresolved picks, so every share is split
 *    across a shrunken denominator and reads HIGH (Sprint 25 / #108). The page
 *    already suppresses the winner spotlight for exactly this reason — "the
 *    screenshot that would travel". A copyable block travels further than a
 *    screenshot, so the warning goes INSIDE the text, not just on the page
 *    around it. The caveat has to survive the paste.
 */
export function buildSettlementSummary(
  table: ResultsTable,
  tournamentName: string
): string {
  const lines: string[] = []

  lines.push(`${tournamentName} — final payouts`)

  if (table.rows.length === 0) {
    // Not an empty string: a summary that renders as nothing looks like a bug,
    // and "why is the box blank" is a worse question than this answer.
    lines.push("")
    lines.push("Nobody was registered for this tournament.")
    return lines.join("\n")
  }

  if (table.pending > 0) {
    const n = table.pending
    lines.push("")
    lines.push(
      `PROVISIONAL — ${n} wager${n === 1 ? "" : "s"} still ${n === 1 ? "has" : "have"} no result. ` +
        `These numbers are split across only the settled wagers, so they read HIGH. Don't pay from this yet.`
    )
  }

  lines.push("")
  lines.push(
    `Pool ${money(table.pool)} · ${table.rows.length} ${table.rows.length === 1 ? "entry" : "entries"}`
  )
  lines.push("")

  // Profit/loss descending — the standings' order, through the standings' own
  // comparator, because the text and the table have to agree and someone
  // reading both would notice immediately.
  //
  // That rule is older than this line; what changed in Sprint 28 is which
  // order satisfies it. This used to take buildResultsTable's own order
  // (biggest payout first) untouched, which agreed with /results. /results is
  // now a redirect, the standings live on the dashboard ranked by P/L — Pat's
  // axis, "who won the most money" — and this block is pasted from directly
  // underneath them. Entry fees vary, so the two orders genuinely differ.
  sortStandings(table.rows, DEFAULT_SORT).forEach((row, i) => {
    const back = cashReturned(row)
    const parts = [
      `${i + 1}. ${row.display_name} — ${money(row.entry_fee)} in → ${money(back)} back (${signedNet(row.profit_loss)})`,
    ]
    if (roundCents(row.refunded) > 0) {
      parts.push(`incl. ${money(row.refunded)} returned from voided wagers`)
    }
    // Per-row pending, flagged on the row itself. Someone whose wagers are all
    // unscored reads as "$0.00 back (−$20.00)" — identical to having lost
    // everything. On the page the caution card sits right next to that number;
    // in a pasted block the line travels on its own, so it has to carry its
    // own caveat or it libels somebody.
    if (row.pending > 0) {
      parts.push(
        `${row.pending} wager${row.pending === 1 ? "" : "s"} of theirs not scored yet`
      )
    }
    lines.push(parts.join(", "))
  })

  return lines.join("\n")
}

/** Whole dollars, matching how entry money is entered and handed over. Cents
 *  belong to payouts; nobody Venmos $20.00 for an entry. */
function dollars(value: number): string {
  return `$${Math.round(value)}`
}

/**
 * The entry-collection block — **admin-only, and deliberately its own string.**
 *
 * It is NOT appended to `buildSettlementSummary()`, and that is the one
 * decision in this function worth defending. `/results` has no admin gate: the
 * settlement text is rendered to all ~32 members, and it sits behind a Copy
 * button pointed at the group thread. A "who still owes" block merged into it
 * would be published to everyone by a single tap, which is the opposite of
 * what an admin wants from it. So the page renders this as a second,
 * separately-copyable block that only an admin sees, and the text people are
 * paid from is byte-for-byte what it was.
 *
 * It still lives in this module rather than beside its component, for the
 * `cashReturned()` reason: the console and this text answer the same question,
 * and two surfaces computing the same money differently is a bug this project
 * has already shipped once (#157).
 *
 * Nothing here touches pool math. The pool is Σ entry fees whether or not the
 * money arrived (ADR 0001 §9) — see the header of lib/collection.ts.
 */
export function buildCollectionSummary(
  standing: CollectionStanding,
  tournamentName: string
): string {
  const lines: string[] = [`${tournamentName} — entry collection`, ""]

  if (standing.expected === 0) {
    lines.push("Nobody was registered for this tournament.")
    return lines.join("\n")
  }

  const short = standing.expected - standing.collected
  lines.push(
    `${dollars(standing.collected)} of ${dollars(standing.expected)} collected` +
      (short > 0 ? ` · ${dollars(short)} still out` : "")
  )

  if (standing.outstanding.length === 0) {
    lines.push("")
    lines.push("Every entry is in.")
    return lines.join("\n")
  }

  lines.push("")
  lines.push("Still owed:")
  // collectionStanding's order — biggest gap first, ties by name. Not
  // re-sorted, so the text and the console read the same way down the page.
  for (const person of standing.outstanding) {
    lines.push(`  ${person.name} — ${dollars(person.owed)}`)
  }

  return lines.join("\n")
}
