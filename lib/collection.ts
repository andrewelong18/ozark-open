// Entry collection — what came in against what was owed.
//
// Pure module by design — no Supabase, no "@/" alias imports — so the
// node:test suite exercises the exact code the admin console and the
// collection text run.
//
// THE ONE THING THIS MODULE MUST NOT DO is touch payout math. The pots are
// built from the entries (ADR 0001 §9, ADR 0002) whether or not the money
// arrived; a member who hasn't paid still funds them on paper. That is the
// whole reason an admin needs this view, and the reason nothing in
// lib/payouts.ts may ever import from here.
//
// Since Sprint 30 a member owes the SUM of their phase entries — one Venmo
// up front or one per phase, the app doesn't care which — and money that
// came in against a phase they aren't in any more is a refund Pat owes them
// (his rule 1), so it is listed rather than left to a spreadsheet in October.
//
// It exists as one helper rather than two because the console and the
// collection text answer the same question in two places, and this project
// has already paid once for letting two surfaces compute the same money
// differently (#157).

/** The participant fields collection cares about. A superset of what the admin
 *  console reads, so rows can be passed straight through. */
export type CollectionParticipant = {
  display_name: string
  phase1_entry_fee: number | string | null
  phase2_entry_fee: number | string | null
  /** Absent on a database that predates the column; treated as nothing paid. */
  paid_amount?: number | null
}

export type Outstanding = {
  name: string
  /** Entries minus what came in. Always > 0 — a settled row isn't listed. */
  owed: number
}

export type Overpaid = {
  name: string
  /** What came in beyond the entries. Always > 0. */
  amount: number
}

export type CollectionStanding = {
  /** Σ entries — what the pots are built from, paid or not. */
  expected: number
  /** Σ collected, capped per person at what they owe so an overpayment can't
   *  disguise someone else's shortfall in the headline number. */
  collected: number
  /** Everyone still short, biggest gap first, ties by name. */
  outstanding: Outstanding[]
  /** Everyone who paid more than they owe — refund them — biggest first. */
  overpaid: Overpaid[]
}

function fee(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** What a member owes: the sum of the phase entries they are in. Zero when
 *  no entry has been recorded yet. */
export function entryOwed(
  participant: Pick<CollectionParticipant, "phase1_entry_fee" | "phase2_entry_fee">
): number {
  return fee(participant.phase1_entry_fee) + fee(participant.phase2_entry_fee)
}

/** Whole dollars, and never negative — a missing column reads as unpaid. */
function paid(participant: CollectionParticipant): number {
  const raw = Number(participant.paid_amount ?? 0)
  if (!Number.isFinite(raw) || raw < 0) return 0
  return raw
}

/**
 * The collection standing across a roster.
 *
 * `collected` caps each person's contribution at their own entries on
 * purpose: if one member overpays by $20 and another hasn't paid at all, the
 * uncapped sum would read "fully collected" while $20 is genuinely missing.
 * The headline has to be able to say the pool is short.
 */
export function collectionStanding(
  participants: CollectionParticipant[]
): CollectionStanding {
  let expected = 0
  let collected = 0
  const outstanding: Outstanding[] = []
  const overpaid: Overpaid[] = []

  for (const p of participants) {
    const owed = entryOwed(p)
    const got = paid(p)
    expected += owed
    collected += Math.min(got, owed)
    if (got < owed) {
      outstanding.push({ name: p.display_name, owed: owed - got })
    } else if (got > owed) {
      overpaid.push({ name: p.display_name, amount: got - owed })
    }
  }

  outstanding.sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name))
  overpaid.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
  return { expected, collected, outstanding, overpaid }
}

/** Has this member's entry been collected in full? Nobody with no entry
 *  recorded is "paid in full" — there is nothing to have paid for. */
export function isPaidInFull(participant: CollectionParticipant): boolean {
  const owed = entryOwed(participant)
  return owed > 0 && paid(participant) >= owed
}

/** A typo guard, not a rule. Two phases at $50 each is $100, so a three-figure
 *  payment past this is a slipped keystroke far more often than a genuine
 *  overpayment — but overpayment IS representable, because it happens. */
export const MAX_RECORDED_PAYMENT = 200

export type PaidAmountResult =
  | { ok: true; amount: number }
  | { ok: false; error: string }

/**
 * Validate an admin-entered payment. Whole dollars, like every other money
 * input in this app (PRD §7 rule 3) — cents live in payouts, never in what
 * someone hands you.
 */
export function parsePaidAmount(value: unknown): PaidAmountResult {
  if (value === "" || value === null || value === undefined) {
    return { ok: false, error: "Enter an amount, or 0 if nothing has come in." }
  }
  const amount = Number(value)
  if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
    return { ok: false, error: "Payments are recorded in whole dollars." }
  }
  if (amount < 0) {
    return { ok: false, error: "A payment can't be negative." }
  }
  if (amount > MAX_RECORDED_PAYMENT) {
    return {
      ok: false,
      error: `$${amount} looks like a typo — the most that can be recorded is $${MAX_RECORDED_PAYMENT}.`,
    }
  }
  return { ok: true, amount }
}
