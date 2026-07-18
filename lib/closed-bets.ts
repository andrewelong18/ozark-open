// Closed-bet read path (Sprint 6): everything the /bets closed branch needs
// beyond straight Supabase glue — placement join normalization, per-pick
// grouping of everyone's wagers, result-badge mapping, and the derived
// settled state ("resolved" is never stored — ADR 0001).
//
// Pure module by design — no Supabase, no "@/" alias imports — so the
// node:test suite exercises the exact code the page runs.

// ---------------------------------------------------------------------------
// Result mapping — the sheet's per-pick result, whitelisted for the badge
// ---------------------------------------------------------------------------

export type PickResult = "pending" | "hit" | "miss" | "push" | "void"

const RESULTS: readonly PickResult[] = ["pending", "hit", "miss", "push", "void"]

/** Coerce a raw result string to the badge union; unknown values render as
 * pending (no badge) rather than crashing the menu on a bad upload. */
export function toResult(result: string): PickResult {
  return (RESULTS as readonly string[]).includes(result)
    ? (result as PickResult)
    : "pending"
}

/**
 * A bet reads as settled when every pick's result has been uploaded —
 * derived at render, never stored. A closed bet with no picks isn't
 * settled; it's malformed, and "closed" is the honest badge.
 */
export function isBetSettled(picks: { result: string }[]): boolean {
  return picks.length > 0 && picks.every((p) => toResult(p.result) !== "pending")
}

// ---------------------------------------------------------------------------
// Everyone's placements — supabase-js returns to-one joins as object OR
// one-element array (same caveat as lib/placements.ts / lib/my-bets.ts).
// ---------------------------------------------------------------------------

function one<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

type UserJoin = { display_name: string }

/** Raw shape of the closed-bet placements query
 * (bet_placements → users, scoped by pick_id). */
export type ClosedPlacementQueryRow = {
  pick_id: string
  user_id: string
  amount: number
  users: UserJoin | UserJoin[] | null
}

/** One bettor's wager on one pick, flattened for display. */
export type ClosedPlacement = {
  pick_id: string
  user_id: string
  display_name: string
  amount: number
}

/**
 * Flatten the everyone's-placements rows for display. PostgREST may
 * serialize numerics as strings, so amount is coerced. A missing users
 * join keeps the row — the money is real even if the name can't be read —
 * with a placeholder name.
 */
export function normalizeClosedPlacements(
  rows: ClosedPlacementQueryRow[]
): ClosedPlacement[] {
  return rows.map((row) => ({
    pick_id: row.pick_id,
    user_id: row.user_id,
    display_name: one(row.users)?.display_name ?? "Unknown bettor",
    amount: Number(row.amount),
  }))
}

/** Everyone's wagers on one pick, plus the aggregate the header shows
 * (visible only after close — PRD §12 Q11). */
export type PickPlacements = {
  placements: ClosedPlacement[]
  total: number
}

/**
 * Group placements by pick for the closed-bet card: biggest stake first,
 * ties by name, with the per-pick dollar total. Picks nobody bet on are
 * simply absent.
 */
export function groupPlacementsByPick(
  placements: ClosedPlacement[]
): Record<string, PickPlacements> {
  const byPick: Record<string, PickPlacements> = {}
  for (const placement of placements) {
    ;(byPick[placement.pick_id] ??= { placements: [], total: 0 }).placements.push(
      placement
    )
  }
  for (const group of Object.values(byPick)) {
    group.placements.sort(
      (a, b) =>
        b.amount - a.amount || a.display_name.localeCompare(b.display_name)
    )
    group.total = group.placements.reduce((sum, p) => sum + p.amount, 0)
  }
  return byPick
}
