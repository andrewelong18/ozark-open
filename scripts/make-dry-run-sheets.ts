// Generates the fallback spreadsheets for the dry run (docs/dry-run/GAMEPLAN.md).
//
// Pat's own Excel workbook is the real artifact and should be used if he has
// it ready — testing HIS file is most of the point. These exist so a missing,
// half-finished or malformed workbook doesn't cost the evening: they are the
// same 19 bets / 87 picks as docs/import/bets-sample.xlsx, re-cut into the
// four states the tournament actually passes through, plus one deliberately
// broken file.
//
// Odds display values are computed here with the same formulas Pat's workbook
// uses, verified to reproduce the sample sheet's values exactly:
//
//   fractional  o > 0 → o/100 reduced;  o < 0 → |o|/(100+|o|) reduced
//   probability o > 0 → 100/(o+100);    o < 0 → |o|/(|o|+100)
//   total_probability = Σ probability over the bet's picks (the SUMIF)
//
// That matters because the reprice sheet moves a line, and a repriced pick
// whose fractional odds and probability didn't move with it would be an
// obviously fake file.
//
// Run:  node --experimental-strip-types scripts/make-dry-run-sheets.ts

import ExcelJS from "exceljs"
import { mkdir } from "node:fs/promises"
import path from "node:path"

const SOURCE = "docs/import/bets-sample.xlsx"
const OUT_DIR = "docs/dry-run/sheets"

const COLUMNS = [
  "phase", "status", "round", "category", "bet_id", "pick_id", "bet", "pick",
  "american_odds", "fractional_odds", "probability", "total_probability", "result",
  // Helper columns are ignored by the importer. They are kept here on purpose:
  // Pat's real workbook has them, so the dry run should prove they're tolerated.
  "helper1", "helper2",
] as const

type Row = {
  phase: number
  status: string
  round: string
  category: string
  bet_id: number
  pick_id: number
  bet: string
  pick: string
  american_odds: number
  result: string
}

// ---------------------------------------------------------------------------
// Odds display math — mirrors the workbook's LET() formulas
// ---------------------------------------------------------------------------

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

function fractionalOdds(american: number): string {
  const abs = Math.abs(american)
  const num = abs
  const den = american > 0 ? 100 : 100 + abs
  const g = gcd(num, den)
  return `${num / g}/${den / g}`
}

function impliedProbability(american: number): number {
  const abs = Math.abs(american)
  return american > 0 ? 100 / (american + 100) : abs / (abs + 100)
}

// ---------------------------------------------------------------------------
// Read the source menu
// ---------------------------------------------------------------------------

/** ExcelJS hands back {formula, result} for computed cells — take the value. */
function cellValue(v: unknown): unknown {
  if (v !== null && typeof v === "object" && "result" in (v as object)) {
    return (v as { result: unknown }).result
  }
  return v
}

async function readSource(): Promise<Row[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(SOURCE)
  const ws = wb.worksheets[0]
  const header = (ws.getRow(1).values as unknown[]).slice(1).map(String)
  const rows: Row[] = []

  ws.eachRow((row, i) => {
    if (i === 1) return
    const get = (name: string) => cellValue(row.getCell(header.indexOf(name) + 1).value)
    rows.push({
      phase: Number(get("phase")),
      status: String(get("status")),
      round: String(get("round")),
      category: String(get("category")),
      bet_id: Number(get("bet_id")),
      pick_id: Number(get("pick_id")),
      bet: String(get("bet")),
      pick: String(get("pick")),
      american_odds: Number(get("american_odds")),
      result: String(get("result")),
    })
  })

  return rows
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * `extraRows` lets the broken sheet inject a duplicate pick_id, which is a
 * cross-row error the per-row validator can't catch on its own.
 */
async function write(file: string, rows: Row[], extraRows: Row[] = []) {
  const all = [...rows, ...extraRows]

  // total_probability is the per-bet sum, recomputed so a repriced pick moves
  // its bet's banner along with it.
  const totals = new Map<number, number>()
  for (const r of all) {
    totals.set(r.bet_id, (totals.get(r.bet_id) ?? 0) + impliedProbability(r.american_odds))
  }

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("New Architecture")
  ws.addRow([...COLUMNS])

  for (const r of all) {
    ws.addRow([
      r.phase, r.status, r.round, r.category, r.bet_id, r.pick_id, r.bet, r.pick,
      r.american_odds,
      fractionalOdds(r.american_odds),
      impliedProbability(r.american_odds),
      totals.get(r.bet_id),
      r.result,
      null, null,
    ])
  }

  ws.getRow(1).font = { bold: true }
  const out = path.join(OUT_DIR, file)
  await wb.xlsx.writeFile(out)
  console.log(`  ${out.padEnd(52)} ${all.length} picks`)
}

// ---------------------------------------------------------------------------
// The five (six) cuts
// ---------------------------------------------------------------------------

/** Apply a per-pick result override map, leaving everything else alone. */
function withResults(rows: Row[], overrides: Record<number, string>): Row[] {
  return rows.map((r) => (overrides[r.pick_id] ? { ...r, result: overrides[r.pick_id] } : r))
}

function withStatus(rows: Row[], phase: number, status: string): Row[] {
  return rows.map((r) => (r.phase === phase ? { ...r, status } : r))
}

function allPending(rows: Row[]): Row[] {
  return rows.map((r) => ({ ...r, result: "Pending" }))
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const source = await readSource()
  console.log(`Read ${source.length} picks from ${SOURCE}\n`)

  // The sample ships with Phase 1 already adjudicated. Everything below is
  // built from a fully-pending baseline so the story starts before tee-off.
  const base = allPending(source)

  // ── 1 · Phase 1 opens ────────────────────────────────────────────────────
  // Phase 1 open and undecided; Phase 2 hidden. This is Wednesday night.
  const phase1Open = withStatus(withStatus(base, 1, "open"), 2, "hidden")
  await write("1-phase1-open.xlsx", phase1Open)

  // ── 1b · The reprice ─────────────────────────────────────────────────────
  // Same file, one line moved: Dan Mercer to win the tournament shortens from
  // +110 to -140. Several bettors are already on that pick, so re-uploading
  // this must (a) warn in the import report and (b) leave their
  // odds_at_placement untouched. That is Act 5.
  const repriced = phase1Open.map((r) =>
    r.pick_id === 1 ? { ...r, american_odds: -140 } : r
  )
  await write("1b-phase1-repriced.xlsx", repriced)

  // ── 2 · Phase 1 closes, Round 1 results land ─────────────────────────────
  // Thursday night. The sample's own verdicts, with one change: Match 8 is
  // VOIDED because Austin Davis withdrew. The sample data contains pushes but
  // no voids anywhere, so without this the one place where void ≠ push — the
  // pool itself shrinking — would never be exercised.
  //
  // Built on `phase1Open`, NOT `repriced`. Pat confirmed on 2026-07-31 that a
  // published line never moves, so the lifecycle sheets must not carry the
  // Act 5 reprice forward — otherwise uploading this file silently shortens
  // Dan Mercer from +110 to -140 in the middle of the close, which is both a
  // surprise and a workflow the book will never actually run.
  //
  // 1b-phase1-repriced.xlsx is still generated above, for anyone who does want
  // to exercise the odds-snapshot rule deliberately. Payouts are unaffected
  // either way: lib/payouts.ts reads odds_at_placement, never the live pick.
  const round1Results: Record<number, string> = Object.fromEntries(
    source.filter((r) => r.phase === 1).map((r) => [r.pick_id, r.result])
  )
  round1Results[46] = "Void" // Brendan Nulsen (E)
  round1Results[47] = "Void" // Austin Davis (-10) — withdrew
  const phase1Closed = withStatus(withResults(phase1Open, round1Results), 1, "closed")
  await write("2-phase1-closed-r1-results.xlsx", phase1Closed)

  // ── 3 · Phase 2 opens ────────────────────────────────────────────────────
  // Friday night. Phase 1 stays closed and revealed; Phase 2 flips hidden →
  // open. Its tournament bets already carry their own post-Round-2 lines.
  const phase2Open = withStatus(phase1Closed, 2, "open")
  await write("3-phase2-open.xlsx", phase2Open)

  // ── 4 · Phase 2 closes, final results ────────────────────────────────────
  // Saturday night. Dan Mercer wins, which agrees with the Phase 1 outcome.
  // Match - Round 3 (bet 17) is voided — a second withdrawal, this time in
  // Phase 2, so void math is proven in both phases.
  const finalResults: Record<number, string> = {
    // Bet 14 · Win Tournament — Dan Mercer
    58: "Hit", 59: "Miss", 60: "Miss", 61: "Miss", 62: "Miss",
    // Bet 15 · Top 6 Finish
    63: "Hit", 64: "Hit", 65: "Miss", 66: "Miss", 67: "Hit", 68: "Miss", 69: "Miss",
    // Bet 16 · Medalist - Round 3 — Garrett Klenke
    70: "Miss", 71: "Hit", 72: "Miss", 73: "Miss", 74: "Miss", 75: "Miss",
    76: "Miss", 77: "Miss", 78: "Miss", 79: "Miss", 80: "Miss", 81: "Miss",
    // Bet 17 · Match - Round 3 — VOID, Joey Suntrup withdrew
    82: "Void", 83: "Void",
    // Bet 18 · Match - Round 3
    84: "Hit", 85: "Miss",
    // Bet 19 · More Even or Odd hole scores
    86: "Hit", 87: "Miss",
  }
  const phase2Closed = withStatus(withResults(phase2Open, finalResults), 2, "closed")
  await write("4-phase2-closed-final.xlsx", phase2Closed)

  // ── X · The broken file ──────────────────────────────────────────────────
  // Three different faults at once, so the import report has to surface more
  // than the first one it trips over:
  //   · row 2   — status "frozen" is not open|closed|hidden
  //   · row 3   — american_odds 0 is invalid (§3.6: zero odds are meaningless)
  //   · row 88  — pick_id 13 duplicates an existing row, a CROSS-row fault the
  //               per-row checks cannot catch
  // Nothing in this file may reach the database. If even one row lands, the
  // "a typo can't half-apply your menu" guarantee is broken.
  const broken = phase1Open.map((r) => {
    if (r.pick_id === 1) return { ...r, status: "frozen" }
    if (r.pick_id === 2) return { ...r, american_odds: 0 }
    return r
  })
  const duplicate: Row = { ...phase1Open[0], pick_id: 13, pick: "Duplicate Pick ID" }
  await write("X-broken.xlsx", broken, [duplicate])

  console.log("\nDone.")
}

await main()
