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

import {
  buildImportPlan,
  unlandedWrite,
  clockStaleOpenWarnings,
  parseSheet,
  phaseMoveRefusals,
  planSweep,
  sweepIsEmpty,
  validateSheet,
  type ExistingBet,
  type ExistingPick,
  type ImportPlan,
  type PlacementRef,
  type UserRow,
} from "./import.ts"
import { CATEGORIES } from "./bet-taxonomy.ts"
import type { PhaseClock } from "./phases.ts"


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
  category?: string
  round?: string
  /** The pick label; defaults to `Pick <pickId>`, which names nobody. */
  pick?: string
}

function row(spec: RowSpec): string {
  const {
    phase = 1,
    status = "open",
    betId = 1,
    pickId,
    result = "Pending",
    title = `Bet ${betId}`,
    category = "Top Finisher",
    round = "Round 1",
    pick = `Pick ${pickId}`,
  } = spec
  return [
    phase,
    status,
    round,
    category,
    betId,
    pickId,
    title,
    pick,
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
  return validateSheet(parsed)
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

// ---------------------------------------------------------------------------
// Clock-informed stale-open warning (#122)
// ---------------------------------------------------------------------------

/** A phase clock with the given deadlines; null = never closes. */
function clock(p1: string | null, p2: string | null = null): PhaseClock {
  return {
    phase1_closes_at: p1,
    phase2_closes_at: p2,
    show_countdown: true,
  }
}

const DEADLINE = "2026-09-24T16:00:00Z" // 11:00 AM CDT
const BEFORE = new Date("2026-09-24T15:59:59Z")
const AFTER = new Date("2026-09-24T16:00:01Z")

async function rowsFor(specs: RowSpec[]) {
  const result = await validate(specs)
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error("fixture did not validate")
  return result.rows
}

test("clock warning: an open bet past its phase deadline is flagged", async () => {
  const rows = await rowsFor([{ pickId: 1 }, { pickId: 2 }])
  const warnings = clockStaleOpenWarnings(rows, clock(DEADLINE), AFTER)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /bet_id 1 \("Bet 1"\) is marked open/)
  assert.match(warnings[0], /Phase 1's deadline passed at/)
  assert.match(warnings[0], /\/admin\/close/)
})

test("clock warning: nothing before the deadline", async () => {
  const rows = await rowsFor([{ pickId: 1 }])
  assert.deepEqual(clockStaleOpenWarnings(rows, clock(DEADLINE), BEFORE), [])
})

test("clock warning: no deadline set means never — the pre-Sprint-25 behaviour", async () => {
  const rows = await rowsFor([{ pickId: 1 }])
  assert.deepEqual(clockStaleOpenWarnings(rows, clock(null), AFTER), [])
})

test("clock warning: a closed bet is not flagged, whatever the clock says", async () => {
  // The sheet and the clock agree — closed is closed.
  const rows = await rowsFor([{ pickId: 1, status: "closed" }])
  assert.deepEqual(clockStaleOpenWarnings(rows, clock(DEADLINE), AFTER), [])
})

test("clock warning: ONE warning per bet, not one per pick", async () => {
  // Rows arrive per pick; a five-pick bet must not shout five times.
  const rows = await rowsFor([
    { pickId: 1 },
    { pickId: 2 },
    { pickId: 3 },
    { pickId: 4 },
    { pickId: 5 },
  ])
  assert.equal(clockStaleOpenWarnings(rows, clock(DEADLINE), AFTER).length, 1)
})

test("clock warning: each phase is judged against its own deadline", async () => {
  // THE CASE THE SHEET-ONLY CHECK CANNOT SEE (#122). Phase 1 is past its
  // deadline while Phase 2 is still ahead of its own. A sheet that marks both
  // open is perfectly self-consistent, so validateSheet() has nothing to go on.
  const rows = await rowsFor([
    { pickId: 1, betId: 1, phase: 1 },
    { pickId: 2, betId: 2, phase: 2 },
  ])
  const warnings = clockStaleOpenWarnings(
    rows,
    clock(DEADLINE, "2026-09-26T16:00:00Z"),
    AFTER
  )
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /bet_id 1/)
  assert.match(warnings[0], /Phase 1/)
})

test("clock warning: a whole phase left open is flagged bet by bet", async () => {
  // Re-uploading last week's file: every Phase 1 bet still says open.
  const rows = await rowsFor([
    { pickId: 1, betId: 1 },
    { pickId: 2, betId: 2 },
    { pickId: 3, betId: 3 },
  ])
  const warnings = clockStaleOpenWarnings(rows, clock(DEADLINE), AFTER)
  assert.equal(warnings.length, 3)
  // And the sheet-only check stays silent on this shape — which is the whole
  // reason this function exists.
  const sheetOnly = await validate([
    { pickId: 1, betId: 1 },
    { pickId: 2, betId: 2 },
    { pickId: 3, betId: 3 },
  ])
  assert.equal(sheetOnly.ok, true)
  if (sheetOnly.ok) assert.deepEqual(sheetOnly.warnings, [])
})

test("clock warning: the deadline boundary is inclusive, like the rest of the clock", async () => {
  const rows = await rowsFor([{ pickId: 1 }])
  const exactly = new Date(DEADLINE)
  assert.equal(clockStaleOpenWarnings(rows, clock(DEADLINE), exactly).length, 1)
})

// ---------------------------------------------------------------------------
// opened_at — the stamp the activity feed's "Phase N is open" event reads
//
// The rule is "on the transition into open, and only then". Everything here is
// a way of getting that wrong: stamping a hidden bet, re-stamping on the next
// upload, or letting an unrelated edit move the moment the phase opened.
// ---------------------------------------------------------------------------

const NOW = new Date("2026-09-18T15:00:00Z")
const CATEGORY_ROWS = [{ id: "cat-1", name: "Top Finisher" }]

/** The DB row for bet 1 as the sheet fixtures above describe it. */
function existingBet(status: string, title = "Bet 1"): ExistingBet {
  return {
    id: "bet-uuid-1",
    sheet_bet_id: 1,
    category_id: "cat-1",
    title,
    phase: 1,
    round: "round_1",
    status,
    total_probability: 1,
  }
}

async function planFor(
  specs: RowSpec[],
  existingBets: ExistingBet[] = [],
  now: Date = NOW
) {
  const validation = await validate(specs)
  assert.ok(validation.ok, "fixture sheet should validate")
  return buildImportPlan(
    validation.rows,
    existingBets,
    [],
    CATEGORY_ROWS,
    [],
    now
  )
}

test("opened_at: a bet created as open is stamped", async () => {
  const plan = await planFor([{ pickId: 1, status: "open" }])
  assert.equal(plan.bets.create[0].opened_at, NOW.toISOString())
})

test("opened_at: a bet created hidden is not stamped", async () => {
  const plan = await planFor([{ pickId: 1, status: "hidden" }])
  assert.equal(plan.bets.create[0].opened_at, undefined)
})

test("opened_at: the hidden → open transition stamps — this is Phase 2", async () => {
  const plan = await planFor(
    [{ pickId: 1, status: "open" }],
    [existingBet("hidden")]
  )
  assert.equal(plan.bets.update[0].opened_at, NOW.toISOString())
})

test("opened_at: an already-open bet edited for something else keeps its stamp", async () => {
  // The one that would walk the feed's phase-open event forward to the last
  // upload of the weekend: absent from the write, so the stored value stands.
  const plan = await planFor(
    [{ pickId: 1, status: "open", title: "Renamed" }],
    [existingBet("open")]
  )
  assert.equal(plan.bets.update.length, 1)
  assert.equal(plan.bets.update[0].opened_at, undefined)
})

test("opened_at: an identical re-upload stays a true no-op", async () => {
  const plan = await planFor(
    [{ pickId: 1, status: "open" }],
    [existingBet("open")]
  )
  assert.equal(plan.bets.unchanged, 1)
  assert.equal(plan.bets.update.length, 0)
  assert.equal(plan.bets.create.length, 0)
})

test("opened_at: reopening a closed bet stamps again", async () => {
  const plan = await planFor(
    [{ pickId: 1, status: "open" }],
    [existingBet("closed")]
  )
  assert.equal(plan.bets.update[0].opened_at, NOW.toISOString())
})

// ---------------------------------------------------------------------------
// Pick → player links (ADR 0001 §11)
//
// player_user_id is what the opponent block, the self-bet cap and the profile
// link all key off, and nothing errors when it's wrong. On Sept 23, 2026 a
// re-upload put "Dustin Scheller (E)" into the pick_id that had been "Pat
// Leicht (-5)"; Dustin had no account yet, the importer kept Pat's link, and
// Pat was blocked as Dustin's opponent in a match he wasn't in.
// ---------------------------------------------------------------------------

const PAT: UserRow = { id: "user-pat", display_name: "Pat Leicht" }
const DUSTIN: UserRow = { id: "user-dustin", display_name: "Dustin Scheller" }

function existingPick(label: string, playerUserId: string | null): ExistingPick {
  return {
    id: "pick-uuid-1",
    bet_id: "bet-uuid-1",
    sheet_pick_id: 1,
    label,
    american_odds: 110,
    fractional_odds: "11/10",
    probability: 0.476,
    player_user_id: playerUserId,
    result: "pending",
  }
}

async function linkPlanFor(
  label: string,
  existingPicks: ExistingPick[],
  users: UserRow[]
): Promise<ImportPlan> {
  const validation = await validate([{ pickId: 1, pick: label }])
  assert.ok(validation.ok, "fixture sheet should validate")
  return buildImportPlan(
    validation.rows,
    [existingBet("open")],
    existingPicks,
    CATEGORY_ROWS,
    users,
    NOW
  )
}

/** The link the plan writes for pick 1, create or update. */
function linkWritten(plan: ImportPlan): string | null {
  const write = plan.picks.create[0] ?? plan.picks.update[0]
  assert.ok(write, "expected a write for pick 1")
  return write.player_user_id
}

test("links: a new pick links to the account its name matches — stroke stripped, any case", async () => {
  const plan = await linkPlanFor("PAT LEICHT (-5)", [], [PAT])
  assert.equal(linkWritten(plan), PAT.id)
  assert.deepEqual(plan.unmatchedPickNames, [])
})

test("links: a new pick naming nobody is unlinked and reported", async () => {
  const plan = await linkPlanFor("Dustin Scheller (E)", [], [PAT])
  assert.equal(linkWritten(plan), null)
  assert.deepEqual(plan.unmatchedPickNames, ["Dustin Scheller"])
})

test("links: a pick_id reused for someone else drops the old link (Sept 23)", async () => {
  const plan = await linkPlanFor(
    "Dustin Scheller (E)",
    [existingPick("Pat Leicht (-5)", PAT.id)],
    [PAT]
  )
  assert.equal(plan.picks.update.length, 1)
  assert.equal(linkWritten(plan), null, "the pick is Dustin now, not Pat")
})

test("links: a pick_id reused for someone with an account links to them", async () => {
  const plan = await linkPlanFor(
    "Dustin Scheller (E)",
    [existingPick("Pat Leicht (-5)", PAT.id)],
    [PAT, DUSTIN]
  )
  assert.equal(linkWritten(plan), DUSTIN.id)
})

test("links: a hand-set link survives a stroke change while the name matches no account", async () => {
  // The admin linked "Don Harris" to an account named "DonH" by hand; the
  // sheet then moved his handicap. Same person — the link stays.
  const donh: UserRow = { id: "user-donh", display_name: "DonH" }
  const plan = await linkPlanFor(
    "Don Harris (-1)",
    [existingPick("Don Harris (-2)", donh.id)],
    [PAT, donh]
  )
  assert.equal(plan.picks.update.length, 1)
  assert.equal(linkWritten(plan), donh.id)
})

test("links: an identical re-upload keeps a hand-set link and writes nothing", async () => {
  const donh: UserRow = { id: "user-donh", display_name: "DonH" }
  const plan = await linkPlanFor(
    "Don Harris (-2)",
    [existingPick("Don Harris (-2)", donh.id)],
    [PAT, donh]
  )
  assert.equal(plan.picks.unchanged, 1)
  assert.equal(plan.picks.update.length, 0)
})

test("links: a re-upload heals a golfer who signed up after the last upload", async () => {
  // Unlinked because Dustin had no account at the last upload…
  const unlinked = await linkPlanFor(
    "Dustin Scheller (E)",
    [existingPick("Dustin Scheller (E)", null)],
    [PAT, DUSTIN]
  )
  assert.equal(linkWritten(unlinked), DUSTIN.id)

  // …or still carrying the previous occupant's link, as production was.
  const stale = await linkPlanFor(
    "Dustin Scheller (E)",
    [existingPick("Dustin Scheller (E)", PAT.id)],
    [PAT, DUSTIN]
  )
  assert.equal(linkWritten(stale), DUSTIN.id)
})

// ---------------------------------------------------------------------------
// unlandedWrite — the half of a write check that `if (error)` misses (#159)
// ---------------------------------------------------------------------------

test("unlandedWrite passes a write that touched the rows it should have", () => {
  assert.equal(unlandedWrite("bet 3", null, 1, 1), null)
  assert.equal(unlandedWrite("12 picks", null, 12, 12), null)
})

test("unlandedWrite reports a database error, naming the row", () => {
  const out = unlandedWrite("bet 3", { message: "permission denied" }, 0, 1)
  assert.match(out!, /^bet 3: permission denied/)
})

test("unlandedWrite catches the silent one: success, zero rows", () => {
  // The #99 shape. No error, nothing written, and every check that only reads
  // `error` calls it a success.
  const out = unlandedWrite("bet 3", null, 0, 1)
  assert.match(out!, /^bet 3: /)
  assert.match(out!, /changed nothing/)
})

test("unlandedWrite catches a partial batch", () => {
  const out = unlandedWrite("12 picks", null, 9, 12)
  assert.match(out!, /only 9 of 12/)
})

// ---------------------------------------------------------------------------
// The category contract — the five of PRD §6, pinned in code
// ---------------------------------------------------------------------------
//
// Before Sept 10 2026 validateSheet() took the legal names as an argument and
// the route passed it every row of `bet_categories` — a table with no CHECK
// constraint. One stray row there and an off-contract category imported cleanly
// and then appeared on the bet menu as a filter chip. Pat, driving the menu:
// "Medalist is not a bet category." He is right: Medalist is a bet TITLE, filed
// under Top Finisher (see supabase/seed-sample-phase1.sql).

test("a category outside the five rejects the file and names all five", async () => {
  const result = await validate([{ pickId: 1, category: "Medalist" }])
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.errors.length, 1)
  assert.match(result.errors[0], /unknown category "Medalist"/)
  for (const name of CATEGORIES) assert.match(result.errors[0], new RegExp(name))
})

test("each of the five is accepted, case-insensitively", async () => {
  for (const [i, name] of CATEGORIES.entries()) {
    // Two picks per bet: a Match needs exactly two (Sprint 30), and two is a
    // legal count for every other category too.
    const result = await validate([
      { pickId: 1, betId: i + 1, category: name.toUpperCase() },
      { pickId: 2, betId: i + 1, category: name.toUpperCase() },
    ])
    assert.equal(result.ok, true, `${name} was rejected`)
    if (result.ok) assert.equal(result.rows[0].category, name)
  }
})

// ---------------------------------------------------------------------------
// A Match has exactly two picks (Sprint 30) — Pat: "That's usually a mistake
// on my end."
// ---------------------------------------------------------------------------

test("a Match with one pick rejects the file, naming the bet and its row", async () => {
  const result = await validate([
    { pickId: 1, betId: 7, category: "Match", title: "Jake v Pat" },
  ])
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.deepEqual(result.errors, [
    'bet_id 7 ("Jake v Pat") is a Match with 1 pick (rows 2) — a Match has exactly two.',
  ])
})

test("a Match with three picks rejects the WHOLE file", async () => {
  const result = await validate([
    { pickId: 1, betId: 1 },
    { pickId: 2, betId: 1 },
    { pickId: 3, betId: 7, category: "Match", title: "Jake v Pat" },
    { pickId: 4, betId: 7, category: "Match", title: "Jake v Pat" },
    { pickId: 5, betId: 7, category: "Match", title: "Jake v Pat" },
  ])
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.ok(!("rows" in result))
  assert.deepEqual(result.errors, [
    'bet_id 7 ("Jake v Pat") is a Match with 3 picks (rows 4, 5, 6) — a Match has exactly two.',
  ])
})

test("a Match with two picks imports", async () => {
  const result = await validate([
    { pickId: 1, betId: 7, category: "Match" },
    { pickId: 2, betId: 7, category: "Match" },
  ])
  assert.equal(result.ok, true)
})

test("a Group Match is not pick-counted — three picks import (an open question for Pat)", async () => {
  const result = await validate([
    { pickId: 1, betId: 8, category: "Group Match" },
    { pickId: 2, betId: 8, category: "Group Match" },
    { pickId: 3, betId: 8, category: "Group Match" },
  ])
  assert.equal(result.ok, true)
})

test("a category conflict on a Match-ish bet is reported once, as the conflict", async () => {
  const result = await validate([
    { pickId: 1, betId: 9, category: "Match" },
    { pickId: 2, betId: 9, category: "Group Match" },
    { pickId: 3, betId: 9, category: "Match" },
  ])
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.errors.length, 1)
  assert.match(result.errors[0], /conflicting category values/)
})

// ---------------------------------------------------------------------------
// phaseMoveRefusals — a wager can't change pots (Sprint 30 / ADR 0002)
// ---------------------------------------------------------------------------

test("phase move: a wagered bet moved to the other phase is refused, once per bet", async () => {
  const validation = await validate([
    { pickId: 1, betId: 1, phase: 2, title: "Low round" },
    { pickId: 2, betId: 1, phase: 2, title: "Low round" },
  ])
  assert.ok(validation.ok)
  const bets = [sweepBet(1, 1)]
  const picks = [sweepPick(1, 1), sweepPick(2, 1)]
  const refusals = phaseMoveRefusals(validation.rows, bets, picks, [
    { pick_id: "pick-uuid-1" },
    { pick_id: "pick-uuid-2" },
    { pick_id: "pick-uuid-2" },
  ])
  assert.deepEqual(refusals, [
    'bet_id 1 ("Low round") moves to Phase 2 from Phase 1, but 3 wagers are on it — each phase is its own pot, so a wager can\'t change phases. Put it back in Phase 1, or remove the wagers first.',
  ])
})

test("phase move: an unwagered bet moves freely", async () => {
  const validation = await validate([{ pickId: 1, betId: 1, phase: 2 }])
  assert.ok(validation.ok)
  assert.deepEqual(
    phaseMoveRefusals(validation.rows, [sweepBet(1, 1)], [sweepPick(1, 1)], []),
    []
  )
})

test("phase move: a wager on a DIFFERENT pick of the bet doesn't block this pick's move", async () => {
  // Pick 2 carries the wager; only pick 1's row appears (moved under a new
  // phase-2 bet). The wagered pick isn't moving, so nothing changes pots.
  const validation = await validate([
    { pickId: 1, betId: 5, phase: 2 },
    { pickId: 2, betId: 1, phase: 1 },
  ])
  assert.ok(validation.ok)
  assert.deepEqual(
    phaseMoveRefusals(
      validation.rows,
      [sweepBet(1, 1)],
      [sweepPick(1, 1), sweepPick(2, 1)],
      [{ pick_id: "pick-uuid-2" }]
    ),
    []
  )
})

test("phase move: a wagered pick moved under a bet in the other phase is refused", async () => {
  const validation = await validate([{ pickId: 1, betId: 5, phase: 2, title: "Phase 2 bet" }])
  assert.ok(validation.ok)
  const refusals = phaseMoveRefusals(
    validation.rows,
    [sweepBet(1, 1)],
    [sweepPick(1, 1)],
    [{ pick_id: "pick-uuid-1" }]
  )
  assert.equal(refusals.length, 1)
  assert.match(refusals[0], /^bet_id 5 \("Phase 2 bet"\) moves to Phase 2 from Phase 1, but 1 wager is on it/)
})

test("phase move: same phase is no move, wagers or not", async () => {
  const validation = await validate([{ pickId: 1, betId: 1, phase: 1 }])
  assert.ok(validation.ok)
  assert.deepEqual(
    phaseMoveRefusals(validation.rows, [sweepBet(1, 1)], [sweepPick(1, 1)], [
      { pick_id: "pick-uuid-1" },
    ]),
    []
  )
})

test("a bad category rejects the WHOLE file, not just its row (PRD §8.2)", async () => {
  const result = await validate([
    { pickId: 1, betId: 1 },
    { pickId: 2, betId: 2, category: "Medalist" },
  ])
  assert.equal(result.ok, false)
  if (result.ok) return
  // No partial import: `rows` is not reachable on a failed validation at all.
  assert.ok(!("rows" in result))
})

// ---------------------------------------------------------------------------
// planSweep — rows the sheet no longer lists (Sprint 29)
//
// Pat, Sept 11: "anytime I upload a sheet it should delete all bets that aren't
// in the sheet being uploaded. It can warn me that I am about to delete some
// bets." The warning half is the route's; this is the half that decides WHAT.
// ---------------------------------------------------------------------------

function sweepBet(
  sheetBetId: number,
  phase: 1 | 2 = 1,
  status = "open"
): ExistingBet {
  return {
    id: `bet-uuid-${sheetBetId}`,
    sheet_bet_id: sheetBetId,
    category_id: "cat-1",
    title: `Bet ${sheetBetId}`,
    phase,
    round: "round_1",
    status,
    total_probability: 1,
  }
}

function sweepPick(sheetPickId: number, sheetBetId: number): ExistingPick {
  return {
    id: `pick-uuid-${sheetPickId}`,
    bet_id: `bet-uuid-${sheetBetId}`,
    sheet_pick_id: sheetPickId,
    label: `Pick ${sheetPickId}`,
    american_odds: 110,
    fractional_odds: "11/10",
    probability: 0.476,
    player_user_id: null,
    result: "pending",
  }
}

async function sweepFor(
  specs: RowSpec[],
  existingBets: ExistingBet[],
  existingPicks: ExistingPick[],
  placements: PlacementRef[] = []
) {
  const validation = await validate(specs)
  assert.ok(validation.ok, "fixture sheet should validate")
  return planSweep(validation.rows, existingBets, existingPicks, placements)
}

test("sweep: a sheet that still lists everything sweeps nothing", async () => {
  const sweep = await sweepFor(
    [{ pickId: 1, betId: 1 }],
    [sweepBet(1)],
    [sweepPick(1, 1)]
  )
  assert.equal(sweepIsEmpty(sweep), true)
})

test("sweep: a bet the sheet dropped is swept, picks and all", async () => {
  const sweep = await sweepFor(
    [{ pickId: 1, betId: 1 }],
    [sweepBet(1), sweepBet(2)],
    [sweepPick(1, 1), sweepPick(2, 2), sweepPick(3, 2)]
  )
  assert.equal(sweep.bets.clean.length, 1)
  assert.equal(sweep.bets.clean[0].sheetId, 2)
  assert.equal(sweep.bets.clean[0].pickCount, 2)
  // Its picks go by ON DELETE CASCADE — listing them too would double-count
  // them in the report and in the fingerprint.
  assert.equal(sweep.picks.clean.length, 0)
})

test("sweep: scope is the phases the SHEET mentions, not the tournament", async () => {
  // The one that makes a partial upload survivable: a phase-1 sheet must not
  // offer to delete the staged phase-2 menu sitting beside it.
  const sweep = await sweepFor(
    [{ pickId: 1, betId: 1, phase: 1 }],
    [sweepBet(1, 1), sweepBet(9, 2, "hidden")],
    [sweepPick(1, 1), sweepPick(9, 9)]
  )
  assert.deepEqual(sweep.phases, [1])
  assert.equal(sweepIsEmpty(sweep), true)
})

test("sweep: a phase-2 sheet reaches the phase-2 bet it dropped", async () => {
  const sweep = await sweepFor(
    [{ pickId: 1, betId: 1, phase: 2 }],
    [sweepBet(1, 2), sweepBet(9, 2, "hidden")],
    [sweepPick(1, 1), sweepPick(9, 9)]
  )
  assert.deepEqual(sweep.bets.clean.map((b) => b.sheetId), [9])
})

test("sweep: a pick dropped from a SURVIVING bet is swept on its own", async () => {
  const sweep = await sweepFor(
    [{ pickId: 1, betId: 1 }],
    [sweepBet(1)],
    [sweepPick(1, 1), sweepPick(2, 1)]
  )
  assert.equal(sweep.bets.clean.length, 0)
  assert.deepEqual(sweep.picks.clean.map((p) => p.sheetId), [2])
  assert.equal(sweep.picks.clean[0].betTitle, "Bet 1")
})

test("sweep: a dropped bet carrying wagers lands in `wagered`, never `clean`", async () => {
  const sweep = await sweepFor(
    [{ pickId: 1, betId: 1 }],
    [sweepBet(1), sweepBet(2)],
    [sweepPick(1, 1), sweepPick(2, 2)],
    [{ pick_id: "pick-uuid-2", amount: 7, bettorName: "Dan Mercer" }]
  )
  assert.equal(sweep.bets.clean.length, 0)
  assert.equal(sweep.bets.wagered.length, 1)
  assert.equal(sweep.bets.wagered[0].wagerTotal, 7)
  assert.deepEqual(sweep.bets.wagered[0].bettors, [
    { name: "Dan Mercer", amount: 7 },
  ])
})

test("sweep: one bettor's several wagers roll into one chase-list entry", async () => {
  const sweep = await sweepFor(
    [{ pickId: 1, betId: 1 }],
    [sweepBet(1), sweepBet(2)],
    [sweepPick(1, 1), sweepPick(2, 2), sweepPick(3, 2)],
    [
      { pick_id: "pick-uuid-2", amount: 5, bettorName: "Dan Mercer" },
      { pick_id: "pick-uuid-3", amount: 4, bettorName: "Dan Mercer" },
      { pick_id: "pick-uuid-3", amount: 6, bettorName: "Jake Kohne" },
    ]
  )
  const target = sweep.bets.wagered[0]
  assert.equal(target.wagerCount, 3)
  assert.equal(target.wagerTotal, 15)
  // Biggest first — the person to text first.
  assert.deepEqual(target.bettors, [
    { name: "Dan Mercer", amount: 9 },
    { name: "Jake Kohne", amount: 6 },
  ])
})

test("sweep: a SOFT-DELETED wager still makes a target `wagered`", async () => {
  // The trap this split exists to avoid. deleted_at is a column, not a row
  // removal, so the FK still holds — classing this as `clean` would build a
  // delete set the database then refuses.
  const sweep = await sweepFor(
    [{ pickId: 1, betId: 1 }],
    [sweepBet(1), sweepBet(2)],
    [sweepPick(1, 1), sweepPick(2, 2)],
    // The caller passes EVERY placement row, deleted or not; this is one the
    // bettor removed weeks ago.
    [{ pick_id: "pick-uuid-2", amount: 3, bettorName: "Casey Sideline" }]
  )
  assert.equal(sweep.bets.clean.length, 0)
  assert.equal(sweep.bets.wagered.length, 1)
})

test("sweep: a dropped PICK carrying wagers is `wagered` too", async () => {
  const sweep = await sweepFor(
    [{ pickId: 1, betId: 1 }],
    [sweepBet(1)],
    [sweepPick(1, 1), sweepPick(2, 1)],
    [{ pick_id: "pick-uuid-2", amount: 12, bettorName: "Mike Yenzer" }]
  )
  assert.equal(sweep.picks.clean.length, 0)
  assert.deepEqual(sweep.picks.wagered.map((p) => p.sheetId), [2])
  assert.equal(sweep.picks.wagered[0].wagerTotal, 12)
})

test("sweep: the fingerprint is stable over input order", async () => {
  const a = await sweepFor(
    [{ pickId: 1, betId: 1 }],
    [sweepBet(1), sweepBet(2), sweepBet(3)],
    [sweepPick(1, 1), sweepPick(2, 2), sweepPick(3, 3)]
  )
  const b = await sweepFor(
    [{ pickId: 1, betId: 1 }],
    [sweepBet(3), sweepBet(1), sweepBet(2)],
    [sweepPick(3, 3), sweepPick(1, 1), sweepPick(2, 2)]
  )
  assert.equal(a.fingerprint, b.fingerprint)
})

test("sweep: the fingerprint changes when the delete set does", async () => {
  const two = await sweepFor(
    [{ pickId: 1, betId: 1 }],
    [sweepBet(1), sweepBet(2), sweepBet(3)],
    [sweepPick(1, 1), sweepPick(2, 2), sweepPick(3, 3)]
  )
  const one = await sweepFor(
    [{ pickId: 1, betId: 1 }],
    [sweepBet(1), sweepBet(2)],
    [sweepPick(1, 1), sweepPick(2, 2)]
  )
  assert.notEqual(two.fingerprint, one.fingerprint)
})
