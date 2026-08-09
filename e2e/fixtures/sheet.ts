// Building the admin's bets spreadsheet from whatever is currently in the menu.
//
// The app has exactly one way to change a bet's status or publish a result: an
// admin uploads a spreadsheet at /admin/import and the rows upsert by their
// sheet IDs (ADR 0001). So a journey that wants to close a bet, or settle one,
// has to do it the way Pat does — with a file. That's the point; a spec that
// reached into the database to flip `status` would be testing a state the app
// can't actually reach.
//
// This reads the live menu and writes it back out in the 13-column contract
// (lib/import.ts REQUIRED_COLUMNS), applying whatever overrides the caller
// asks for. Same idea as scripts/make-dry-run-sheets.ts, scoped to the E2E
// fixture's 13-bet menu.

import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import ExcelJS from "exceljs"
import { createClient } from "@supabase/supabase-js"

import { magicLinkConfigFromEnv } from "../../scripts/magic-link.ts"

const ROUND_LABEL: Record<string, string> = {
  tournament: "Tournament",
  round_1: "Round 1",
  round_3: "Round 3",
}

type MenuPick = {
  sheet_pick_id: number
  label: string
  american_odds: number
  fractional_odds: string
  probability: number | string
  result: string
}

type MenuBet = {
  sheet_bet_id: number
  title: string
  phase: number
  round: string
  status: string
  total_probability: number | string | null
  bet_categories: { name: string } | { name: string }[] | null
  bet_picks: MenuPick[]
}

export type SheetOverride = {
  /** Which bets to touch, by the sheet's bet_id. */
  betIds: number[]
  status?: "open" | "closed" | "hidden"
  /** Applied to every pick on those bets. */
  result?: "pending" | "hit" | "miss" | "push" | "void"
  /** Applied to named picks only, by sheet pick_id — wins over `result`. */
  resultByPick?: Record<number, "pending" | "hit" | "miss" | "push" | "void">
}

/**
 * Write the current menu to a .xlsx in a temp dir and return its path, with
 * `overrides` applied. Odds, labels and probabilities are copied verbatim —
 * they're the sheet's values and the app never recomputes them.
 */
export async function buildMenuSheet(overrides: SheetOverride[] = []): Promise<string> {
  const { supabaseUrl, serviceRoleKey } = magicLinkConfigFromEnv()
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await supabase
    .from("bets")
    .select(
      "sheet_bet_id, title, phase, round, status, total_probability, bet_categories ( name ), bet_picks ( sheet_pick_id, label, american_odds, fractional_odds, probability, result )"
    )
    .order("sheet_bet_id")
  if (error) throw new Error(`Couldn't read the menu: ${error.message}`)

  const bets = (data ?? []) as unknown as MenuBet[]

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Bets")
  sheet.addRow([
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
  ])

  for (const bet of [...bets].sort((a, b) => a.sheet_bet_id - b.sheet_bet_id)) {
    const applies = overrides.filter((o) => o.betIds.includes(bet.sheet_bet_id))
    const status = applies.reduce<string>((acc, o) => o.status ?? acc, bet.status)
    const category = Array.isArray(bet.bet_categories)
      ? (bet.bet_categories[0]?.name ?? "")
      : (bet.bet_categories?.name ?? "")

    for (const pick of [...bet.bet_picks].sort((a, b) => a.sheet_pick_id - b.sheet_pick_id)) {
      const result = applies.reduce<string>(
        (acc, o) => o.resultByPick?.[pick.sheet_pick_id] ?? o.result ?? acc,
        pick.result
      )
      sheet.addRow([
        bet.phase,
        status,
        ROUND_LABEL[bet.round] ?? bet.round,
        category,
        bet.sheet_bet_id,
        pick.sheet_pick_id,
        bet.title,
        pick.label,
        pick.american_odds,
        pick.fractional_odds,
        Number(pick.probability),
        bet.total_probability == null ? "" : Number(bet.total_probability),
        result,
      ])
    }
  }

  const dir = await mkdtemp(join(tmpdir(), "ozark-e2e-sheet-"))
  const path = join(dir, "bets.xlsx")
  await writeFile(path, Buffer.from(await workbook.xlsx.writeBuffer()))
  return path
}
