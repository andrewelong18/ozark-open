// Unit tests for lib/settlement.ts — the copyable payout summary on /results.
// Zero-dependency by design: node:test via npm run test.
//
// Most of these drive buildResultsTable() rather than hand-building a
// ResultsTable, so the test exercises the real pipeline. If the payout math
// changes shape, these fail — which is correct: the summary is the thing 32
// people read their number off, so it should not be able to drift from the
// table silently.

import test from "node:test"
import assert from "node:assert/strict"
import { buildResultsTable, type PayoutRow, type ResultsParticipant } from "./payouts.ts"
import { buildSettlementSummary } from "./settlement.ts"

function participant(
  user_id: string,
  display_name: string,
  entry_fee: number
): ResultsParticipant {
  return { user_id, display_name, entry_fee }
}

let seq = 0
function placement(
  user_id: string,
  theoretical: number | null,
  refunded = 0
): PayoutRow {
  seq += 1
  return {
    placement_id: `p${seq}`,
    user_id,
    amount: 10,
    result: theoretical === null ? "pending" : refunded > 0 ? "void" : "hit",
    theoretical,
    refunded,
  }
}

// ---------------------------------------------------------------------------
// The shape people actually read
// ---------------------------------------------------------------------------

test("the header carries the tournament, the pool and the entry count", () => {
  const table = buildResultsTable(
    [participant("a", "Dan Smith", 20), participant("b", "Pat Leicht", 40)],
    [placement("a", 100)]
  )
  const text = buildSettlementSummary(table, "Ozark Open 2026")

  assert.match(text, /^Ozark Open 2026 — final payouts/)
  assert.match(text, /Pool \$60\.00 · 2 entries/)
})

test("one participant reads 'entry', not 'entries'", () => {
  const table = buildResultsTable([participant("a", "Solo", 20)], [placement("a", 50)])
  assert.match(buildSettlementSummary(table, "T"), /· 1 entry$/m)
})

test("every line reconciles: in − back equals the stated net", () => {
  // The property that matters. Someone WILL check one of these by hand in the
  // group text, and a line that doesn't add up is a support ticket.
  const table = buildResultsTable(
    [
      participant("a", "Dan Smith", 20),
      participant("b", "Steve Esswein", 20),
      participant("c", "Pat Leicht", 40),
    ],
    [placement("a", 200), placement("b", 100), placement("c", 50)]
  )
  const text = buildSettlementSummary(table, "T")

  const lineRe = /^\d+\. .+ — \$([\d.]+) in → \$([\d.]+) back \((even|[+−]\$[\d.]+)\)/gm
  const matches = [...text.matchAll(lineRe)]
  assert.equal(matches.length, 3, "expected one line per participant")

  for (const [, inStr, backStr, netStr] of matches) {
    const expected = Number(backStr) - Number(inStr)
    const actual =
      netStr === "even" ? 0 : Number(netStr.replace("−", "-").replace(/[+$]/g, ""))
    assert.ok(
      Math.abs(actual - expected) < 0.005,
      `line doesn't reconcile: ${inStr} in, ${backStr} back, net ${netStr}`
    )
  }
})

test("the order is buildResultsTable's, not a re-sort", () => {
  // The text and the page must agree — someone reading both would notice.
  const table = buildResultsTable(
    [
      participant("a", "Small", 20),
      participant("b", "Biggest", 20),
      participant("c", "Middle", 20),
    ],
    [placement("a", 10), placement("b", 500), placement("c", 100)]
  )
  const text = buildSettlementSummary(table, "T")

  const names = [...text.matchAll(/^\d+\. (.+?) —/gm)].map((m) => m[1])
  assert.deepEqual(names, table.rows.map((r) => r.display_name))
  assert.deepEqual(names, ["Biggest", "Middle", "Small"])
})

// ---------------------------------------------------------------------------
// Void refunds — the reason this module exists rather than a template string
// ---------------------------------------------------------------------------

test("a refunded stake is included in 'back' and named on the line", () => {
  // Pat has a $6 voided wager. The pool loses that $6; the $6 goes back to
  // him. /results shows `actual` under Payout and never shows `refunded`, so
  // "$40 in → <actual> back" would be short by exactly $6 and the net would
  // look wrong. This is the case the whole module is shaped around.
  const table = buildResultsTable(
    [participant("a", "Dan Smith", 20), participant("b", "Pat Leicht", 40)],
    [placement("a", 100), placement("b", 0, 6)]
  )
  const pat = table.rows.find((r) => r.display_name === "Pat Leicht")!
  assert.equal(pat.refunded, 6, "fixture should give Pat a voided stake")

  const text = buildSettlementSummary(table, "T")
  const line = text.split("\n").find((l) => l.includes("Pat Leicht"))!

  assert.match(line, /incl\. \$6\.00 returned from voided wagers/)
  // "back" is actual + refunded, so it exceeds the bare actual share.
  assert.match(line, new RegExp(`→ \\$${(pat.actual + 6).toFixed(2)} back`))
})

test("the refund note appears only on rows that have one", () => {
  const table = buildResultsTable(
    [participant("a", "Clean", 20), participant("b", "Voided", 20)],
    [placement("a", 100), placement("b", 0, 5)]
  )
  const text = buildSettlementSummary(table, "T")
  const notes = text.split("\n").filter((l) => l.includes("voided wagers"))
  assert.equal(notes.length, 1)
  assert.match(notes[0], /Voided/)
})

test("a refund is reflected in the pool, so the pool line shrinks too", () => {
  const table = buildResultsTable(
    [participant("a", "Dan", 20), participant("b", "Pat", 40)],
    [placement("a", 100), placement("b", 0, 6)]
  )
  // pool = 60 entry − 6 voided
  assert.match(buildSettlementSummary(table, "T"), /Pool \$54\.00/)
})

// ---------------------------------------------------------------------------
// The provisional guard — the caveat has to survive the paste
// ---------------------------------------------------------------------------

test("pending wagers put a PROVISIONAL warning inside the text", () => {
  const table = buildResultsTable(
    [participant("a", "Dan", 20), participant("b", "Pat", 20)],
    [placement("a", 100), placement("b", null)]
  )
  assert.equal(table.pending, 1)

  const text = buildSettlementSummary(table, "T")
  assert.match(text, /PROVISIONAL/)
  assert.match(text, /read HIGH/)
  assert.match(text, /Don't pay from this yet/)
})

test("the provisional warning is above the numbers, not trailing them", () => {
  // It has to be read before the figures are, including by someone who only
  // skims the first two lines of a pasted block.
  const table = buildResultsTable(
    [participant("a", "Dan", 20)],
    [placement("a", null)]
  )
  const text = buildSettlementSummary(table, "T")
  assert.ok(
    text.indexOf("PROVISIONAL") < text.indexOf("Pool "),
    "the warning must precede the pool and the rows"
  )
})

test("a bettor whose wagers are unscored isn't left looking like a loser", () => {
  // Their line would otherwise read "$20.00 in → $0.00 back (−$20.00)" —
  // indistinguishable from having lost everything. On the page the caution
  // card is adjacent; a pasted line travels alone and has to say so itself.
  const table = buildResultsTable(
    [participant("a", "Dan", 20), participant("b", "Unscored Sam", 20)],
    [placement("a", 100), placement("b", null), placement("b", null)]
  )
  const line = buildSettlementSummary(table, "T")
    .split("\n")
    .find((l) => l.includes("Unscored Sam"))!

  assert.match(line, /2 wagers of theirs not scored yet/)
})

test("the per-row pending note is singular for one, and absent when settled", () => {
  const one = buildResultsTable(
    [participant("a", "Dan", 20)],
    [placement("a", 30), placement("a", null)]
  )
  assert.match(buildSettlementSummary(one, "T"), /1 wager of theirs not scored yet/)

  const settled = buildResultsTable([participant("a", "Dan", 20)], [placement("a", 30)])
  assert.doesNotMatch(buildSettlementSummary(settled, "T"), /not scored yet/)
})

test("the warning pluralizes, and is absent from a settled table", () => {
  const two = buildResultsTable(
    [participant("a", "Dan", 20)],
    [placement("a", null), placement("a", null)]
  )
  assert.match(buildSettlementSummary(two, "T"), /2 wagers still have no result/)

  const one = buildResultsTable([participant("a", "Dan", 20)], [placement("a", null)])
  assert.match(buildSettlementSummary(one, "T"), /1 wager still has no result/)

  const settled = buildResultsTable([participant("a", "Dan", 20)], [placement("a", 30)])
  assert.doesNotMatch(buildSettlementSummary(settled, "T"), /PROVISIONAL/)
})

// ---------------------------------------------------------------------------
// Signs, rounding and the degenerate cases
// ---------------------------------------------------------------------------

test("a win carries an explicit +, a loss a real minus sign", () => {
  const table = buildResultsTable(
    [participant("a", "Winner", 20), participant("b", "Loser", 20)],
    [placement("a", 100)]
  )
  const text = buildSettlementSummary(table, "T")

  assert.match(text, /Winner — \$20\.00 in → \$40\.00 back \(\+\$20\.00\)/)
  // U+2212, not a hyphen — it has to read as a minus at text size.
  assert.match(text, /Loser — \$20\.00 in → \$0\.00 back \(−\$20\.00\)/)
})

test("breaking exactly even says 'even' rather than +$0.00", () => {
  const table = buildResultsTable(
    [participant("a", "Even Steven", 20)],
    [placement("a", 25)]
  )
  // Sole participant: pool 20, all theoretical is theirs, so actual = 20.
  assert.match(buildSettlementSummary(table, "T"), /Even Steven — \$20\.00 in → \$20\.00 back \(even\)/)
})

test("money always shows two decimals", () => {
  const table = buildResultsTable(
    [participant("a", "Dan", 20), participant("b", "Pat", 20), participant("c", "Jake", 20)],
    [placement("a", 100), placement("b", 100), placement("c", 100)]
  )
  const text = buildSettlementSummary(table, "T")
  // $20 each from a $60 pool split three ways — no ragged "$20" or "$20.0".
  for (const amount of text.match(/\$[\d.]+/g) ?? []) {
    assert.match(amount, /^\$\d+\.\d{2}$/, `ragged money value: ${amount}`)
  }
})

test("no participants returns an explanation, never an empty block", () => {
  const table = buildResultsTable([], [])
  const text = buildSettlementSummary(table, "Ozark Open 2026")
  assert.match(text, /^Ozark Open 2026 — final payouts/)
  assert.match(text, /Nobody was registered/)
})

test("a pool with no winning wagers still lists everyone", () => {
  // Nobody hit: sum_theoretical is 0, so every actual share is 0. The summary
  // still has to name all three and show each losing their entry.
  const table = buildResultsTable(
    [participant("a", "Dan", 20), participant("b", "Pat", 20), participant("c", "Jake", 20)],
    [placement("a", 0), placement("b", 0)]
  )
  const text = buildSettlementSummary(table, "T")
  const lines = text.split("\n").filter((l) => /^\d+\. /.test(l))
  assert.equal(lines.length, 3)
  for (const line of lines) assert.match(line, /→ \$0\.00 back \(−\$20\.00\)/)
})
