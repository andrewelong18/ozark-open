// The entry-collection block — the admin's "who still owes" text.
//
// This module used to also hold buildSettlementSummary(), the member-facing
// "send the payouts" block. That text retired with PRD §12 A22 (the standings
// on the dashboard became the channel) and sat here uncalled for a week
// (#210); Sprint 30 deleted it rather than rewrite it for a money model
// nobody renders it under. What survives is the ADMIN block below, which
// answers a different question and was always a separate string.
//
// Same move as lib/chase.ts at the other end of the weekend: notifications
// are out of scope, so the sanctioned answer is copyable text that goes into
// the group thread where the conversation already happens.
//
// Pure module by design — no Supabase, no "@/" alias imports — so the
// node:test suite exercises the exact code the page renders.

import type { CollectionStanding } from "./collection.ts"

/** Whole dollars, matching how entry money is entered and handed over. Cents
 *  belong to payouts; nobody Venmos $20.00 for an entry. */
function dollars(value: number): string {
  return `$${Math.round(value)}`
}

/**
 * The entry-collection block — **admin-only, and deliberately its own string.**
 *
 * The standings board has no admin gate: it is the dashboard once the book
 * closes. A "who still owes" block merged into anything member-visible would
 * be published to everyone by a single tap, which is the opposite of what an
 * admin wants from it. So the page renders this as a separately-copyable
 * block that only an admin sees.
 *
 * It lives in this module rather than beside its component because the
 * console and this text answer the same question, and two surfaces computing
 * the same money differently is a bug this project has already shipped once
 * (#157).
 *
 * Nothing here touches pool math. The pots are built from the entries
 * whether or not the money arrived (ADR 0001 §9, ADR 0002) — see the header of
 * lib/collection.ts.
 */
export function buildCollectionSummary(
  standing: CollectionStanding,
  tournamentName: string
): string {
  const lines: string[] = [`${tournamentName} — entry collection`, ""]

  if (standing.expected === 0) {
    lines.push("Nobody has an entry recorded for this tournament.")
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
  } else {
    lines.push("")
    lines.push("Still owed:")
    // collectionStanding's order — biggest gap first, ties by name. Not
    // re-sorted, so the text and the console read the same way down the page.
    for (const person of standing.outstanding) {
      lines.push(`  ${person.name} — ${dollars(person.owed)}`)
    }
  }

  // Money that came in against a phase the member isn't in any more, or more
  // than they owe — Pat's rule 1: refunded. Named so the admin can Venmo it
  // back rather than discover it in a spreadsheet in October.
  if (standing.overpaid.length > 0) {
    lines.push("")
    lines.push("Paid more than their entry — refund:")
    for (const person of standing.overpaid) {
      lines.push(`  ${person.name} — ${dollars(person.amount)}`)
    }
  }

  return lines.join("\n")
}
