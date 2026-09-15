// The full-pool simulation, checked. Run by scripts/sim-pool-verify.sh, which
// stands up the database and loads supabase/seed-sim-pool.sql first.
//
// Two questions, both of which only mean anything at field size:
//
//   1. Is every one of the ~300 seeded wagers legal? The seed writes straight
//      to the table, bypassing the API, so this replays each one through the
//      real lib/validation.ts. A fixture that quietly breaks §7 would make
//      every downstream number a lie.
//   2. Does the money reconcile? Settle the whole board and, in EACH pot and
//      in the combined table (Sprint 30 / ADR 0002), every dollar in is the
//      pool plus what comes back, the actual payouts sum to the pool, and every
//      row's entry plus P/L is the cash it gets — to the cent, across 32 people.
//
// Same conventions as the other harnesses: psql over $PGURI, no client library,
// a check() counter, non-zero exit on failure.

import { execFileSync } from "node:child_process"

import {
  buildResultsTables,
  cashReturned,
  normalizePayoutRows,
  type PayoutViewQueryRow,
  type ResultsParticipant,
  type ResultsTable,
} from "../lib/payouts.ts"
import {
  phaseStandings,
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
  phase1_entry_fee: number | null
  phase2_entry_fee: number | null
  is_player: boolean
  pick_id: string
  bet_id: string
  sheet_pick_id: number
  phase: 1 | 2
  amount: number
  allows_multiple_picks: boolean
  pick_player_user_id: string | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

function main() {
  const rules = queryJson<TournamentRules[]>(
    `SELECT entry_fee_min, entry_fee_max, min_picks_per_phase, max_single_bet,
            max_self_bet_pct::float8 AS max_self_bet_pct
       FROM public.tournaments WHERE year = 2026`
  )[0]

  // -------------------------------------------------------------------------
  console.log("\n== the field ==")
  const members = queryJson<{ n: number; p1: number; p2: number; sat_out_p2: number }[]>(
    `SELECT count(*)::int AS n,
            COALESCE(sum(tp.phase1_entry_fee), 0)::int AS p1,
            COALESCE(sum(tp.phase2_entry_fee), 0)::int AS p2,
            count(*) FILTER (WHERE tp.phase2_entry_fee IS NULL)::int AS sat_out_p2
       FROM public.users u
       JOIN public.tournament_participants tp ON tp.user_id = u.id AND tp.revoked_at IS NULL
      WHERE u.email LIKE '%@sim.ozark.test'`
  )[0]
  check(`~32 approved members (got ${members.n})`, members.n >= 30 && members.n <= 34)
  check(
    `some members sit Phase 2 out (${members.sat_out_p2})`,
    members.sat_out_p2 > 0 && members.sat_out_p2 < members.n
  )

  const linked = queryJson<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM public.bet_picks pk
       JOIN public.users u ON u.id = pk.player_user_id
      WHERE u.email LIKE '%@sim.ozark.test'`
  )[0]
  check(`picks link to members who are also in the field (${linked.n} linked)`, linked.n > 0)

  // -------------------------------------------------------------------------
  console.log("\n== every wager is legal ==")
  const wagers = queryJson<SeededWager[]>(
    `SELECT pl.user_id, u.display_name, tp.phase1_entry_fee, tp.phase2_entry_fee, tp.is_player,
            pl.pick_id, pk.bet_id, pk.sheet_pick_id, b.phase, pl.amount,
            c.allows_multiple_picks, pk.player_user_id AS pick_player_user_id
       FROM public.bet_placements pl
       JOIN public.users u ON u.id = pl.user_id
       JOIN public.bet_picks pk ON pk.id = pl.pick_id
       JOIN public.bets b ON b.id = pk.bet_id
       JOIN public.tournament_participants tp ON tp.user_id = pl.user_id AND tp.tournament_id = b.tournament_id
       JOIN public.bet_categories c ON c.id = b.category_id
      WHERE u.email LIKE '%@sim.ozark.test' AND pl.deleted_at IS NULL
      ORDER BY u.email, b.phase, pk.sheet_pick_id`
  )
  check(`the field placed real volume (${wagers.length} wagers)`, wagers.length >= 250)

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
  const placedBy = new Map<string, ExistingPlacement[]>()
  for (const [userId, slate] of bySlate) {
    const placed: ExistingPlacement[] = []
    for (const w of slate) {
      const verdict = validatePlacement(
        {
          bettor: {
            user_id: w.user_id,
            is_player: w.is_player,
            phase1_entry_fee: w.phase1_entry_fee,
            phase2_entry_fee: w.phase2_entry_fee,
          },
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
    placedBy.set(userId, placed)
  }
  check("every seeded wager passes lib/validation.ts", violations === 0, `${violations} violation(s)`)

  // Per-phase standings: the minimum met everywhere, and exactly the members
  // the seed made incomplete are incomplete.
  const participants = queryJson<ResultsParticipant[]>(
    `SELECT tp.user_id, tp.phase1_entry_fee, tp.phase2_entry_fee, tp.is_player,
            u.display_name, u.nickname, u.avatar_url
       FROM public.tournament_participants tp
       JOIN public.users u ON u.id = tp.user_id
      WHERE tp.revoked_at IS NULL AND u.email LIKE '%@sim.ozark.test'`
  )
  let underMinimum = 0
  let overEntry = 0
  let incomplete1 = 0
  let incomplete2 = 0
  for (const p of participants) {
    const standings = phaseStandings(placedBy.get(p.user_id) ?? [], p, rules)
    for (const phase of [1, 2] as const) {
      const s = standings[phase]
      if (!s) continue
      if (!s.meets_pick_minimum) underMinimum++
      if (s.over_entry) overEntry++
      if (!s.complete) {
        if (phase === 1) incomplete1++
        else incomplete2++
      }
    }
  }
  check(
    `nobody entered in a phase is under its ${rules.min_picks_per_phase}-pick minimum`,
    underMinimum === 0,
    `${underMinimum}`
  )
  check("nobody wagered more than a phase entry", overEntry === 0, `${overEntry}`)
  check("every Phase 1 entry is wagered exactly", incomplete1 === 0, `${incomplete1} incomplete`)
  const shortInPhase2 = participants.filter((_, i) => (i + 1) % 7 === 0).length
  check(
    `the seed's Phase 2 under-wagerers are incomplete (${incomplete2})`,
    incomplete2 > 0 && incomplete2 <= shortInPhase2 + 1
  )

  // -------------------------------------------------------------------------
  console.log("\n== the split reconciles at field size, per pot ==")
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

  const payoutRows = queryJson<PayoutViewQueryRow[]>(
    `SELECT v.placement_id, v.user_id, v.amount, v.result,
            v.theoretical_payout, v.refunded_stake, v.phase, v.is_self_pick
       FROM public.placement_payouts_view v
       JOIN public.users u ON u.id = v.user_id
      WHERE u.email LIKE '%@sim.ozark.test'`
  )
  const tables = buildResultsTables(participants, normalizePayoutRows(payoutRows), rules)

  const reconcile = (label: string, table: ResultsTable) => {
    const voidRefunds = table.rows.reduce((sum, r) => sum + r.refunded, 0)
    const unwagered = table.rows.reduce((sum, r) => sum + r.refund_unwagered, 0)
    const forfeited = table.rows.reduce((sum, r) => sum + r.forfeit_unwagered, 0)
    console.log(
      `  ${label}: entries $${table.entries} · pool $${round2(table.pool)} · ` +
        `void refunds $${round2(voidRefunds)} · unwagered back $${unwagered} · forfeited $${forfeited}`
    )
    check(`${label}: nothing left pending (${table.pending})`, table.pending === 0)
    check(
      `${label}: every dollar in is the pool plus what comes back`,
      Math.abs(table.entries - (table.pool + voidRefunds + unwagered)) < 0.005,
      `$${table.entries} vs $${round2(table.pool + voidRefunds + unwagered)}`
    )
    const paidOut = table.rows.reduce((sum, r) => sum + r.actual, 0)
    check(
      `${label}: every dollar in the pool is paid out (Σ $${paidOut.toFixed(2)} vs pool $${table.pool.toFixed(2)})`,
      table.sum_theoretical === 0 || Math.abs(paidOut - table.pool) < 0.02,
      `off by $${Math.abs(paidOut - table.pool).toFixed(4)}`
    )
    check(
      `${label}: entry + P/L is the cash back, on every row`,
      table.rows.every((r) => Math.abs(r.entry_fee + r.profit_loss - cashReturned(r)) < 0.005)
    )
    check(`${label}: no placement sits outside the pot`, table.dropped_placements === 0)
  }
  reconcile("Phase 1", tables[1])
  reconcile("Phase 2", tables[2])
  reconcile("Combined", tables.combined)

  check(
    "the combined pool is the two pots added",
    Math.abs(tables.combined.pool - (tables[1].pool + tables[2].pool)) < 0.005
  )
  check(
    `Phase 2's pot holds only the members entered in it (${tables[2].rows.length} of ${participants.length})`,
    tables[2].rows.length === participants.length - members.sat_out_p2
  )
  check(
    "the Phase 2 under-wagerers forfeit money to the pot",
    tables[2].rows.some((r) => r.forfeit_unwagered > 0)
  )
  check(
    "…and get the rest of their entry back",
    tables[2].rows.some((r) => r.refund_unwagered > 0)
  )
  check(
    "a full Phase 1 forfeits and refunds nothing",
    tables[1].rows.every((r) => r.forfeit_unwagered === 0 && r.refund_unwagered === 0)
  )

  const winners = tables.combined.rows.filter((r) => r.actual > 0).length
  check(
    `the field has winners and losers (${winners} paid of ${tables.combined.rows.length})`,
    winners > 0 && winners < tables.combined.rows.length
  )

  console.log(
    failures === 0
      ? `\nThe full-pool simulation reconciles: ${members.n} members, ${wagers.length} wagers, ` +
          `Phase 1 pool $${tables[1].pool.toFixed(2)}, Phase 2 pool $${tables[2].pool.toFixed(2)}.`
      : `\n${failures} check(s) failed.`
  )
  if (failures > 0) process.exit(1)
}

main()
