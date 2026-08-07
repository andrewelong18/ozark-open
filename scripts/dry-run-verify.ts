// Walks the ENTIRE dry-run script against a throwaway local Postgres before
// any of it is pointed at production, and prints the payout table the session
// should land on.
//
// It exercises exactly what tomorrow evening exercises, in order:
//
//   00-reset → 10-accounts → upload sheet 1 → 20-phase1-placements
//   → upload 1b (the reprice) → upload sheet 2 (close + Round 1 results)
//   → upload sheet 3 (Phase 2 opens) → 30-phase2-placements
//   → upload sheet 4 (final results) → payout table → 90-teardown
//
// Two things it proves that nothing else does:
//
//   1. Every seeded wager is rule-valid — each one is re-run through the real
//      lib/validation.ts, so the "ballast" can't quietly break a §7 rule and
//      make the compliance views lie.
//   2. odds_at_placement does not move when a line is repriced. That is the
//      single most expensive thing to get wrong in September and the hardest
//      to notice by eye.
//
// The printed results table is the expected answer for Act 10, so the
// reconciliation step has something to check against even if Pat's workbook
// isn't ready.
//
// Run: bash scripts/dry-run-verify.sh   (sets up the cluster and calls this)

import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import {
  buildImportPlan,
  parseSheet,
  validateSheet,
  type CategoryRow,
  type ExistingBet,
  type ExistingPick,
  type ImportPlan,
  type UserRow,
} from "../lib/import.ts"
import {
  validatePlacement,
  checkPickMinimum,
  checkTournamentTotal,
  maxSingleBet,
  maxSelfBet,
  type ExistingPlacement,
  type TournamentRules,
} from "../lib/validation.ts"
import {
  buildResultsTable,
  normalizePayoutRows,
  roundCents,
  type PayoutViewQueryRow,
  type ResultsParticipant,
} from "../lib/payouts.ts"

const PGURI = process.env.PGURI ?? "postgresql://localhost:5432/ozark_roundtrip"
const ROOT = path.join(import.meta.dirname, "..")
const SHEETS = path.join(ROOT, "docs/dry-run/sheets")
const SQL = path.join(ROOT, "supabase/dry-run")

let failures = 0
function check(label: string, ok: boolean, detail?: string) {
  console.log(`  ${ok ? "✓" : "✗ FAIL"} ${label}${detail ? ` — ${detail}` : ""}`)
  if (!ok) failures++
}
function section(title: string) {
  console.log(`\n\x1b[1m── ${title} ${"─".repeat(Math.max(0, 62 - title.length))}\x1b[0m`)
}

function runSql(sql: string): string {
  return execFileSync("psql", [PGURI, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], {
    encoding: "utf-8",
  }).trim()
}
function runSqlFile(file: string): string {
  return execFileSync("psql", [PGURI, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", file], {
    encoding: "utf-8",
  })
}
function queryJson<T>(selectBody: string): T {
  return JSON.parse(runSql(`SELECT COALESCE(json_agg(t), '[]') FROM (${selectBody}) t`)) as T
}
function lit(value: string | number | null): string {
  if (value === null) return "NULL"
  if (typeof value === "number") return String(value)
  return `'${value.replace(/'/g, "''")}'`
}

// ---------------------------------------------------------------------------
// Import harness — the real lib/import.ts core, applied through psql
// ---------------------------------------------------------------------------

type DbState = { categories: CategoryRow[]; bets: ExistingBet[]; picks: ExistingPick[]; users: UserRow[] }

function fetchState(tid: string): DbState {
  const categories = queryJson<CategoryRow[]>("SELECT id, name FROM public.bet_categories")
  const bets = queryJson<ExistingBet[]>(
    `SELECT id, sheet_bet_id, category_id, title, phase, round, status, total_probability
       FROM public.bets WHERE tournament_id = ${lit(tid)}`
  )
  const picks =
    bets.length === 0
      ? []
      : queryJson<ExistingPick[]>(
          `SELECT id, bet_id, sheet_pick_id, label, american_odds, fractional_odds,
                  probability, player_user_id, result
             FROM public.bet_picks WHERE bet_id IN (${bets.map((b) => lit(b.id)).join(", ")})`
        )
  const users = queryJson<UserRow[]>("SELECT id, display_name FROM public.users")
  return { categories, bets, picks, users }
}

function applyPlan(plan: ImportPlan, tid: string) {
  const s: string[] = ["BEGIN;"]
  for (const b of plan.bets.create) {
    s.push(
      `INSERT INTO public.bets (tournament_id, category_id, sheet_bet_id, title, phase, round, status, total_probability)
       VALUES (${lit(tid)}, ${lit(b.category_id)}, ${b.sheet_bet_id}, ${lit(b.title)}, ${b.phase}, ${lit(b.round)}, ${lit(b.status)}, ${lit(b.total_probability)});`
    )
  }
  for (const b of plan.bets.update) {
    s.push(
      `UPDATE public.bets SET category_id = ${lit(b.category_id)}, title = ${lit(b.title)}, phase = ${b.phase},
        round = ${lit(b.round)}, status = ${lit(b.status)}, total_probability = ${lit(b.total_probability)}
       WHERE id = ${lit(b.id)};`
    )
  }
  const betRef = (sheetBetId: number) =>
    `(SELECT id FROM public.bets WHERE tournament_id = ${lit(tid)} AND sheet_bet_id = ${sheetBetId})`
  for (const p of plan.picks.create) {
    s.push(
      `INSERT INTO public.bet_picks (bet_id, sheet_pick_id, label, american_odds, fractional_odds, probability, player_user_id, result)
       VALUES (${betRef(p.sheet_bet_id)}, ${p.sheet_pick_id}, ${lit(p.label)}, ${p.american_odds}, ${lit(p.fractional_odds)}, ${lit(p.probability)}, ${lit(p.player_user_id)}, ${lit(p.result)});`
    )
  }
  for (const p of plan.picks.update) {
    s.push(
      `UPDATE public.bet_picks SET bet_id = ${betRef(p.sheet_bet_id)}, label = ${lit(p.label)},
        american_odds = ${p.american_odds}, fractional_odds = ${lit(p.fractional_odds)},
        probability = ${lit(p.probability)}, player_user_id = ${lit(p.player_user_id)}, result = ${lit(p.result)}
       WHERE id = ${lit(p.id)};`
    )
  }
  s.push("COMMIT;")
  runSql(s.join("\n"))
}

/** Upload one sheet the way /admin/import does, and assert re-upload is a no-op. */
async function upload(file: string, tid: string, opts: { expectIdempotent?: boolean } = {}) {
  const parsed = await parseSheet(fs.readFileSync(path.join(SHEETS, file)), file)
  const state = fetchState(tid)
  const validation = validateSheet(parsed, state.categories.map((c) => c.name))
  if (!validation.ok) throw new Error(`${file} failed the column contract:\n${validation.errors.join("\n")}`)

  const plan = buildImportPlan(validation.rows, state.bets, state.picks, state.categories, state.users)

  // Mirror the route's warning step (app/api/admin/import/route.ts:220-250):
  // an odds change only warrants a warning when that pick already carries
  // live wagers. Computed before apply, while the old prices are still known.
  const changedUuids = state.picks
    .filter((p) => plan.oddsChanges.some((c) => c.sheetPickId === p.sheet_pick_id))
    .map((p) => p.id)
  const withPlacements = new Set(
    changedUuids.length === 0
      ? []
      : queryJson<{ sheet_pick_id: number }[]>(
          `SELECT DISTINCT pk.sheet_pick_id FROM public.bet_placements p
             JOIN public.bet_picks pk ON pk.id = p.pick_id
            WHERE p.deleted_at IS NULL AND p.pick_id IN (${changedUuids.map(lit).join(", ")})`
        ).map((r) => r.sheet_pick_id)
  )
  const warnings = [
    // Sheet-level warnings (stale-open bets, #97), same as the route reports.
    ...validation.warnings,
    ...plan.oddsChanges
      .filter((c) => withPlacements.has(c.sheetPickId))
      .map(
        (c) =>
          `Odds changed on "${c.pickLabel}" (${c.betTitle}) while it has live placements: ` +
          `${c.from.fractionalOdds} → ${c.to.fractionalOdds}.`
      ),
  ]

  applyPlan(plan, tid)
  console.log(
    `  uploaded ${file}: bets +${plan.bets.create.length}/~${plan.bets.update.length}/=${plan.bets.unchanged}, ` +
      `picks +${plan.picks.create.length}/~${plan.picks.update.length}/=${plan.picks.unchanged}` +
      (warnings.length ? `, ${warnings.length} warning(s)` : "") +
      (plan.unmatchedPickNames.length ? `, ${plan.unmatchedPickNames.length} unmatched name(s)` : "")
  )

  if (opts.expectIdempotent !== false) {
    const after = fetchState(tid)
    const again = buildImportPlan(validation.rows, after.bets, after.picks, after.categories, after.users)
    check(
      `re-uploading ${file} is a true no-op`,
      again.bets.create.length === 0 && again.bets.update.length === 0 &&
        again.picks.create.length === 0 && again.picks.update.length === 0,
      `bets +${again.bets.create.length}/~${again.bets.update.length}, picks +${again.picks.create.length}/~${again.picks.update.length}`
    )
  }
  return { ...plan, warnings }
}

// ---------------------------------------------------------------------------

type SeededPlacement = {
  email: string
  display_name: string
  entry_fee: number
  is_player: boolean
  user_id: string
  pick_id: string
  bet_id: string
  sheet_pick_id: number
  phase: 1 | 2
  amount: number
  odds_at_placement: number
  pick_player_user_id: string | null
  allows_multiple_picks: boolean
  bet_status: "hidden" | "open" | "closed"
}

function fetchPlacements(): SeededPlacement[] {
  return queryJson<SeededPlacement[]>(`
    SELECT u.email, u.display_name, tp.entry_fee, tp.is_player, p.user_id,
           p.pick_id, pk.bet_id, pk.sheet_pick_id, b.phase, p.amount,
           p.odds_at_placement, pk.player_user_id AS pick_player_user_id,
           c.allows_multiple_picks, b.status AS bet_status
      FROM public.bet_placements p
      JOIN public.bet_picks pk ON pk.id = p.pick_id
      JOIN public.bets b ON b.id = pk.bet_id
      JOIN public.bet_categories c ON c.id = b.category_id
      JOIN public.users u ON u.id = p.user_id
      JOIN public.tournament_participants tp ON tp.user_id = u.id
     WHERE p.deleted_at IS NULL`)
}

/**
 * Re-run every seeded wager through the real rules engine. Rebuilds each
 * bettor's slate one placement at a time, in the order they'd have been
 * placed, so running totals and pick counts accumulate exactly as the API
 * would see them.
 */
function auditPlacements(rules: TournamentRules, label: string) {
  const rows = fetchPlacements()
  const byUser = new Map<string, SeededPlacement[]>()
  for (const r of rows) {
    const list = byUser.get(r.user_id)
    if (list) list.push(r)
    else byUser.set(r.user_id, [r])
  }

  const pickPlayers = queryJson<{ bet_id: string; player_user_id: string | null }[]>(
    "SELECT bet_id, player_user_id FROM public.bet_picks"
  )
  const playersByBet = new Map<string, (string | null)[]>()
  for (const p of pickPlayers) {
    const list = playersByBet.get(p.bet_id)
    if (list) list.push(p.player_user_id)
    else playersByBet.set(p.bet_id, [p.player_user_id])
  }

  let bad = 0
  for (const [, slate] of byUser) {
    const placed: ExistingPlacement[] = []
    for (const row of slate) {
      const result = validatePlacement(
        {
          bettor: { user_id: row.user_id, entry_fee: row.entry_fee, is_player: row.is_player },
          pick: { id: row.pick_id, player_user_id: row.pick_player_user_id },
          bet: {
            id: row.bet_id,
            // The seed writes directly, so judge it against the state the bet
            // was in when a human would have placed: open.
            status: "open",
            phase: row.phase,
            allows_multiple_picks: row.allows_multiple_picks,
            pick_player_user_ids: playersByBet.get(row.bet_id) ?? [],
          },
          existing: placed,
        },
        row.amount,
        rules
      )
      if (!result.ok) {
        console.log(`    ✗ ${row.display_name} $${row.amount} on pick ${row.sheet_pick_id}: ${result.errors.join("; ")}`)
        bad++
      }
      placed.push({
        pick_id: row.pick_id,
        bet_id: row.bet_id,
        phase: row.phase,
        amount: row.amount,
        pick_player_user_id: row.pick_player_user_id,
      })
    }
  }
  check(`${label}: every seeded wager passes lib/validation.ts`, bad === 0, `${bad} violation(s)`)
  return byUser
}

// ---------------------------------------------------------------------------

async function main() {
  const tid = runSql("SELECT id FROM public.tournaments WHERE year = 2026")
  if (!tid) throw new Error("No 2026 tournament — apply the migrations first.")
  const rules = queryJson<TournamentRules[]>(
    `SELECT entry_fee_min, entry_fee_max, min_picks_per_tournament, max_picks_per_phase,
            max_single_bet_pct::float8 AS max_single_bet_pct, max_single_bet_cap,
            max_self_bet_pct::float8 AS max_self_bet_pct, max_self_bet_cap
       FROM public.tournaments WHERE year = 2026`
  )[0]

  // ── Reproduce production's actual starting state ────────────────────────
  // Prod already holds the sample menu — 19 bets / 87 picks, imported in July,
  // with every Phase 1 result filled in. Starting from an empty database would
  // make the first upload report "19 created" when the real session will see
  // updates, and the gameplan quotes those numbers. So import the sample sheet
  // first and let the reset rewind it, exactly as tomorrow evening will.
  section("Reproducing production's current state")
  const sampleParsed = await parseSheet(
    fs.readFileSync(path.join(ROOT, "docs/import/bets-sample.xlsx")),
    "bets-sample.xlsx"
  )
  const sampleState = fetchState(tid)
  const sampleValidation = validateSheet(sampleParsed, sampleState.categories.map((c) => c.name))
  if (!sampleValidation.ok) throw new Error(sampleValidation.errors.join("\n"))
  applyPlan(
    buildImportPlan(sampleValidation.rows, sampleState.bets, sampleState.picks, sampleState.categories, sampleState.users),
    tid
  )
  check("19 bets / 87 picks, as in production", runSql("SELECT count(*) FROM public.bets") === "19")
  check(
    "Phase 1 arrives already adjudicated, as in production",
    Number(runSql("SELECT count(*) FROM public.bet_picks WHERE result <> 'pending'")) === 57
  )

  // ── Part 0 · pre-session setup ──────────────────────────────────────────
  section("Part 0 · reset + simulated pool")
  runSqlFile(path.join(SQL, "00-reset.sql"))
  check("reset leaves no placements", runSql("SELECT count(*) FROM public.bet_placements") === "0")
  check("reset hides the whole menu", runSql("SELECT count(*) FROM public.bets WHERE status <> 'hidden'") === "0")
  check("reset clears every result", runSql("SELECT count(*) FROM public.bet_picks WHERE result <> 'pending'") === "0")

  runSqlFile(path.join(SQL, "10-accounts.sql"))
  check("12 simulated accounts", runSql("SELECT count(*) FROM public.users WHERE email LIKE '%@dryrun.ozark.test'") === "12")
  check(
    "newbie@ is un-onboarded (middleware will force /onboarding)",
    runSql("SELECT onboarded_at IS NULL FROM public.users WHERE email = 'newbie@dryrun.ozark.test'") === "t"
  )
  check(
    "newbie@ and pending@ have no participant row (browse-only)",
    runSql(`SELECT count(*) FROM public.users u LEFT JOIN public.tournament_participants tp ON tp.user_id = u.id
             WHERE u.email IN ('newbie@dryrun.ozark.test','pending@dryrun.ozark.test') AND tp.user_id IS NULL`) === "2"
  )
  check(
    "Casey Sideline is the non-player",
    runSql(`SELECT tp.is_player FROM public.tournament_participants tp JOIN public.users u ON u.id = tp.user_id
             WHERE u.email = 'casey.sideline@dryrun.ozark.test'`) === "f"
  )

  // The derived limits the gameplan quotes at Pat.
  section("Derived limits per entry fee (lib/validation.ts)")
  for (const fee of [20, 25, 30, 35, 40, 50]) {
    console.log(`  $${fee} entry → max single $${maxSingleBet(fee, rules)} · max on yourself $${maxSelfBet(fee, rules)}`)
  }
  check("$25 entry floors to $12, not $13", maxSingleBet(25, rules) === 12, `got $${maxSingleBet(25, rules)}`)
  check("$50 entry is capped at $20, not $25", maxSingleBet(50, rules) === 20, `got $${maxSingleBet(50, rules)}`)

  // ── Act 3 · Phase 1 opens ───────────────────────────────────────────────
  section("Act 3 · Phase 1 opens")
  await upload("1-phase1-open.xlsx", tid)
  check("13 Phase 1 bets open", runSql("SELECT count(*) FROM public.bets WHERE phase = 1 AND status = 'open'") === "13")
  check("6 Phase 2 bets still hidden", runSql("SELECT count(*) FROM public.bets WHERE phase = 2 AND status = 'hidden'") === "6")
  check("nothing is adjudicated yet", runSql("SELECT count(*) FROM public.bet_picks WHERE result <> 'pending'") === "0")

  const linked = Number(runSql("SELECT count(*) FROM public.bet_picks WHERE player_user_id IS NOT NULL"))
  check("the import name-matched picks to sim accounts", linked >= 40, `${linked} picks linked`)
  check(
    "stroke suffixes are stripped — 'Jake Kohne (E)' links to Jake Kohne",
    runSql(`SELECT u.display_name FROM public.bet_picks pk JOIN public.users u ON u.id = pk.player_user_id
             WHERE pk.sheet_pick_id = 43`) === "Jake Kohne"
  )
  check(
    "'Field' is never linked to anyone (Q10)",
    runSql("SELECT count(*) FROM public.bet_picks WHERE label = 'Field' AND player_user_id IS NOT NULL") === "0"
  )

  // ── Act 3.5 / 4 · wagers ────────────────────────────────────────────────
  section("Act 3.5 · Phase 1 wagers")
  runSqlFile(path.join(SQL, "20-phase1-placements.sql"))
  check(
    "20-phase1-placements.sql seeds 8 bettors / 42 wagers",
    runSql("SELECT count(*) FROM public.bet_placements") === "42" &&
      runSql("SELECT count(DISTINCT user_id) FROM public.bet_placements") === "8",
    `${runSql("SELECT count(*) FROM public.bet_placements")} rows`
  )
  // #95: these files claim to be idempotent, and now are — the wipe is its own
  // statement, so the INSERT can see it. Before the fix a second run aborted on
  // bet_placements_user_id_pick_id_key, which is exactly the state Act 4's
  // fallback is reached in. Re-running here is the only positive test for it.
  runSqlFile(path.join(SQL, "20-phase1-placements.sql"))
  check(
    "re-running it is a no-op, not a duplicate-key abort (#95)",
    runSql("SELECT count(*) FROM public.bet_placements") === "42"
  )

  // The hand-driven slates stand in for Act 4's browser session so the
  // printed payout table is the whole pool, not two thirds of it.
  runSqlFile(path.join(SQL, "25-phase1-handdriven-fallback.sql"))
  const afterFallback = runSql("SELECT count(*) FROM public.bet_placements")
  runSqlFile(path.join(SQL, "25-phase1-handdriven-fallback.sql"))
  check(
    "the Phase 1 fallback survives being run over its own rows (#95)",
    runSql("SELECT count(*) FROM public.bet_placements") === afterFallback,
    `${afterFallback} → ${runSql("SELECT count(*) FROM public.bet_placements")}`
  )
  auditPlacements(rules, "Phase 1")

  check(
    "self-picks are flagged for admin review in every category (A9)",
    Number(runSql("SELECT count(*) FROM public.bet_placements WHERE requires_admin_review")) >= 15,
    `${runSql("SELECT count(*) FROM public.bet_placements WHERE requires_admin_review")} flagged`
  )

  const oddsBefore = queryJson<{ display_name: string; odds_at_placement: number }[]>(
    `SELECT u.display_name, p.odds_at_placement FROM public.bet_placements p
       JOIN public.bet_picks pk ON pk.id = p.pick_id JOIN public.users u ON u.id = p.user_id
      WHERE pk.sheet_pick_id = 1`
  )
  check(`${oddsBefore.length} bettors are on pick 1 at +110`, oddsBefore.every((r) => r.odds_at_placement === 110))

  // ── Act 5 · the reprice ─────────────────────────────────────────────────
  section("Act 5 · the reprice (odds snapshot integrity)")
  const repricePlan = await upload("1b-phase1-repriced.xlsx", tid)
  check(
    "the import report warns about a repriced pick that already has wagers",
    repricePlan.warnings.length > 0,
    repricePlan.warnings[0] ?? "no warning raised"
  )
  check("the live pick now shows -140", runSql("SELECT american_odds FROM public.bet_picks WHERE sheet_pick_id = 1") === "-140")
  const oddsAfter = queryJson<{ odds_at_placement: number }[]>(
    `SELECT p.odds_at_placement FROM public.bet_placements p
       JOIN public.bet_picks pk ON pk.id = p.pick_id WHERE pk.sheet_pick_id = 1`
  )
  check(
    "EVERY existing wager keeps its +110 snapshot (PRD §7.1)",
    oddsAfter.length === oddsBefore.length && oddsAfter.every((r) => r.odds_at_placement === 110),
    oddsAfter.map((r) => r.odds_at_placement).join(", ")
  )
  check(
    "the repriced fractional odds moved with the line",
    runSql("SELECT fractional_odds FROM public.bet_picks WHERE sheet_pick_id = 1") === "7/12"
  )

  // ── Act 6 · close Phase 1, Round 1 results ──────────────────────────────
  section("Act 6–7 · Phase 1 closes, Round 1 results land")
  // #98: this used to flag 13 of 14 people on off_exact_total at Phase 1
  // close, burying the one real straggler. The bar is no longer "Devin is in
  // there somewhere" — it is that the phone line names him AND NOBODY ELSE.
  const compliance = runSqlFile(path.join(ROOT, "docs/admin/phase-compliance.sql"))
  const chaseLine = compliance
    .split("\n")
    .find((l) => l.includes("TEXT THESE PEOPLE"))
    ?.trim() ?? ""
  console.log(`      ${chaseLine}`)
  check("the chase list is scoped to the Phase 1 close", /Closing Phase 1/.test(chaseLine), chaseLine)
  check("it names Devin Arand's 3 picks", /Devin Arand \(3 of 5 picks\)/.test(chaseLine), chaseLine)
  check(
    "and nobody else — one name on the line",
    chaseLine.split(" — TEXT THESE PEOPLE: ")[1]?.split("), ").length === 1,
    chaseLine
  )
  check(
    "off-exact-total alone doesn't chase anyone at Phase 1 close (#98)",
    !/of \$/.test(chaseLine),
    chaseLine
  )

  await upload("2-phase1-closed-r1-results.xlsx", tid)
  check("13 Phase 1 bets closed", runSql("SELECT count(*) FROM public.bets WHERE phase = 1 AND status = 'closed'") === "13")
  check(
    "Match 8 came back Void, not Miss",
    runSql("SELECT count(*) FROM public.bet_picks WHERE sheet_pick_id IN (46,47) AND result = 'void'") === "2"
  )
  check(
    "the pushes survived the round trip",
    runSql("SELECT count(*) FROM public.bet_picks WHERE result = 'push'") === "4"
  )
  check("Phase 2 is still pending and hidden", runSql("SELECT count(*) FROM public.bet_picks pk JOIN public.bets b ON b.id = pk.bet_id WHERE b.phase = 2 AND pk.result <> 'pending'") === "0")

  // ── Act 8–9 · Phase 2 ───────────────────────────────────────────────────
  section("Act 8–9 · Phase 2 opens, then closes")
  await upload("3-phase2-open.xlsx", tid)
  check("6 Phase 2 bets open", runSql("SELECT count(*) FROM public.bets WHERE phase = 2 AND status = 'open'") === "6")

  const phase1Rows = runSql(
    `SELECT count(*) FROM public.bet_placements p
       JOIN public.bet_picks pk ON pk.id = p.pick_id
       JOIN public.bets b ON b.id = pk.bet_id WHERE b.phase = 1`
  )
  runSqlFile(path.join(SQL, "30-phase2-placements.sql"))
  runSqlFile(path.join(SQL, "35-phase2-handdriven-fallback.sql"))
  const afterPhase2 = runSql("SELECT count(*) FROM public.bet_placements")
  // Same re-run guard as Phase 1 (#95), plus the promise both files make in
  // their headers: a Phase 2 re-seed must not touch Phase 1's odds snapshots.
  runSqlFile(path.join(SQL, "30-phase2-placements.sql"))
  runSqlFile(path.join(SQL, "35-phase2-handdriven-fallback.sql"))
  check(
    "the Phase 2 slates are re-runnable, and leave Phase 1 alone (#95)",
    runSql("SELECT count(*) FROM public.bet_placements") === afterPhase2 &&
      runSql(
        `SELECT count(*) FROM public.bet_placements p
           JOIN public.bet_picks pk ON pk.id = p.pick_id
           JOIN public.bets b ON b.id = pk.bet_id WHERE b.phase = 1`
      ) === phase1Rows
  )
  auditPlacements(rules, "both phases")

  // Rule 6 and rule 2's lower bound, evaluated the way Act 9 will.
  const finalSlates = fetchPlacements()
  const byUser = new Map<string, SeededPlacement[]>()
  for (const r of finalSlates) {
    const list = byUser.get(r.user_id)
    if (list) list.push(r)
    else byUser.set(r.user_id, [r])
  }
  let offExact = 0
  let underMin = 0
  for (const [, slate] of byUser) {
    const existing: ExistingPlacement[] = slate.map((r) => ({
      pick_id: r.pick_id, bet_id: r.bet_id, phase: r.phase, amount: r.amount,
      pick_player_user_id: r.pick_player_user_id,
    }))
    if (!checkTournamentTotal(existing, slate[0].entry_fee).exact) offExact++
    if (!checkPickMinimum(existing, rules).meets_minimum) underMin++
  }
  check("exactly one bettor is off the exact total (Devin)", offExact === 1, `${offExact} off`)
  // Deliberately changed by #96, not relaxed. Devin's 3 Phase 1 + 5 Phase 2 = 8
  // picks used to flag on the per-phase minimum; against a tournament-wide
  // minimum of 5 his split is legal, which is the whole point of the rule
  // change. He is STILL the one bettor who needs a text — on the exact total,
  // asserted above. If this ever reads 1 again, a per-phase minimum is back.
  check(
    "no bettor is under the tournament-wide minimum — Devin's 3+5 split is legal now (#96)",
    underMin === 0,
    `${underMin} under`
  )

  await upload("4-phase2-closed-final.xlsx", tid)
  check("every bet is closed", runSql("SELECT count(*) FROM public.bets WHERE status <> 'closed'") === "0")
  check("nothing is left pending", runSql("SELECT count(*) FROM public.bet_picks WHERE result = 'pending'") === "0")
  check(
    "Match - Round 3 came back Void",
    runSql("SELECT count(*) FROM public.bet_picks WHERE sheet_pick_id IN (82,83) AND result = 'void'") === "2"
  )

  // ── Act 10 · the payout table ───────────────────────────────────────────
  section("Act 10 · final payouts (the expected answer for reconciliation)")
  runSql("UPDATE public.tournaments SET status = 'completed' WHERE year = 2026")

  const payoutRows = normalizePayoutRows(
    queryJson<PayoutViewQueryRow[]>(
      `SELECT placement_id, user_id, amount, result, theoretical_payout, refunded_stake
         FROM public.placement_payouts_view WHERE tournament_id = ${lit(tid)}`
    )
  )
  const participants = queryJson<ResultsParticipant[]>(
    `SELECT tp.user_id, u.display_name, tp.entry_fee
       FROM public.tournament_participants tp JOIN public.users u ON u.id = tp.user_id
      WHERE tp.tournament_id = ${lit(tid)} AND tp.revoked_at IS NULL`
  )
  const table = buildResultsTable(participants, payoutRows)

  const entrySum = participants.reduce((s, p) => s + p.entry_fee, 0)
  const voided = payoutRows.reduce((s, r) => s + r.refunded, 0)
  console.log(`\n  Entry fees collected  $${entrySum}`)
  console.log(`  Voided stakes        −$${voided}`)
  console.log(`  Pool (void-adjusted)  $${roundCents(table.pool)}`)
  console.log(`  Σ theoretical         $${roundCents(table.sum_theoretical)}`)
  console.log(`  Still pending          ${table.pending}\n`)
  console.log("  " + "Bettor".padEnd(18) + "Entry".padStart(7) + "Theo".padStart(10) + "Refund".padStart(9) + "Actual".padStart(10) + "P/L".padStart(10))
  console.log("  " + "─".repeat(64))
  for (const r of table.rows) {
    console.log(
      "  " + r.display_name.padEnd(18) +
        `$${r.entry_fee}`.padStart(7) +
        `$${roundCents(r.theoretical).toFixed(2)}`.padStart(10) +
        `$${roundCents(r.refunded).toFixed(2)}`.padStart(9) +
        `$${roundCents(r.actual).toFixed(2)}`.padStart(10) +
        `${r.profit_loss >= 0 ? "+" : "−"}$${Math.abs(roundCents(r.profit_loss)).toFixed(2)}`.padStart(10)
    )
  }
  console.log()

  check("the pool is entry fees minus voided stakes", roundCents(table.pool) === roundCents(entrySum - voided))
  check(
    "every dollar of the pool is paid out",
    Math.abs(table.rows.reduce((s, r) => s + r.actual, 0) - table.pool) < 0.01,
    `Σ actual = ${roundCents(table.rows.reduce((s, r) => s + r.actual, 0))}`
  )
  check("no placement is left pending", table.pending === 0)
  const steve = table.rows.find((r) => r.display_name === "Steve Esswein")
  check(
    "the paid-but-never-wagered control gets $0 and loses his entry",
    steve !== undefined && steve.actual === 0 && steve.profit_loss === -steve.entry_fee,
    steve ? `$${steve.actual} / ${steve.profit_loss}` : "missing"
  )
  const refunded = table.rows.filter((r) => r.refunded > 0)
  check(`${refunded.length} bettors get a void refund on top of their share`, refunded.length > 0)

  // ── The broken sheet ────────────────────────────────────────────────────
  section("Act 3 · the broken file must write nothing")
  const before = runSql("SELECT count(*) || '/' || (SELECT count(*) FROM public.bet_picks) FROM public.bets")
  const parsedBroken = await parseSheet(fs.readFileSync(path.join(SHEETS, "X-broken.xlsx")), "X-broken.xlsx")
  const brokenState = fetchState(tid)
  const brokenValidation = validateSheet(parsedBroken, brokenState.categories.map((c) => c.name))
  check("the file is rejected outright", !brokenValidation.ok)
  if (!brokenValidation.ok) {
    for (const e of brokenValidation.errors.slice(0, 4)) console.log(`      ${e}`)
    check("the bad status is caught", brokenValidation.errors.some((e) => /status/i.test(e)))
    check("the zero odds are caught", brokenValidation.errors.some((e) => /odds/i.test(e)))
    check("the duplicate pick_id is caught", brokenValidation.errors.some((e) => /pick_id/i.test(e)))
  }
  check("not one row reached the database", runSql("SELECT count(*) || '/' || (SELECT count(*) FROM public.bet_picks) FROM public.bets") === before, before)

  // ── Results on a live book (#97) ────────────────────────────────────────
  // The Jul 31 mistake, rehearsed. Every row here is contract-valid on its
  // own; only the status/result pairing is wrong. Before Sprint 22 this file
  // imported cleanly and published Round 1 verdicts onto bets that were still
  // taking stakes.
  section("Act 3b · results on an open book must be refused")
  const parsedLive = await parseSheet(
    fs.readFileSync(path.join(SHEETS, "X-results-on-open.xlsx")),
    "X-results-on-open.xlsx"
  )
  const liveState = fetchState(tid)
  const liveValidation = validateSheet(parsedLive, liveState.categories.map((c) => c.name))
  check("the file is rejected outright", !liveValidation.ok)
  if (!liveValidation.ok) {
    for (const e of liveValidation.errors.slice(0, 3)) console.log(`      ${e}`)
    check(
      "every error names its row and says why",
      liveValidation.errors.every((e) =>
        /^Row \d+: result ".+" on bet_id \d+, which is still open — results may only be published on a closed bet\./.test(e)
      )
    )
    check(
      "one error per verdict-bearing row (57 Phase 1 picks)",
      liveValidation.errors.length === 57,
      `${liveValidation.errors.length} errors`
    )
  }
  check("not one row reached the database", runSql("SELECT count(*) || '/' || (SELECT count(*) FROM public.bet_picks) FROM public.bets") === before, before)

  // ── Teardown ────────────────────────────────────────────────────────────
  section("Part 2 · teardown")
  runSqlFile(path.join(SQL, "90-teardown.sql"))
  check("every simulated account is gone", runSql("SELECT count(*) FROM public.users WHERE email LIKE '%@dryrun.ozark.test'") === "0")
  check("every wager is gone", runSql("SELECT count(*) FROM public.bet_placements") === "0")
  check("the real accounts survived", Number(runSql("SELECT count(*) FROM public.users")) >= 1)
  check("the menu survived", runSql("SELECT count(*) FROM public.bets") === "19")

  console.log()
  if (failures > 0) {
    console.error(`\x1b[31m${failures} check(s) failed.\x1b[0m`)
    process.exit(1)
  }
  console.log("\x1b[32mThe whole dry-run script passes end to end.\x1b[0m")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
