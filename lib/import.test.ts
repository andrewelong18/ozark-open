// Sprint 22 (#97): the two import guards that stop a spreadsheet publishing
// verdicts onto a live book.
//
// Fixtures are CSV text through the real parseSheet, so these exercise the
// same path an uploaded file takes — only the .xlsx decoding differs, and
// that half is covered by scripts/import-roundtrip.ts against the reference
// sheet. Cross-field checks only; the per-cell contract is exercised by the
// round-trip harness and by X-broken.xlsx in the dry run.

import test from "node:test"
import assert from "node:assert/strict"

import { parseSheet, validateSheet } from "./import.ts"

const CATEGORIES = ["Top Finisher", "Match", "Prop Bet"]

const HEADER =
  "phase,status,round,category,bet_id,pick_id,bet,pick," +
  "american_odds,fractional_odds,probability,total_probability,result"

type RowSpec = {
  phase?: 1 | 2
  status?: string
  betId?: number
  pickId: number
  result?: string
  title?: string
}

function row(spec: RowSpec): string {
  const {
    phase = 1,
    status = "open",
    betId = 1,
    pickId,
    result = "Pending",
    title = `Bet ${betId}`,
  } = spec
  return [
    phase,
    status,
    "Round 1",
    "Top Finisher",
    betId,
    pickId,
    title,
    `Pick ${pickId}`,
    110,
    "11/10",
    0.476,
    1,
    result,
  ].join(",")
}

async function validate(specs: RowSpec[]) {
  const csv = [HEADER, ...specs.map(row)].join("\n")
  const parsed = await parseSheet(Buffer.from(csv, "utf-8"), "sheet.csv")
  return validateSheet(parsed, CATEGORIES)
}

// ---------------------------------------------------------------------------
// Hard block — a result on a bet that isn't closed
// ---------------------------------------------------------------------------

test("results on an OPEN bet reject the file, with the row called out", async () => {
  const result = await validate([
    { pickId: 1, result: "Hit" },
    { pickId: 2, result: "Miss" },
  ])
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.errors.length, 2)
  assert.match(
    result.errors[0],
    /^Row 2: result "hit" on bet_id 1, which is still open — results may only be published on a closed bet\./
  )
  assert.match(result.errors[0], /Close the bet in the sheet, or set the result back to Pending\./)
  assert.match(result.errors[1], /^Row 3: result "miss"/)
})

test("results on a HIDDEN bet reject too — not-closed is the test, not open", async () => {
  const result = await validate([{ pickId: 1, status: "hidden", result: "Push" }])
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.match(result.errors[0], /still hidden — results may only be published on a closed bet/)
})

test("a void on an open bet is caught like any other verdict", async () => {
  const result = await validate([{ pickId: 1, result: "Void" }])
  assert.equal(result.ok, false)
})

test("only the offending rows are named — a clean sibling isn't", async () => {
  const result = await validate([
    { pickId: 1, result: "Pending" },
    { pickId: 2, result: "Hit" },
  ])
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.errors.length, 1)
  assert.match(result.errors[0], /^Row 3:/)
})

test("results on a CLOSED bet are exactly what the pipeline is for", async () => {
  const result = await validate([
    { pickId: 1, status: "closed", result: "Hit" },
    { pickId: 2, status: "closed", result: "Miss" },
  ])
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.rows.length, 2)
  assert.deepEqual(result.warnings, [])
})

test("an open bet with pending results is the normal published menu", async () => {
  const result = await validate([{ pickId: 1 }, { pickId: 2 }])
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.warnings, [])
})

// ---------------------------------------------------------------------------
// Soft warning — a bet left open after its phase closed
// ---------------------------------------------------------------------------

test("a bet still open while the rest of its phase closed warns, without blocking", async () => {
  const result = await validate([
    { betId: 1, pickId: 1, status: "closed", result: "Hit" },
    { betId: 2, pickId: 2, status: "closed", result: "Miss" },
    { betId: 3, pickId: 3, status: "open", title: "Forgotten Bet" },
  ])
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.rows.length, 3, "the file still imports — this is a warning")
  assert.equal(result.warnings.length, 1)
  assert.match(result.warnings[0], /bet_id 3 \("Forgotten Bet"\) is still open/)
  assert.match(result.warnings[0], /every other Phase 1 bet is closed/)
  assert.match(result.warnings[0], /confirm this one is meant to keep taking wagers/)
})

test("a Phase 1 bet open while Phase 2 is open warns — Phase 2 opens after Phase 1 closes", async () => {
  const result = await validate([
    { phase: 1, betId: 1, pickId: 1, status: "open" },
    { phase: 1, betId: 2, pickId: 2, status: "open" },
    { phase: 2, betId: 3, pickId: 3, status: "open" },
  ])
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.warnings.length, 2, "both stranded Phase 1 bets are named")
  assert.match(result.warnings[0], /Phase 2 is already open/)
})

test("the normal lifecycle sheets stay quiet", async () => {
  // Phase 1 all open, Phase 2 hidden — the published-menu upload.
  const menu = await validate([
    { phase: 1, betId: 1, pickId: 1, status: "open" },
    { phase: 1, betId: 2, pickId: 2, status: "open" },
    { phase: 2, betId: 3, pickId: 3, status: "hidden" },
  ])
  assert.equal(menu.ok && menu.warnings.length, 0)

  // Phase 1 all closed with results, Phase 2 open — the Phase 2 release.
  const release = await validate([
    { phase: 1, betId: 1, pickId: 1, status: "closed", result: "Hit" },
    { phase: 1, betId: 2, pickId: 2, status: "closed", result: "Miss" },
    { phase: 2, betId: 3, pickId: 3, status: "open" },
    { phase: 2, betId: 4, pickId: 4, status: "open" },
  ])
  assert.equal(release.ok && release.warnings.length, 0)

  // Everything closed — the final results upload.
  const final = await validate([
    { phase: 1, betId: 1, pickId: 1, status: "closed", result: "Hit" },
    { phase: 2, betId: 2, pickId: 2, status: "closed", result: "Miss" },
  ])
  assert.equal(final.ok && final.warnings.length, 0)
})

test("a single open bet in a phase is not stale — there are no siblings to compare", async () => {
  const result = await validate([{ betId: 1, pickId: 1, status: "open" }])
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.warnings, [])
})

// ---------------------------------------------------------------------------
// The guards compose with the existing contract checks
// ---------------------------------------------------------------------------

test("a results-on-open error lands alongside the duplicate-pick_id error", async () => {
  const result = await validate([
    { betId: 1, pickId: 1, result: "Hit" },
    { betId: 1, pickId: 1, result: "Pending" },
  ])
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.ok(result.errors.some((e) => /Duplicate pick_id 1/.test(e)))
  assert.ok(result.errors.some((e) => /results may only be published on a closed bet/.test(e)))
})
