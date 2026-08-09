// The full-pool simulation, checked. Run by scripts/sim-pool-verify.sh, which
// stands up the database and loads supabase/seed-sim-pool.sql first.
//
// Two questions, both of which only mean anything at field size:
//
//   1. Is every one of the ~250 seeded wagers legal? The seed writes straight
//      to the table, bypassing the API, so this replays each one through the
//      real lib/validation.ts. A fixture that quietly breaks §7 would make
//      every downstream number a lie.
//   2. Does the money reconcile? Settle the whole board and the actual payouts
//      must sum back to the void-adjusted pool — to the cent, across 32 people.
//
// Same conventions as the other harnesses: psql over $PGURI, no client library,
// a check() counter, non-zero exit on failure.

import { execFileSync } from "node:child_process"

import {
  buildResultsTable,
  normalizePayoutRows,
  type PayoutViewQueryRow,
  type ResultsParticipant,
} from "../lib/payouts.ts"
import {
  validatePlacement,
  type ExistingPlacement,
  type TournamentRules,
} from "../lib/validation.ts"

const PGURI = process.env.PGURI ?? "postgresql://localhost:5432/ozark_simpool"

let failures = 0
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "  ✓" : "  ✗ FAIL"} ${label}${detail ? ` — ${detail}` : ""}`)
  if (!ok) failures++
}

function runSql(sql: string): string {
  return execFileSync("psql", [PGURI, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim()
}

function queryJson<T>(sql: string): T {
  // json_agg puts a newline between elements, so this parses the whole output
  // rather than the last line — the trick the smaller harnesses get away with
  // only holds for single-row results.
  const out = runSql(`SELECT COALESCE(json_agg(t), '[]') FROM (${sql}) t`)
  return JSON.parse(out) as T
}

type SeededWager = {
  user_id: string
  display_name: string
  entry_fee: number
  is_player: boolean
  pick_id: string
  bet_id: string
  sheet_pick_id: number
  phase: number
  amount: number
  allows_multiple_picks: boolean
  pick_player_user_id: string | null
}

function main() {
  const rules = queryJson<TournamentRules[]>(
    `SELECT entry_fee_min, entry_fee_max, max_picks_per_phase, min_picks_per_tournament,
            max_single_bet_pct::float8 AS max_single_bet_pct, max_single_bet_cap,
            max_self_bet_pct::float8 AS max_self_bet_pct, max_self_bet_cap
       FROM public.tournaments WHERE year = 2026`
  )[0]

  // -------------------------------------------------------------------------
  console.log("\n== the field ==")
  const members = queryJson<{ n: number; fees: number }[]>(
    `SELECT count(*)::int AS n, COALESCE(sum(tp.entry_fee), 0)::int AS fees
       FROM public.users u
       JOIN public.tournament_participants tp ON tp.user_id = u.id AND tp.revoked_at IS NULL
      WHERE u.email LIKE '%@sim.ozark.test'`
  )[0]
  check(`~32 approved members (got ${members.n})`, members.n >= 30 && members.n <= 34)

  const linked = queryJson<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM public.bet_picks pk
       JOIN public.users u ON u.id = pk.player_user_id
      WHERE u.email LIKE '%@sim.ozark.test'`
  )[0]
  check(`picks link to members who are also in the field (${linked.n} linked)`, linked.n > 0)

  // -------------------------------------------------------------------------
  console.log("\n== every wager is legal ==")
  const wagers = queryJson<SeededWager[]>(
    `SELECT pl.user_id, u.display_name, tp.entry_fee, tp.is_player,
            pl.pick_id, pk.bet_id, pk.sheet_pick_id, b.phase, pl.amount,
            c.allows_multiple_picks, pk.player_user_id AS pick_player_user_id
       FROM public.bet_placements pl
       JOIN public.users u ON u.id = pl.user_id
       JOIN public.tournament_participants tp ON tp.user_id = pl.user_id
       JOIN public.bet_picks pk ON pk.id = pl.pick_id
       JOIN public.bets b ON b.id = pk.bet_id
       JOIN public.bet_categories c ON c.id = b.category_id
      WHERE u.email LIKE '%@sim.ozark.test' AND pl.deleted_at IS NULL
      ORDER BY u.email, b.phase, pk.sheet_pick_id`
  )
  check(`the field placed real volume (${wagers.length} wagers)`, wagers.length >= 150)

  const playersByBet = new Map<string, (string | null)[]>()
  for (const p of queryJson<{ bet_id: string; player_user_id: string | null }[]>(
    "SELECT bet_id, player_user_id FROM public.bet_picks"
  )) {
    const list = playersByBet.get(p.bet_id)
    if (list) list.push(p.player_user_id)
    else playersByBet.set(p.bet_id, [p.player_user_id])
  }

  const bySlate = new Map<string, SeededWager[]>()
  for (const w of wagers) {
    const list = bySlate.get(w.user_id)
    if (list) list.push(w)
    else bySlate.set(w.user_id, [w])
  }

  let violations = 0
  for (const [, slate] of bySlate) {
    const placed: ExistingPlacement[] = []
    for (const w of slate) {
      const verdict = validatePlacement(
        {
          bettor: { user_id: w.user_id, entry_fee: w.entry_fee, is_player: w.is_player },
          pick: { id: w.pick_id, player_user_id: w.pick_player_user_id },
          bet: {
            id: w.bet_id,
            // The seed writes directly, so judge each wager against the state
            // the bet was in when a human would have placed it — the same
            // stance auditPlacements takes in scripts/dry-run-verify.ts.
            status: "open",
            phase: w.phase,
            phase_closed: false,
            allows_multiple_picks: w.allows_multiple_picks,
            pick_player_user_ids: playersByBet.get(w.bet_id) ?? [],
          },
          existing: placed,
        },
        w.amount,
        rules
      )
      if (!verdict.ok) {
        console.log(
          `    ✗ ${w.display_name} $${w.amount} on pick ${w.sheet_pick_id}: ${verdict.errors.join("; ")}`
        )
        violations++
      }
      placed.push({
        pick_id: w.pick_id,
        bet_id: w.bet_id,
        phase: w.phase,
        amount: w.amount,
        pick_player_user_id: w.pick_player_user_id,
      })
    }
  }
  check("every seeded wager passes lib/validation.ts", violations === 0, `${violations} violation(s)`)

  const short = queryJson<{ display_name: string; picks: number }[]>(
    `SELECT u.display_name, count(*)::int AS picks
       FROM public.bet_placements pl
       JOIN public.users u ON u.id = pl.user_id
      WHERE u.email LIKE '%@sim.ozark.test' AND pl.deleted_at IS NULL
      GROUP BY u.display_name
     HAVING count(*) < ${rules.min_picks_per_tournament}`
  )
  check(
    `nobody is under the ${rules.min_picks_per_tournament}-pick tournament minimum`,
    short.length === 0,
    short.map((s) => s.display_name).join(", ")
  )

  const over = queryJson<{ display_name: string; spent: number; entry_fee: number }[]>(
    `SELECT u.display_name, sum(pl.amount)::int AS spent, tp.entry_fee
       FROM public.bet_placements pl
       JOIN public.users u ON u.id = pl.user_id
       JOIN public.tournament_participants tp ON tp.user_id = pl.user_id
      WHERE u.email LIKE '%@sim.ozark.test' AND pl.deleted_at IS NULL
      GROUP BY u.display_name, tp.entry_fee
     HAVING sum(pl.amount) > tp.entry_fee`
  )
  check("nobody wagered more than their entry", over.length === 0,
    over.map((o) => `${o.display_name} $${o.spent}/$${o.entry_fee}`).join(", "))

  // -------------------------------------------------------------------------
  console.log("\n== the split reconciles at field size ==")
  // Settle the whole board so there is nothing pending — an unresolved pick
  // shrinks the denominator and inflates every share (#108). Deterministic, so
  // a re-run gives the same answer: one in seven voids, one in five pushes,
  // roughly a third hit.
  runSql(`
    UPDATE public.bet_picks pk
       SET result = CASE
             WHEN pk.sheet_pick_id % 7 = 0 THEN 'void'
             WHEN pk.sheet_pick_id % 5 = 0 THEN 'push'
             WHEN pk.sheet_pick_id % 3 = 0 THEN 'hit'
             ELSE 'miss' END
      FROM public.bets b, public.tournaments t
     WHERE pk.bet_id = b.id AND b.tournament_id = t.id AND t.year = 2026;
    UPDATE public.bets b SET status = 'closed'
      FROM public.tournaments t
     WHERE b.tournament_id = t.id AND t.year = 2026;`)

  const participants = queryJson<ResultsParticipant[]>(
    `SELECT tp.user_id, tp.entry_fee, u.display_name, u.nickname, u.avatar_url
       FROM public.tournament_participants tp
       JOIN public.users u ON u.id = tp.user_id
      WHERE tp.revoked_at IS NULL AND u.email LIKE '%@sim.ozark.test'`
  )
  const payoutRows = queryJson<PayoutViewQueryRow[]>(
    `SELECT v.placement_id, v.user_id, v.amount, v.result,
            v.theoretical_payout, v.refunded_stake
       FROM public.placement_payouts_view v
       JOIN public.users u ON u.id = v.user_id
      WHERE u.email LIKE '%@sim.ozark.test'`
  )

  const table = buildResultsTable(participants, normalizePayoutRows(payoutRows))

  check(`nothing left pending (${table.pending})`, table.pending === 0)

  const entryFees = participants.reduce((sum, p) => sum + p.entry_fee, 0)
  const refunded = table.rows.reduce((sum, r) => sum + r.refunded, 0)
  check(
    `pool = entry fees − voided stakes  ($${entryFees} − $${refunded} = $${table.pool})`,
    Math.abs(table.pool - (entryFees - refunded)) < 0.005
  )

  const paidOut = table.rows.reduce((sum, r) => sum + r.actual, 0)
  check(
    `every dollar in the pool is paid out (Σ $${paidOut.toFixed(2)} vs pool $${table.pool.toFixed(2)})`,
    Math.abs(paidOut - table.pool) < 0.02,
    `off by $${Math.abs(paidOut - table.pool).toFixed(4)}`
  )

  const winners = table.rows.filter((r) => r.actual > 0).length
  check(`the field has winners and losers (${winners} paid of ${table.rows.length})`,
    winners > 0 && winners < table.rows.length)

  console.log(
    failures === 0
      ? `\nThe full-pool simulation reconciles: ${members.n} members, ${wagers.length} wagers, $${table.pool.toFixed(2)} pool.`
      : `\n${failures} check(s) failed.`
  )
  if (failures > 0) process.exit(1)
}

main()
