// Unit tests for lib/closed-bets.ts — the pure half of the /bets closed
// branch: result mapping, settled derivation, and everyone's-placements
// normalization + grouping. Zero-dependency by design: node:test via
// npm run test.

import test from "node:test"
import assert from "node:assert/strict"
import {
  groupPlacementsByPick,
  isBetSettled,
  normalizeClosedPlacements,
  summarizeBetReveal,
  toResult,
  type ClosedPlacementQueryRow,
} from "./closed-bets.ts"

// ---------------------------------------------------------------------------
// toResult
// ---------------------------------------------------------------------------

test("toResult passes through every whitelisted value", () => {
  for (const r of ["pending", "hit", "miss", "push", "void"] as const) {
    assert.equal(toResult(r), r)
  }
})

test("toResult falls back to pending on unknown strings", () => {
  assert.equal(toResult("won"), "pending")
  assert.equal(toResult(""), "pending")
  assert.equal(toResult("HIT"), "pending")
})

// ---------------------------------------------------------------------------
// isBetSettled — derived, never stored
// ---------------------------------------------------------------------------

test("a bet is settled only when every pick has a non-pending result", () => {
  assert.equal(
    isBetSettled([{ result: "hit" }, { result: "miss" }, { result: "push" }]),
    true
  )
  assert.equal(isBetSettled([{ result: "hit" }, { result: "pending" }]), false)
})

test("an all-void bet is settled", () => {
  assert.equal(isBetSettled([{ result: "void" }, { result: "void" }]), true)
})

test("a bet with no picks is not settled", () => {
  assert.equal(isBetSettled([]), false)
})

test("unknown result strings read as pending, so the bet stays unsettled", () => {
  assert.equal(isBetSettled([{ result: "hit" }, { result: "winner" }]), false)
})

// ---------------------------------------------------------------------------
// normalizeClosedPlacements
// ---------------------------------------------------------------------------

function row(overrides: {
  pick_id?: string
  user_id?: string
  amount?: number
  users?: ClosedPlacementQueryRow["users"]
  asArray?: boolean
}): ClosedPlacementQueryRow {
  const user = { display_name: "Dan Mercer" }
  return {
    pick_id: overrides.pick_id ?? "p-1",
    user_id: overrides.user_id ?? "u-1",
    amount: overrides.amount ?? 10,
    users:
      overrides.users !== undefined
        ? overrides.users
        : overrides.asArray
          ? [user]
          : user,
  }
}

test("normalize flattens object-shaped and array-shaped user joins", () => {
  const rows = [
    row({ user_id: "u-1" }),
    row({ user_id: "u-2", users: [{ display_name: "Pat" }] }),
  ]
  assert.deepEqual(normalizeClosedPlacements(rows), [
    {
      pick_id: "p-1",
      user_id: "u-1",
      display_name: "Dan Mercer",
      nickname: null,
      avatar_url: null,
      amount: 10,
    },
    {
      pick_id: "p-1",
      user_id: "u-2",
      display_name: "Pat",
      nickname: null,
      avatar_url: null,
      amount: 10,
    },
  ])
})

test("normalize carries nickname + avatar_url through, defaulting missing to null", () => {
  const rows = [
    row({
      user_id: "u-1",
      users: {
        display_name: "Dan Mercer",
        nickname: "Merc",
        avatar_url: "https://x/avatars/u-1/avatar",
      },
    }),
    row({ user_id: "u-2", users: { display_name: "Pat" } }),
  ]
  const out = normalizeClosedPlacements(rows)
  assert.equal(out[0].nickname, "Merc")
  assert.equal(out[0].avatar_url, "https://x/avatars/u-1/avatar")
  assert.equal(out[1].nickname, null)
  assert.equal(out[1].avatar_url, null)
})

test("normalize coerces string numerics from PostgREST", () => {
  const rows = [
    row({ amount: "25" as unknown as number }),
  ]
  assert.equal(normalizeClosedPlacements(rows)[0].amount, 25)
})

test("normalize keeps rows with an unreadable user join, with a placeholder name", () => {
  const rows = [
    row({ users: null }),
    row({ users: [] }),
  ]
  const out = normalizeClosedPlacements(rows)
  assert.equal(out.length, 2)
  assert.equal(out[0].display_name, "Unknown bettor")
  assert.equal(out[1].display_name, "Unknown bettor")
})

// ---------------------------------------------------------------------------
// groupPlacementsByPick
// ---------------------------------------------------------------------------

test("grouping keys by pick, sorts biggest stake first with name tiebreak, and totals", () => {
  const placements = normalizeClosedPlacements([
    row({ pick_id: "p-1", user_id: "u-1", amount: 5, users: { display_name: "Pat" } }),
    row({ pick_id: "p-2", user_id: "u-2", amount: 8, users: { display_name: "Jake" } }),
    row({ pick_id: "p-1", user_id: "u-3", amount: 12, users: { display_name: "Andrew" } }),
    row({ pick_id: "p-1", user_id: "u-4", amount: 5, users: { display_name: "Dan" } }),
  ])
  const byPick = groupPlacementsByPick(placements)

  assert.deepEqual(Object.keys(byPick).sort(), ["p-1", "p-2"])
  assert.equal(byPick["p-1"].total, 22)
  assert.deepEqual(
    byPick["p-1"].placements.map((p) => p.display_name),
    ["Andrew", "Dan", "Pat"]
  )
  assert.equal(byPick["p-2"].total, 8)
})

test("grouping an empty list yields no picks", () => {
  assert.deepEqual(groupPlacementsByPick([]), {})
})

test("picks nobody bet on are simply absent from the grouping", () => {
  const byPick = groupPlacementsByPick(
    normalizeClosedPlacements([row({ pick_id: "p-9" })])
  )
  assert.equal(byPick["p-1"], undefined)
  assert.equal(byPick["p-9"].total, 10)
})

// ---------------------------------------------------------------------------
// summarizeBetReveal (#103) — the collapsed accordion's one-liner
// ---------------------------------------------------------------------------

test("reveal summary counts bettors and totals the money", () => {
  const byPick = groupPlacementsByPick(
    normalizeClosedPlacements([
      row({ pick_id: "p-1", user_id: "u-1", amount: 5 }),
      row({ pick_id: "p-1", user_id: "u-2", amount: 12 }),
      row({ pick_id: "p-2", user_id: "u-3", amount: 8 }),
    ])
  )
  assert.deepEqual(summarizeBetReveal(["p-1", "p-2"], byPick), {
    bettorCount: 3,
    total: 25,
  })
})

test("reveal summary counts a person once across a multi-pick bet", () => {
  // THE BUG THIS PINS. Top Finisher lets one person back several picks.
  // Summing the per-pick lists would report 4 bettors for two people.
  const byPick = groupPlacementsByPick(
    normalizeClosedPlacements([
      row({ pick_id: "p-1", user_id: "u-1", amount: 5 }),
      row({ pick_id: "p-2", user_id: "u-1", amount: 5 }),
      row({ pick_id: "p-3", user_id: "u-1", amount: 5 }),
      row({ pick_id: "p-1", user_id: "u-2", amount: 10 }),
    ])
  )
  const summary = summarizeBetReveal(["p-1", "p-2", "p-3"], byPick)
  assert.equal(summary.bettorCount, 2)
  // The money still sums — every stake is its own money.
  assert.equal(summary.total, 25)
})

test("reveal summary reads zero for a bet nobody wagered on", () => {
  // A closed bet with no takers still renders; the collapsed row has to say
  // something sensible rather than "0 bettors · $0" by accident of arithmetic.
  assert.deepEqual(summarizeBetReveal(["p-1", "p-2"], {}), {
    bettorCount: 0,
    total: 0,
  })
})

test("reveal summary ignores picks outside the bet", () => {
  const byPick = groupPlacementsByPick(
    normalizeClosedPlacements([
      row({ pick_id: "p-1", user_id: "u-1", amount: 5 }),
      row({ pick_id: "other", user_id: "u-9", amount: 99 }),
    ])
  )
  assert.deepEqual(summarizeBetReveal(["p-1"], byPick), {
    bettorCount: 1,
    total: 5,
  })
})

test("reveal summary handles a bet with no picks at all", () => {
  assert.deepEqual(summarizeBetReveal([], {}), { bettorCount: 0, total: 0 })
})
