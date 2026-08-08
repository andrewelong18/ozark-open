// Pick ordering for the bet menu (Sprint 24 / #105).
//
// Pure module by design — no Supabase, no "@/" alias imports — so the
// comparator is unit-tested rather than trusted.
//
// THE BUG THIS FIXES. app/bets/page.tsx fetched bet_picks as a nested select
// with no ORDER BY at any layer — not in the query, not after the fetch. Pick
// order was whatever Postgres happened to return. It usually matched insertion
// order, so the sheet's row order APPEARED to be honoured, but that was
// incidental: an upsert that rewrites a row can reshuffle it mid-tournament,
// under people who are looking at the menu.
//
// It was also the only page that did this. /my-bets and /admin/view both sort
// by sheet_pick_id, so a bet's picks could appear in one order on the menu and
// another everywhere else in the app.
//
// THE ORDER. Favourites first, so a bet reads best-to-worst however the
// spreadsheet was typed, with sheet_pick_id breaking ties — which is what
// makes it deterministic across re-uploads.
//
// WHERE IT APPLIES — /bets ONLY. #105 left this open; Sprint 24 settled it.
// /my-bets and /admin/view keep sheet_pick_id, for reasons specific to each:
//
//   - /admin/view is a replica of the admin's View sheet. Its whole job is to
//     show what the spreadsheet shows, so re-ordering it would defeat the page.
//   - /my-bets lists only the picks you actually wagered on — a partial set.
//     Favourites-first over a partial set sorts an arbitrary subset and reads
//     as noise; sheet order at least stays stable between visits.
//
// The menu is the one surface where you scan a bet's FULL slate to choose,
// which is the only place best-to-worst earns its keep.
//
// This ordering is applied once, server-side, in app/bets/page.tsx (groupBets).
// components/betting/bets-menu.tsx must NOT re-sort — it did until Sprint 24,
// by sheet_pick_id, which silently overrode every bit of this.

/**
 * Implied probability from the American price.
 *
 * Derived from american_odds rather than the sheet's `probability` column on
 * purpose: american_odds is the payout-math field and is always present
 * (§3.6 rejects zero), while `probability` is a verbatim display value that
 * the sheet may leave blank (ADR 0001 §8).
 */
export function impliedProbability(americanOdds: number): number {
  if (americanOdds > 0) return 100 / (americanOdds + 100)
  if (americanOdds < 0)
    return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100)
  // Zero is not a valid price and the importer rejects it; treat it as the
  // longest possible shot rather than throwing inside a render.
  return 0
}

/** The minimum a pick has to expose to be ordered. */
export type OrderablePick = { american_odds: number; sheet_pick_id: number }

/** Favourites first, then sheet order. Comparator only — no mutation. */
export function comparePicks(a: OrderablePick, b: OrderablePick): number {
  return (
    impliedProbability(b.american_odds) - impliedProbability(a.american_odds) ||
    a.sheet_pick_id - b.sheet_pick_id
  )
}

/** A new array, favourites first. */
export function sortPicks<T extends OrderablePick>(picks: T[]): T[] {
  return [...picks].sort(comparePicks)
}
