// Entry collection — what came in against what was owed.
//
// Pure module by design — no Supabase, no "@/" alias imports — so the
// node:test suite exercises the exact code the admin console and the
// settlement text run.
//
// THE ONE THING THIS MODULE MUST NOT DO is touch payout math. The pool is
// Σ entry fees − Σ voided stakes (ADR 0001 §9) whether or not the money
// arrived; a member who hasn't paid still funds it on paper. That is the whole
// reason an admin needs this view, and the reason nothing in lib/payouts.ts
// may ever import from here.
//
// It exists as one helper rather than two because the console and the
// settlement text answer the same question in two places, and this project has
// already paid once for letting two surfaces compute the same money
// differently (#157 — the results table and the settlement text disagreed
// about a refunded stake for three weeks).

/** The participant fields collection cares about. A superset of what the admin
 *  console reads, so rows can be passed straight through. */
export type CollectionParticipant = {
  display_name: string
  entry_fee: number
  /** Absent on a database that predates the column; treated as nothing paid. */
  paid_amount?: number | null
}

export type Outstanding = {
  name: string
  /** Entry fee minus what came in. Always > 0 — a settled row isn't listed. */
  owed: number
}

export type CollectionStanding = {
  /** Σ entry fees — what the pool is built from, paid or not. */
  expected: number
  /** Σ collected, capped per person at their fee so an overpayment can't
   *  disguise someone else's shortfall in the headline number. */
  collected: number
  /** Everyone still short, biggest gap first, ties by name. */
  outstanding: Outstanding[]
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
 * `collected` caps each person's contribution at their own entry fee on
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

  for (const p of participants) {
    const fee = Number(p.entry_fee) || 0
    const got = paid(p)
    expected += fee
    collected += Math.min(got, fee)
    if (got < fee) {
      outstanding.push({ name: p.display_name, owed: fee - got })
    }
  }

  outstanding.sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name))
  return { expected, collected, outstanding }
}

/** Has this member's entry been collected in full? */
export function isPaidInFull(participant: CollectionParticipant): boolean {
  return paid(participant) >= (Number(participant.entry_fee) || 0)
}

/** A typo guard, not a rule. Entry fees are $20–$50 by CHECK constraint, so a
 *  three-figure payment is a slipped keystroke far more often than a genuine
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
