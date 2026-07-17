// Spreadsheet ingestion core (ADR 0001 §§7–8, PRD §8.2): parse the admin's
// sheet, validate the column contract, and (later commits) plan the upsert.
//
// Pure module by design — no Supabase, no "@/" alias imports — so the local
// round-trip harness (scripts/) can exercise the exact code the API route
// runs. Display values (fractional_odds, probability, total_probability) are
// carried verbatim; nothing here recomputes odds.

import ExcelJS from "exceljs"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SheetRow = {
  /** Spreadsheet row number (header is row 1), for error/report messages. */
  rowNumber: number
  phase: 1 | 2
  status: "open" | "closed" | "hidden"
  round: "tournament" | "round_1" | "round_3"
  /** Canonical bet_categories.name, e.g. "Top X Finisher". */
  category: string
  sheetBetId: number
  sheetPickId: number
  betTitle: string
  pickLabel: string
  americanOdds: number
  fractionalOdds: string
  probability: number
  totalProbability: number | null
  result: "pending" | "hit" | "miss" | "push" | "void"
}

export type ParsedSheet = {
  /** Lowercased, trimmed header cells in sheet order. */
  header: string[]
  rows: { rowNumber: number; cells: Record<string, CellValue> }[]
}

type CellValue = string | number | null

export type ValidationResult =
  | { ok: true; rows: SheetRow[] }
  | { ok: false; errors: string[] }

// The 13 contract columns (PRD §8.2). Helper columns to the right are ignored.
export const REQUIRED_COLUMNS = [
  "phase",
  "status",
  "round",
  "category",
  "bet_id",
  "pick_id",
  "bet",
  "pick",
  "american_odds",
  "fractional_odds",
  "probability",
  "total_probability",
  "result",
] as const

const STATUS_VALUES = ["open", "closed", "hidden"] as const
const RESULT_VALUES = ["pending", "hit", "miss", "push", "void"] as const
// Contract per PRD §8.2: Tournament | Round 1 | Round 3. (The bets.round CHECK
// also permits round_2, but no Round 2 bets are released by policy — the
// importer holds the documented contract line.)
const ROUND_MAP: Record<string, SheetRow["round"]> = {
  tournament: "tournament",
  "round 1": "round_1",
  "round 3": "round_3",
}

// ---------------------------------------------------------------------------
// Parsing (.xlsx via exceljs, .csv hand-rolled)
// ---------------------------------------------------------------------------

/** Flatten exceljs cell values (formula results, rich text, hyperlinks). */
function plainCellValue(value: ExcelJS.CellValue): CellValue {
  if (value == null) return null
  if (typeof value === "string" || typeof value === "number") return value
  if (typeof value === "boolean") return String(value)
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "object") {
    if ("result" in value) return plainCellValue(value.result ?? null)
    if ("richText" in value)
      return value.richText.map((part) => part.text).join("")
    if ("text" in value) return plainCellValue(value.text)
    if ("error" in value) return null
  }
  return null
}

/** RFC-4180-ish CSV: quoted fields, embedded commas/quotes/newlines, CRLF. */
function parseCsvText(text: string): string[][] {
  const rows: string[][] = []
  let field = ""
  let row: string[] = []
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ",") {
      row.push(field)
      field = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++
      row.push(field)
      rows.push(row)
      field = ""
      row = []
    } else {
      field += ch
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function toParsedSheet(grid: CellValue[][]): ParsedSheet {
  if (grid.length === 0) return { header: [], rows: [] }

  const header = grid[0].map((cell) =>
    String(cell ?? "")
      .trim()
      .toLowerCase()
  )

  const rows: ParsedSheet["rows"] = []
  for (let i = 1; i < grid.length; i++) {
    const cells: Record<string, CellValue> = {}
    let hasContent = false
    header.forEach((name, col) => {
      if (!name) return
      const value = grid[i][col] ?? null
      cells[name] = typeof value === "string" ? value.trim() : value
      if (cells[name] !== null && cells[name] !== "") hasContent = true
    })
    // Sheet row number: header is row 1, first data row is row 2.
    if (hasContent) rows.push({ rowNumber: i + 1, cells })
  }
  return { header, rows }
}

/** Parse an uploaded .xlsx or .csv into raw rows keyed by header name. */
export async function parseSheet(
  buffer: Buffer,
  filename: string
): Promise<ParsedSheet> {
  if (filename.toLowerCase().endsWith(".csv")) {
    const text = new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, "")
    return toParsedSheet(parseCsvText(text))
  }

  const workbook = new ExcelJS.Workbook()
  // exceljs's "Buffer" type is really ArrayBuffer; slice an exact-range copy
  // so pooled Node Buffers can't hand it neighboring bytes.
  const data = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  )
  await workbook.xlsx.load(data as ArrayBuffer)
  const worksheet = workbook.worksheets[0]
  if (!worksheet) return { header: [], rows: [] }

  const grid: CellValue[][] = []
  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells: CellValue[] = []
    // row.values is 1-based; shift to 0-based columns.
    const values = row.values as ExcelJS.CellValue[]
    for (let col = 1; col < values.length; col++) {
      cells[col - 1] = plainCellValue(values[col])
    }
    grid[rowNumber - 1] = cells
  })
  // eachRow skips fully-empty rows even with includeEmpty on some versions;
  // fill any holes so row numbers stay aligned.
  for (let i = 0; i < grid.length; i++) grid[i] ??= []
  return toParsedSheet(grid)
}

// ---------------------------------------------------------------------------
// Column-contract validation (PRD §8.2) — any error rejects the whole file
// ---------------------------------------------------------------------------

function asNumber(value: CellValue): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.replace(/^\+/, ""))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function asInteger(value: CellValue): number | null {
  const n = asNumber(value)
  return n !== null && Number.isInteger(n) ? n : null
}

function asText(value: CellValue): string {
  return value == null ? "" : String(value).trim()
}

/**
 * Validate raw rows against the 13-column contract. Returns either the fully
 * typed, normalized rows or the complete error list — a file with any
 * contract error is rejected whole; the caller must not partially import.
 */
export function validateSheet(
  parsed: ParsedSheet,
  categoryNames: string[]
): ValidationResult {
  const errors: string[] = []

  const missing = REQUIRED_COLUMNS.filter((c) => !parsed.header.includes(c))
  if (missing.length > 0) {
    return {
      ok: false,
      errors: [`Missing required column(s): ${missing.join(", ")}`],
    }
  }
  if (parsed.rows.length === 0) {
    return { ok: false, errors: ["The sheet has no data rows."] }
  }

  const categoryByLower = new Map(
    categoryNames.map((name) => [name.toLowerCase(), name])
  )

  const rows: SheetRow[] = []
  for (const { rowNumber, cells } of parsed.rows) {
    const rowErrors: string[] = []
    const fail = (msg: string) => rowErrors.push(`Row ${rowNumber}: ${msg}`)

    const phase = asInteger(cells.phase)
    if (phase !== 1 && phase !== 2) {
      fail(`phase must be 1 or 2 (got "${asText(cells.phase)}")`)
    }

    const statusRaw = asText(cells.status).toLowerCase()
    const status = (STATUS_VALUES as readonly string[]).includes(statusRaw)
      ? (statusRaw as SheetRow["status"])
      : null
    if (!status) {
      fail(
        `status must be open, closed, or hidden (got "${asText(cells.status)}")`
      )
    }

    const round = ROUND_MAP[asText(cells.round).toLowerCase()] ?? null
    if (!round) {
      fail(
        `round must be Tournament, Round 1, or Round 3 (got "${asText(cells.round)}")`
      )
    }

    const category =
      categoryByLower.get(asText(cells.category).toLowerCase()) ?? null
    if (!category) {
      fail(
        `unknown category "${asText(cells.category)}" — expected one of: ${categoryNames.join(", ")}`
      )
    }

    const sheetBetId = asInteger(cells.bet_id)
    if (sheetBetId === null || sheetBetId <= 0) {
      fail(`bet_id must be a positive integer (got "${asText(cells.bet_id)}")`)
    }
    const sheetPickId = asInteger(cells.pick_id)
    if (sheetPickId === null || sheetPickId <= 0) {
      fail(
        `pick_id must be a positive integer (got "${asText(cells.pick_id)}")`
      )
    }

    const betTitle = asText(cells.bet)
    if (!betTitle) fail("bet title is empty")
    const pickLabel = asText(cells.pick)
    if (!pickLabel) fail("pick label is empty")

    const americanOdds = asInteger(cells.american_odds)
    if (americanOdds === null || americanOdds === 0) {
      fail(
        `american_odds must be a nonzero integer (got "${asText(cells.american_odds)}")`
      )
    }

    // Display strings/values arrive verbatim (ADR 0001 §8) — validated for
    // presence and type only, never recomputed or reformatted.
    const fractionalOdds = asText(cells.fractional_odds)
    if (!fractionalOdds) fail("fractional_odds is empty")

    const probability = asNumber(cells.probability)
    if (probability === null) {
      fail(`probability must be a number (got "${asText(cells.probability)}")`)
    }

    const totalProbabilityRaw = asText(cells.total_probability)
    const totalProbability =
      totalProbabilityRaw === "" ? null : asNumber(cells.total_probability)
    if (totalProbabilityRaw !== "" && totalProbability === null) {
      fail(`total_probability must be a number (got "${totalProbabilityRaw}")`)
    }

    const resultRaw = asText(cells.result).toLowerCase()
    const result = (RESULT_VALUES as readonly string[]).includes(resultRaw)
      ? (resultRaw as SheetRow["result"])
      : null
    if (!result) {
      fail(
        `result must be Pending, Hit, Miss, Push, or Void (got "${asText(cells.result)}")`
      )
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors)
      continue
    }

    rows.push({
      rowNumber,
      phase: phase as 1 | 2,
      status: status!,
      round: round!,
      category: category!,
      sheetBetId: sheetBetId!,
      sheetPickId: sheetPickId!,
      betTitle,
      pickLabel,
      americanOdds: americanOdds!,
      fractionalOdds,
      probability: probability!,
      totalProbability,
      result: result!,
    })
  }

  // Cross-row checks (only meaningful over rows that parsed cleanly).

  // pick_id is unique across the whole sheet (DATA_MODEL §3.6).
  const pickIdRows = new Map<number, number[]>()
  for (const row of rows) {
    const list = pickIdRows.get(row.sheetPickId) ?? []
    list.push(row.rowNumber)
    pickIdRows.set(row.sheetPickId, list)
  }
  for (const [pickId, rowNumbers] of pickIdRows) {
    if (rowNumbers.length > 1) {
      errors.push(
        `Duplicate pick_id ${pickId} (rows ${rowNumbers.join(", ")}) — pick_id must be unique across the sheet`
      )
    }
  }

  // Every row of a bet must agree on the bet-level fields.
  const BET_FIELDS = [
    ["bet", (r: SheetRow) => r.betTitle],
    ["phase", (r: SheetRow) => r.phase],
    ["round", (r: SheetRow) => r.round],
    ["status", (r: SheetRow) => r.status],
    ["category", (r: SheetRow) => r.category],
    ["total_probability", (r: SheetRow) => r.totalProbability],
  ] as const
  const betRows = new Map<number, SheetRow[]>()
  for (const row of rows) {
    const list = betRows.get(row.sheetBetId) ?? []
    list.push(row)
    betRows.set(row.sheetBetId, list)
  }
  for (const [betId, group] of betRows) {
    for (const [field, get] of BET_FIELDS) {
      const values = new Set(group.map((r) => String(get(r))))
      if (values.size > 1) {
        errors.push(
          `bet_id ${betId} has conflicting ${field} values (rows ${group
            .map((r) => r.rowNumber)
            .join(", ")}): ${[...values].join(" / ")}`
        )
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, rows }
}

// ---------------------------------------------------------------------------
// Import plan: field-level diff against the DB (ADR 0001 §7)
//
// Upserts are keyed on the sheet's stable IDs — (tournament_id, sheet_bet_id)
// for bets, (bet_id, sheet_pick_id) for picks. Rows that match the DB
// field-for-field produce no write at all, so re-uploading an identical
// sheet is a true no-op and the report can honestly say "no changes".
// Placements are never touched (uploads only write bets/bet_picks).
// ---------------------------------------------------------------------------

export type ExistingBet = {
  id: string
  sheet_bet_id: number
  category_id: string
  title: string
  phase: number
  round: string
  status: string
  total_probability: number | string | null
}

export type ExistingPick = {
  id: string
  bet_id: string
  sheet_pick_id: number
  label: string
  american_odds: number
  fractional_odds: string
  probability: number | string
  player_user_id: string | null
  result: string
}

export type CategoryRow = { id: string; name: string }

export type UserRow = { id: string; display_name: string }

export type BetWrite = {
  sheet_bet_id: number
  category_id: string
  title: string
  phase: number
  round: string
  status: string
  total_probability: number | null
}

export type PickWrite = {
  /** Which bet this pick belongs to, by sheet ID — resolved to the bets.id
   *  uuid at apply time (new bets don't have uuids until inserted). */
  sheet_bet_id: number
  sheet_pick_id: number
  label: string
  american_odds: number
  fractional_odds: string
  probability: number
  player_user_id: string | null
  result: string
}

export type ImportPlan = {
  bets: {
    create: BetWrite[]
    update: (BetWrite & { id: string })[]
    unchanged: number
  }
  picks: {
    create: PickWrite[]
    update: (PickWrite & { id: string })[]
    unchanged: number
  }
  /** Pick labels (stroke suffix stripped, deduped) that matched no
   *  users.display_name — expected for "Field"/"Yes"/"No" and players who
   *  haven't logged in yet; fixed up by the admin in Studio. */
  unmatchedPickNames: string[]
  /** Picks whose odds differ from the DB. The route warns about the ones
   *  with live placements (harmless for payouts — placements snapshot odds
   *  at write time, PRD §7.1 — but the admin should know). */
  oddsChanges: OddsChange[]
}

export type OddsChange = {
  sheetPickId: number
  pickLabel: string
  betTitle: string
  from: { americanOdds: number; fractionalOdds: string }
  to: { americanOdds: number; fractionalOdds: string }
}

/**
 * Strip the stroke notation off a pick label: "Steve Jones (-5)" → "Steve
 * Jones", "Mike Yenzer (E)" → "Mike Yenzer" (ADR 0001 §11).
 */
export function stripStrokeSuffix(label: string): string {
  return label.replace(/\s*\((?:E|[+-]?\d+)\)\s*$/i, "").trim()
}

/** numeric columns come back from PostgREST as number or string; display
 *  strings are compared verbatim, numbers numerically. */
function numbersEqual(
  a: number | string | null,
  b: number | string | null
): boolean {
  if (a === null || b === null) return a === b
  return Number(a) === Number(b)
}

export function buildImportPlan(
  rows: SheetRow[],
  existingBets: ExistingBet[],
  existingPicks: ExistingPick[],
  categories: CategoryRow[],
  users: UserRow[]
): ImportPlan {
  const categoryIdByName = new Map(categories.map((c) => [c.name, c.id]))
  const userIdByName = new Map(
    users.map((u) => [u.display_name.trim().toLowerCase(), u.id])
  )
  const existingBetBySheetId = new Map(
    existingBets.map((b) => [b.sheet_bet_id, b])
  )
  const existingPickBySheetId = new Map(
    existingPicks.map((p) => [p.sheet_pick_id, p])
  )
  const betUuidToSheetId = new Map(
    existingBets.map((b) => [b.id, b.sheet_bet_id])
  )

  const plan: ImportPlan = {
    bets: { create: [], update: [], unchanged: 0 },
    picks: { create: [], update: [], unchanged: 0 },
    unmatchedPickNames: [],
    oddsChanges: [],
  }
  const unmatched = new Set<string>()

  // Bets: one write per distinct sheet bet_id (validation guaranteed all of
  // a bet's rows agree on the bet-level fields).
  const seenBetIds = new Set<number>()
  for (const row of rows) {
    if (seenBetIds.has(row.sheetBetId)) continue
    seenBetIds.add(row.sheetBetId)

    const write: BetWrite = {
      sheet_bet_id: row.sheetBetId,
      category_id: categoryIdByName.get(row.category)!,
      title: row.betTitle,
      phase: row.phase,
      round: row.round,
      status: row.status,
      total_probability: row.totalProbability,
    }

    const existing = existingBetBySheetId.get(row.sheetBetId)
    if (!existing) {
      plan.bets.create.push(write)
    } else if (
      existing.category_id !== write.category_id ||
      existing.title !== write.title ||
      existing.phase !== write.phase ||
      existing.round !== write.round ||
      existing.status !== write.status ||
      !numbersEqual(existing.total_probability, write.total_probability)
    ) {
      plan.bets.update.push({ ...write, id: existing.id })
    } else {
      plan.bets.unchanged++
    }
  }

  // Picks: keyed on the sheet-wide-unique pick_id.
  for (const row of rows) {
    const existing = existingPickBySheetId.get(row.sheetPickId)

    // Pick→player mapping (ADR 0001 §11): strip the stroke suffix, match
    // against display names. Unmatched leaves NULL on a new pick but
    // PRESERVES an existing link on update — admins hand-set links in
    // Studio for players who haven't logged in, and a re-upload must not
    // wipe that out.
    const strippedName = stripStrokeSuffix(row.pickLabel)
    const matchedUserId =
      userIdByName.get(strippedName.toLowerCase()) ?? null
    if (!matchedUserId) unmatched.add(strippedName)

    const write: PickWrite = {
      sheet_bet_id: row.sheetBetId,
      sheet_pick_id: row.sheetPickId,
      label: row.pickLabel,
      american_odds: row.americanOdds,
      fractional_odds: row.fractionalOdds,
      probability: row.probability,
      player_user_id: matchedUserId ?? existing?.player_user_id ?? null,
      result: row.result,
    }
    // A pick that somehow moved to a different bet is treated as an update
    // (its bet_id is rewritten at apply time).
    const movedBet =
      existing !== undefined &&
      betUuidToSheetId.get(existing.bet_id) !== row.sheetBetId

    if (
      existing &&
      (existing.american_odds !== write.american_odds ||
        existing.fractional_odds !== write.fractional_odds)
    ) {
      plan.oddsChanges.push({
        sheetPickId: row.sheetPickId,
        pickLabel: row.pickLabel,
        betTitle: row.betTitle,
        from: {
          americanOdds: existing.american_odds,
          fractionalOdds: existing.fractional_odds,
        },
        to: {
          americanOdds: write.american_odds,
          fractionalOdds: write.fractional_odds,
        },
      })
    }

    if (!existing) {
      plan.picks.create.push(write)
    } else if (
      movedBet ||
      existing.label !== write.label ||
      existing.american_odds !== write.american_odds ||
      existing.fractional_odds !== write.fractional_odds ||
      !numbersEqual(existing.probability, write.probability) ||
      existing.player_user_id !== write.player_user_id ||
      existing.result !== write.result
    ) {
      plan.picks.update.push({ ...write, id: existing.id })
    } else {
      plan.picks.unchanged++
    }
  }

  plan.unmatchedPickNames = [...unmatched].sort((a, b) => a.localeCompare(b))
  return plan
}
