// Sprint 2 round-trip test: import docs/import/bets-sample.xlsx into a
// throwaway local Postgres → the DB matches the sheet (19 bets / 87 picks,
// values verbatim); import it again → the plan is empty (zero changes).
//
// This runs the REAL ingestion core (lib/import.ts: parse → validate →
// name-match → diff/plan) and applies the plan through psql. Only the
// supabase-js apply layer in app/api/admin/import/route.ts is not exercised
// here — that half is verified in the browser against prod (see the Sprint 2
// "Done when").
//
// Setup (matches how Sprint 1 validated the migrations, no Supabase creds):
//   1. Local Postgres 16 with a stub auth schema:
//        CREATE SCHEMA auth;
//        CREATE TABLE auth.users (id uuid PRIMARY KEY);
//        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
//        CREATE ROLE authenticated; CREATE ROLE anon;
//   2. Apply supabase/migrations/*.sql in order (seeds the 2026 tournament).
//   3. Optionally apply supabase/seed-sample-phase1.sql — the importer must
//      upsert cleanly over the seeded Phase 1 menu (same sheet keys).
//   4. PGURI=postgresql://... node --experimental-strip-types scripts/import-roundtrip.ts
//
// The harness connects as a superuser, so RLS doesn't apply here — RLS is
// the route's concern and is untouched by this test.

import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import {
  buildImportPlan,
  parseSheet,
  planSweep,
  sweepIsEmpty,
  validateSheet,
  type CategoryRow,
  type ExistingBet,
  type ExistingPick,
  type ImportPlan,
  type PlacementRef,
  type SheetRow,
  type UserRow,
} from "../lib/import.ts"

const PGURI = process.env.PGURI ?? "postgresql://localhost:5432/ozark_roundtrip"
const SHEET = path.join(import.meta.dirname, "../docs/import/bets-sample.xlsx")

let failures = 0
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "  ✓" : "  ✗ FAIL"} ${label}${detail ? ` — ${detail}` : ""}`)
  if (!ok) failures++
}

function runSql(sql: string): string {
  return execFileSync(
    "psql",
    [PGURI, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
    { encoding: "utf-8" }
  ).trim()
}

function queryJson<T>(selectBody: string): T {
  const out = runSql(
    `SELECT COALESCE(json_agg(t), '[]') FROM (${selectBody}) t`
  )
  return JSON.parse(out) as T
}

function lit(value: string | number | null): string {
  if (value === null) return "NULL"
  if (typeof value === "number") return String(value)
  return `'${value.replace(/'/g, "''")}'`
}

type DbState = {
  categories: CategoryRow[]
  bets: ExistingBet[]
  picks: ExistingPick[]
  users: UserRow[]
}

function fetchState(tournamentId: string): DbState {
  const categories = queryJson<CategoryRow[]>(
    "SELECT id, name FROM public.bet_categories"
  )
  const bets = queryJson<ExistingBet[]>(
    `SELECT id, sheet_bet_id, category_id, title, phase, round, status, total_probability
     FROM public.bets WHERE tournament_id = ${lit(tournamentId)}`
  )
  const betIds = bets.map((b) => lit(b.id)).join(", ")
  const picks =
    bets.length === 0
      ? []
      : queryJson<ExistingPick[]>(
          `SELECT id, bet_id, sheet_pick_id, label, american_odds, fractional_odds,
                  probability, player_user_id, result
           FROM public.bet_picks WHERE bet_id IN (${betIds})`
        )
  const users = queryJson<UserRow[]>(
    "SELECT id, display_name FROM public.users"
  )
  return { categories, bets, picks, users }
}

// Mirrors the route's apply step, in SQL: create bets first (so picks can
// resolve bet uuids), then updates, then picks.
function applyPlan(plan: ImportPlan, tournamentId: string) {
  const statements: string[] = ["BEGIN;"]

  for (const b of plan.bets.create) {
    statements.push(
      `INSERT INTO public.bets (tournament_id, category_id, sheet_bet_id, title, phase, round, status, total_probability)
       VALUES (${lit(tournamentId)}, ${lit(b.category_id)}, ${b.sheet_bet_id}, ${lit(b.title)}, ${b.phase}, ${lit(b.round)}, ${lit(b.status)}, ${lit(b.total_probability)});`
    )
  }
  for (const b of plan.bets.update) {
    statements.push(
      `UPDATE public.bets SET category_id = ${lit(b.category_id)}, title = ${lit(b.title)}, phase = ${b.phase},
        round = ${lit(b.round)}, status = ${lit(b.status)}, total_probability = ${lit(b.total_probability)}
       WHERE id = ${lit(b.id)};`
    )
  }
  const betIdSubselect = (sheetBetId: number) =>
    `(SELECT id FROM public.bets WHERE tournament_id = ${lit(tournamentId)} AND sheet_bet_id = ${sheetBetId})`
  for (const p of plan.picks.create) {
    statements.push(
      `INSERT INTO public.bet_picks (bet_id, sheet_pick_id, label, american_odds, fractional_odds, probability, player_user_id, result)
       VALUES (${betIdSubselect(p.sheet_bet_id)}, ${p.sheet_pick_id}, ${lit(p.label)}, ${p.american_odds}, ${lit(p.fractional_odds)}, ${lit(p.probability)}, ${lit(p.player_user_id)}, ${lit(p.result)});`
    )
  }
  for (const p of plan.picks.update) {
    statements.push(
      `UPDATE public.bet_picks SET bet_id = ${betIdSubselect(p.sheet_bet_id)}, label = ${lit(p.label)},
        american_odds = ${p.american_odds}, fractional_odds = ${lit(p.fractional_odds)},
        probability = ${lit(p.probability)}, player_user_id = ${lit(p.player_user_id)}, result = ${lit(p.result)}
       WHERE id = ${lit(p.id)};`
    )
  }
  statements.push("COMMIT;")
  runSql(statements.join("\n"))
}

async function main() {
  const tournamentId = runSql(
    "SELECT id FROM public.tournaments WHERE year = 2026"
  )
  if (!tournamentId) throw new Error("No 2026 tournament — run the migrations first.")

  const parsed = await parseSheet(fs.readFileSync(SHEET), SHEET)
  const state0 = fetchState(tournamentId)
  const validation = validateSheet(parsed)
  if (!validation.ok) {
    console.error("Sheet failed contract validation:\n" + validation.errors.join("\n"))
    process.exit(1)
  }
  const rows = validation.rows

  console.log(`Starting state: ${state0.bets.length} bets, ${state0.picks.length} picks (pre-seeded menu expected here)`)

  // --- First import -------------------------------------------------------
  const plan1 = buildImportPlan(rows, state0.bets, state0.picks, state0.categories, state0.users)
  console.log(
    `First import plan: bets +${plan1.bets.create.length}/~${plan1.bets.update.length}/=${plan1.bets.unchanged}, ` +
      `picks +${plan1.picks.create.length}/~${plan1.picks.update.length}/=${plan1.picks.unchanged}, ` +
      `${plan1.unmatchedPickNames.length} unmatched names`
  )
  applyPlan(plan1, tournamentId)

  console.log("After first import:")
  const betCount = Number(runSql(`SELECT count(*) FROM public.bets WHERE tournament_id = ${lit(tournamentId)}`))
  const pickCount = Number(
    runSql(`SELECT count(*) FROM public.bet_picks p JOIN public.bets b ON b.id = p.bet_id WHERE b.tournament_id = ${lit(tournamentId)}`)
  )
  check("19 bets in DB", betCount === 19, `got ${betCount}`)
  check("87 picks in DB", pickCount === 87, `got ${pickCount}`)

  // Values land verbatim (ADR 0001 §8) — spot-check against known sheet cells.
  const spot = queryJson<
    { sheet_pick_id: number; label: string; american_odds: number; fractional_odds: string; probability: number; result: string }[]
  >(
    `SELECT p.sheet_pick_id, p.label, p.american_odds, p.fractional_odds, p.probability, p.result
     FROM public.bet_picks p JOIN public.bets b ON b.id = p.bet_id
     WHERE b.tournament_id = ${lit(tournamentId)} AND p.sheet_pick_id IN (1, 87)`
  )
  const pick1 = spot.find((p) => p.sheet_pick_id === 1)
  check(
    "pick 1 verbatim (Dan Mercer, 110, 11/10, hit)",
    pick1?.label === "Dan Mercer" &&
      pick1?.american_odds === 110 &&
      pick1?.fractional_odds === "11/10" &&
      Number(pick1?.probability) === 0.47619047619047616 &&
      pick1?.result === "hit",
    JSON.stringify(pick1)
  )
  const pick87 = spot.find((p) => p.sheet_pick_id === 87)
  check(
    "pick 87 verbatim (Odd, 120, 6/5, pending)",
    pick87?.label === "Odd" &&
      pick87?.american_odds === 120 &&
      pick87?.fractional_odds === "6/5" &&
      pick87?.result === "pending",
    JSON.stringify(pick87)
  )
  const hiddenPhase2 = Number(
    runSql(
      `SELECT count(*) FROM public.bets WHERE tournament_id = ${lit(tournamentId)} AND phase = 2 AND status = 'hidden'`
    )
  )
  check("6 Phase 2 bets, all hidden", hiddenPhase2 === 6, `got ${hiddenPhase2}`)

  // --- Second import: must be a no-op --------------------------------------
  const state1 = fetchState(tournamentId)
  const plan2 = buildImportPlan(rows, state1.bets, state1.picks, state1.categories, state1.users)
  console.log("Second import (idempotency):")
  check(
    "zero changes",
    plan2.bets.create.length === 0 &&
      plan2.bets.update.length === 0 &&
      plan2.picks.create.length === 0 &&
      plan2.picks.update.length === 0,
    `bets +${plan2.bets.create.length}/~${plan2.bets.update.length}, picks +${plan2.picks.create.length}/~${plan2.picks.update.length}`
  )
  check("all 19 bets unchanged", plan2.bets.unchanged === 19, `got ${plan2.bets.unchanged}`)
  check("all 87 picks unchanged", plan2.picks.unchanged === 87, `got ${plan2.picks.unchanged}`)

  // --- The sweep: rows the sheet no longer lists (Sprint 29) ---------------
  //
  // Pat, Sept 11 2026: a Phase 1 refresh left 19 stale bets live on the menu,
  // because the importer only ever added. These checks drive planSweep() and
  // public.sweep_bets() against the real database, including the two things a
  // unit test cannot prove: that the foreign key actually refuses a delete that
  // would orphan money, and that restore_snapshot() puts a swept bet back.
  console.log("\nSweep (Sprint 29):")

  const state2 = fetchState(tournamentId)
  const placementsFor = (picks: typeof state2.picks): PlacementRef[] =>
    picks.length === 0
      ? []
      : queryJson<{ pick_id: string; amount: number; bettorName: string }[]>(
          `SELECT pl.pick_id, pl.amount, u.display_name AS "bettorName"
             FROM public.bet_placements pl
             JOIN public.users u ON u.id = pl.user_id
            WHERE pl.pick_id IN (${picks.map((p) => lit(p.id)).join(", ")})`
        )

  // The rule the four weekend uploads depend on: a sheet that still lists
  // everything must sweep nothing at all.
  const noSweep = planSweep(rows, state2.bets, state2.picks, [])
  check("the reference sheet sweeps nothing", sweepIsEmpty(noSweep))

  // Drop a whole bet, and one pick out of a bet that survives.
  const DROPPED_BET = 19
  const DROPPED_PICK = 1
  const reduced: SheetRow[] = rows.filter(
    (r) => r.sheetBetId !== DROPPED_BET && r.sheetPickId !== DROPPED_PICK
  )

  // A bettor, and a wager on a pick of one more bet — the row the FK protects.
  const BETTOR = "0b9b1c2d-3e4f-4a5b-8c7d-9e0f1a2b3c4d"
  const WAGERED_BET = 18
  runSql(`
    INSERT INTO auth.users (id, email) VALUES (${lit(BETTOR)}, 'sweep@test.local')
      ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.tournament_participants (user_id, tournament_id, entry_fee, is_player)
      VALUES (${lit(BETTOR)}, ${lit(tournamentId)}, 40, true)
      ON CONFLICT (user_id, tournament_id) DO NOTHING;
    INSERT INTO public.bet_placements (user_id, pick_id, amount, odds_at_placement)
    SELECT ${lit(BETTOR)}, p.id, 7, p.american_odds
      FROM public.bet_picks p JOIN public.bets b ON b.id = p.bet_id
     WHERE b.tournament_id = ${lit(tournamentId)} AND b.sheet_bet_id = ${WAGERED_BET}
     ORDER BY p.sheet_pick_id LIMIT 1
    ON CONFLICT (user_id, pick_id) DO NOTHING;`)

  const snapshotId = runSql(
    "SELECT public.take_snapshot('pre-import', NULL)"
  )
  check("a save state was taken before the sweep", snapshotId.length === 36)

  const withWagered: SheetRow[] = reduced.filter(
    (r) => r.sheetBetId !== WAGERED_BET
  )
  const sweep = planSweep(
    withWagered,
    state2.bets,
    state2.picks,
    placementsFor(state2.picks)
  )
  check(
    `bet ${DROPPED_BET} is swept clean`,
    sweep.bets.clean.some((t) => t.sheetId === DROPPED_BET),
    JSON.stringify(sweep.bets.clean.map((t) => t.sheetId))
  )
  check(
    `pick ${DROPPED_PICK} is swept on its own, its bet surviving`,
    sweep.picks.clean.some((t) => t.sheetId === DROPPED_PICK),
    JSON.stringify(sweep.picks.clean.map((t) => t.sheetId))
  )
  check(
    `bet ${WAGERED_BET} is \`wagered\`, never \`clean\``,
    sweep.bets.wagered.some((t) => t.sheetId === WAGERED_BET) &&
      !sweep.bets.clean.some((t) => t.sheetId === WAGERED_BET),
    JSON.stringify(sweep.bets.wagered.map((t) => t.sheetId))
  )
  check(
    "the wagered bet names its bettor and amount",
    sweep.bets.wagered.find((t) => t.sheetId === WAGERED_BET)?.wagerTotal === 7,
    JSON.stringify(sweep.bets.wagered.find((t) => t.sheetId === WAGERED_BET))
  )

  // The refusal. Not the FK's raw 23503 — sweep_bets() names the bet first,
  // because this message reaches an admin on a phone.
  const allBetIds = [...sweep.bets.clean, ...sweep.bets.wagered].map((t) => t.id)
  const allPickIds = sweep.picks.clean.map((t) => t.id)
  let refused = ""
  try {
    runSql(
      `SELECT public.sweep_bets(ARRAY[${allBetIds.map(lit).join(", ")}]::uuid[],
                                ARRAY[${allPickIds.map(lit).join(", ")}]::uuid[],
                                false)`
    )
  } catch (err) {
    refused = String((err as { stderr?: string }).stderr ?? err)
  }
  check(
    "sweeping a wagered bet without clearing it is refused, by bet_id",
    refused.includes("still carries wagers") &&
      refused.includes(String(WAGERED_BET)),
    refused.split("\n")[0]
  )
  const survivedRefusal = Number(
    runSql(
      `SELECT count(*) FROM public.bets WHERE tournament_id = ${lit(tournamentId)}`
    )
  )
  check(
    "...and the refusal deleted nothing at all",
    survivedRefusal === 19,
    `got ${survivedRefusal}`
  )

  // The clean half alone goes through.
  const cleanResult = JSON.parse(
    runSql(
      `SELECT public.sweep_bets(ARRAY[${sweep.bets.clean.map((t) => lit(t.id)).join(", ")}]::uuid[],
                                ARRAY[${allPickIds.map(lit).join(", ")}]::uuid[],
                                false)`
    )
  ) as { bets: number; picks: number; placements: number }
  check(
    "the clean rows sweep: 1 bet, 1 loose pick, 0 placements",
    cleanResult.bets === 1 &&
      cleanResult.picks === 1 &&
      cleanResult.placements === 0,
    JSON.stringify(cleanResult)
  )
  check(
    `bet ${DROPPED_BET} is gone, and its picks with it`,
    Number(
      runSql(
        `SELECT count(*) FROM public.bet_picks p JOIN public.bets b ON b.id = p.bet_id
          WHERE b.tournament_id = ${lit(tournamentId)} AND b.sheet_bet_id = ${DROPPED_BET}`
      )
    ) === 0
  )

  // And with clearing asked for explicitly, the wagered bet goes too — the
  // hard delete PRD §12 A24 authorises.
  const clearedResult = JSON.parse(
    runSql(
      `SELECT public.sweep_bets(ARRAY[${sweep.bets.wagered.map((t) => lit(t.id)).join(", ")}]::uuid[],
                                ARRAY[]::uuid[], true)`
    )
  ) as { bets: number; picks: number; placements: number }
  check(
    "clearing wagers deletes the bet and the placement",
    clearedResult.bets === 1 && clearedResult.placements === 1,
    JSON.stringify(clearedResult)
  )
  check(
    "the bettor has no placement left",
    Number(
      runSql(
        `SELECT count(*) FROM public.bet_placements WHERE user_id = ${lit(BETTOR)}`
      )
    ) === 0
  )

  // The whole defence of the hard delete: the save state is the audit trail,
  // and it really does put the money back. Asserted, not asserted-about.
  runSql(`SELECT public.restore_snapshot(${lit(snapshotId)})`)
  check(
    "restoring the save state brings all 19 bets back",
    Number(
      runSql(
        `SELECT count(*) FROM public.bets WHERE tournament_id = ${lit(tournamentId)}`
      )
    ) === 19
  )
  check(
    "...and the cleared wager with them",
    Number(
      runSql(
        `SELECT count(*) FROM public.bet_placements WHERE user_id = ${lit(BETTOR)}`
      )
    ) === 1
  )

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`)
    process.exit(1)
  }
  console.log(
    "\nRound trip passed: DB matches the sheet; re-import is a no-op; the sweep " +
      "removes what the sheet dropped and refuses to orphan money."
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
