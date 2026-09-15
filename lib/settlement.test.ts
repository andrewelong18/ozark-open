// Unit tests for lib/settlement.ts — the admin-only entry-collection text.
// Zero-dependency by design: node:test via npm run test.
//
// The member-facing settlement text is gone (PRD §12 A22, #210 — deleted in
// Sprint 30), so this suite is about the one string that survives: who still
// owes, and who is owed a refund.

import test from "node:test"
import assert from "node:assert/strict"
import { buildCollectionSummary } from "./settlement.ts"
import { collectionStanding } from "./collection.ts"

function person(
  display_name: string,
  entries: { p1?: number | null; p2?: number | null },
  paid_amount: number
) {
  return {
    display_name,
    phase1_entry_fee: entries.p1 ?? null,
    phase2_entry_fee: entries.p2 ?? null,
    paid_amount,
  }
}

test("the collection block names the gap and who it's from", () => {
  const text = buildCollectionSummary(
    collectionStanding([
      person("Paid Pat", { p1: 30 }, 30),
      person("Half Hayden", { p1: 30 }, 12),
      person("Owes Olivia", { p1: 20 }, 0),
    ]),
    "Ozark Open 2026"
  )
  assert.match(text, /^Ozark Open 2026 — entry collection$/m)
  assert.match(text, /\$42 of \$80 collected · \$38 still out/)
  // The order is collectionStanding's, biggest gap first — not re-sorted.
  assert.ok(text.indexOf("Owes Olivia — $20") < text.indexOf("Half Hayden — $18"))
  assert.doesNotMatch(text, /refund/)
})

test("both phases count toward what is owed", () => {
  const text = buildCollectionSummary(
    collectionStanding([person("Both Bev", { p1: 20, p2: 30 }, 20)]),
    "T"
  )
  assert.match(text, /\$20 of \$50 collected · \$30 still out/)
  assert.match(text, /Both Bev — \$30/)
})

test("fully collected says so instead of printing an empty list", () => {
  const text = buildCollectionSummary(
    collectionStanding([person("Paid Pat", { p1: 30 }, 30)]),
    "T"
  )
  assert.match(text, /\$30 of \$30 collected/)
  assert.doesNotMatch(text, /still out/)
  assert.match(text, /Every entry is in\./)
  assert.doesNotMatch(text, /Still owed:/)
})

test("money paid beyond the entries is listed as a refund (Pat's rule 1)", () => {
  const text = buildCollectionSummary(
    collectionStanding([
      person("Skipped Sam", { p1: 20 }, 40),
      person("Paid Pat", { p1: 30 }, 30),
    ]),
    "T"
  )
  assert.match(text, /Every entry is in\./)
  assert.match(text, /Paid more than their entry — refund:/)
  assert.match(text, /Skipped Sam — \$20/)
})

test("an empty roster reads as a sentence, not a blank block", () => {
  const text = buildCollectionSummary(collectionStanding([]), "T")
  assert.match(text, /Nobody has an entry recorded/)
})
