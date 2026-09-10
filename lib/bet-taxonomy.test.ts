// Unit tests for lib/bet-taxonomy.ts — the menu's vocabulary.
//
// These are cheap and they exist because three filter rows now read their
// options straight out of this file. A typo here is a chip that selects nothing
// on every page, in every phase, with nothing else to catch it.

import { test } from "node:test"
import assert from "node:assert/strict"

import {
  CATEGORIES,
  ROUNDS_BY_PHASE,
  ROUND_LABEL,
  ROUND_ORDER,
  categoryRank,
  isCategory,
  roundRank,
} from "./bet-taxonomy.ts"

test("the five categories are exactly PRD §6's, in menu order", () => {
  assert.deepEqual(CATEGORIES, [
    "Top Finisher",
    "Top X Finisher",
    "Match",
    "Group Match",
    "Prop Bet",
  ])
})

test("Medalist is not a category (Pat, Sept 10 2026)", () => {
  assert.equal(isCategory("Medalist"), false)
  assert.equal(isCategory("Top Finisher"), true)
})

test("no phase offers the other phase's round (ADR 0001 §4)", () => {
  assert.ok(!ROUNDS_BY_PHASE[1].includes("round_3"))
  assert.ok(!ROUNDS_BY_PHASE[2].includes("round_1"))
})

test("Tournament is the only round both phases hold", () => {
  const shared = ROUNDS_BY_PHASE[1].filter((r) => ROUNDS_BY_PHASE[2].includes(r))
  assert.deepEqual(shared, ["tournament"])
})

test("round_2 is never offered — no Round 2 bets are released by policy", () => {
  assert.ok(!ROUNDS_BY_PHASE[1].includes("round_2"))
  assert.ok(!ROUNDS_BY_PHASE[2].includes("round_2"))
  // ...but it still labels and sorts, so a stray row wouldn't fall off the page.
  assert.equal(ROUND_LABEL.round_2, "Round 2")
  assert.ok(ROUND_ORDER.includes("round_2"))
})

test("every offerable round has a label and a rank", () => {
  for (const round of [...ROUNDS_BY_PHASE[1], ...ROUNDS_BY_PHASE[2]]) {
    assert.equal(typeof ROUND_LABEL[round], "string", round)
    assert.ok(roundRank(round) < ROUND_ORDER.length, round)
  }
})

test("unknown rounds and categories rank last rather than first", () => {
  assert.equal(roundRank("round_9"), ROUND_ORDER.length)
  assert.equal(categoryRank("Medalist"), CATEGORIES.length)
  assert.equal(categoryRank("Top Finisher"), 0)
})
