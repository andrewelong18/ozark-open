// Sprint 7 payout-view round trip: prove placement_payouts_view's SQL against
// a real Postgres — the odds_at_placement math per result, soft-delete
// exclusion, refunded_stake for voids, and the security_invoker RLS behavior
// (a definer view would leak everyone's open-phase wagers; DATA_MODEL §4/§5).
// Expected numbers are computed by hand inline, NOT by importing lib/payouts.ts
// — the TS mirror is proven separately by its own unit tests, so agreement
// between the two is established without either side grading itself.
//
// Setup (same throwaway DB as scripts/import-roundtrip.ts — run that first
// to apply migrations and seed the 19-bet/87-pick menu; see
// scripts/placement-roundtrip.ts for the full local-Postgres-16 recipe):
//   1. Local PG16 with the stub auth schema (id + email columns).
//   2. Apply supabase/migrations/*.sql in order (includes the view).
//   3. PGURI=... node --experimental-strip-types scripts/import-roundtrip.ts
//   4. PGURI=... node --experimental-strip-types scripts/payout-view-roundtrip.ts

import { execFileSync } from "node:child_process"

const PGURI = process.env.PGURI ?? "postgresql://localhost:5432/ozark_roundtrip"

let failures = 0
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "  ✓" : "  ✗ FAIL"} ${label}${detail ? ` — ${detail}` : ""}`)
  if (!ok) failures++
}

function runSql(sql: string): string {
  return execFileSync(
    "psql",
    [PGURI, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
    { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
  ).trim()
}

/** Run a statement as an authenticated user (RLS enforced) — same GUC-backed
 * auth.uid() plumbing as scripts/placement-roundtrip.ts. */
function asUser(userId: string, sql: string): string {
  const out = runSql(
    `SET ROLE authenticated; SET request.jwt.claim.sub = '${userId}'; ${sql}`
  )
  return out.split("\n").at(-1) ?? ""
}

// Dedicated test users so re-runs and the other roundtrip scripts don't
// interfere; the clean-slate DELETE below only touches these.
const CARL = "00000000-0000-4000-8000-00000000ca71"
const DANA = "00000000-0000-4000-8000-00000000da4a"
const ADMIN = "00000000-0000-4000-8000-00000000ad02"

function main() {
  const tournamentId = runSql("SELECT id FROM public.tournaments WHERE year = 2026")
  if (!tournamentId) throw new Error("No 2026 tournament — run the migrations first.")
  if (
    Number(runSql(`SELECT count(*) FROM public.bets WHERE tournament_id = '${tournamentId}'`)) === 0
  )
    throw new Error("Empty menu — run scripts/import-roundtrip.ts first to seed it.")

  // --- Local-stub plumbing (idempotent; view included in the table grant) ---
  runSql(`
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  `)

  runSql(`
    INSERT INTO auth.users (id, email) VALUES
      ('${CARL}', 'carl@test.local'),
      ('${DANA}', 'dana@test.local'),
      ('${ADMIN}', 'admin2@test.local')
    ON CONFLICT (id) DO NOTHING;
    UPDATE public.users SET is_admin = true WHERE id = '${ADMIN}';
    INSERT INTO public.tournament_participants (user_id, tournament_id, entry_fee, is_player) VALUES
      ('${CARL}', '${tournamentId}', 40, true),
      ('${DANA}', '${tournamentId}', 40, true)
    ON CONFLICT (user_id, tournament_id) DO NOTHING;
  `)

  // A closed bet is needed for the post-close visibility check (same admin
  // action + idempotence as placement-roundtrip).
  runSql(
    `UPDATE public.bets SET status = 'closed'
     WHERE id = (
       SELECT id FROM public.bets
       WHERE tournament_id = '${tournamentId}' AND status = 'open'
       ORDER BY sheet_bet_id DESC LIMIT 1
     ) AND NOT EXISTS (
       SELECT 1 FROM public.bets
       WHERE tournament_id = '${tournamentId}' AND status = 'closed'
     )`
  )

  const pickByStatus = (status: string, offset = 0) =>
    runSql(
      `SELECT p.id FROM public.bet_picks p JOIN public.bets b ON b.id = p.bet_id
       WHERE b.tournament_id = '${tournamentId}' AND b.status = '${status}'
       ORDER BY p.sheet_pick_id LIMIT 1 OFFSET ${offset}`
    )
  const openPicks = [0, 1, 2, 3, 4, 5, 6].map((i) => pickByStatus("open", i))
  const closedPick = pickByStatus("closed")
  check(
    "menu has enough open picks plus a closed one",
    openPicks.every(Boolean) && Boolean(closedPick)
  )

  // Clean slate for re-runs: this script's placements and any results it set.
  runSql(`DELETE FROM public.bet_placements WHERE user_id IN ('${CARL}', '${DANA}')`)
  runSql(
    `UPDATE public.bet_picks SET result = 'pending'
     WHERE id IN (${[...openPicks, closedPick].map((p) => `'${p}'`).join(", ")})`
  )

  // --- One placement per result shape, written as superuser (results on
  // open bets never happen in prod, but the view must not care) -------------
  const rows: [pick: string, amount: number, odds: number, result: string][] = [
    [openPicks[0], 5, 110, "hit"],    // positive odds: 5 + 5×110/100 = 10.50
    [openPicks[1], 4, -120, "hit"],   // negative odds: 4 + 4×100/120 = 7.33
    [openPicks[2], 3, 200, "push"],   // stake back inside the math = 3.00
    [openPicks[3], 6, -150, "miss"],  // 0.00
    [openPicks[4], 7, 300, "void"],   // 0.00 theoretical, 7 refunded
    [openPicks[5], 2, 100, "pending"] // NULL — not yet resolved
  ]
  for (const [pick, amount, odds, result] of rows) {
    runSql(
      `INSERT INTO public.bet_placements (user_id, pick_id, amount, odds_at_placement)
       VALUES ('${CARL}', '${pick}', ${amount}, ${odds});
       UPDATE public.bet_picks SET result = '${result}' WHERE id = '${pick}'`
    )
  }
  // A soft-deleted placement — must be invisible to the view entirely.
  runSql(
    `INSERT INTO public.bet_placements (user_id, pick_id, amount, odds_at_placement)
     VALUES ('${CARL}', '${openPicks[6]}', 9, 500);
     UPDATE public.bet_placements SET deleted_at = now()
     WHERE user_id = '${CARL}' AND pick_id = '${openPicks[6]}'`
  )

  console.log("Payout math (as superuser, RLS aside):")

  const viewRow = (pick: string, fields: string) =>
    runSql(
      `SELECT ${fields} FROM public.placement_payouts_view
       WHERE user_id = '${CARL}' AND pick_id = '${pick}'`
    )

  check(
    "hit at positive odds: 5 @ +110 → 10.50",
    viewRow(openPicks[0], "round(theoretical_payout, 2) || '/' || refunded_stake") === "10.50/0"
  )
  check(
    "hit at negative odds: 4 @ −120 → 7.33",
    viewRow(openPicks[1], "round(theoretical_payout, 2) || '/' || refunded_stake") === "7.33/0"
  )
  check(
    "push returns the stake inside the math: 3 → 3.00",
    viewRow(openPicks[2], "round(theoretical_payout, 2) || '/' || refunded_stake") === "3.00/0"
  )
  check(
    "miss pays 0",
    viewRow(openPicks[3], "round(theoretical_payout, 2) || '/' || refunded_stake") === "0.00/0"
  )
  check(
    "void pays 0 theoretical and surfaces the stake as refunded",
    viewRow(openPicks[4], "round(theoretical_payout, 2) || '/' || refunded_stake") === "0.00/7"
  )
  check(
    "pending is NULL (not yet resolved), refunded 0",
    viewRow(openPicks[5], "(theoretical_payout IS NULL)::text || '/' || refunded_stake") === "true/0"
  )
  check(
    "soft-deleted placements are excluded from the view",
    viewRow(openPicks[6], "count(*)") === "0"
  )
  check(
    "view carries the ids the pages join on (bet_id, tournament_id)",
    viewRow(
      openPicks[0],
      `(bet_id IS NOT NULL AND tournament_id = '${tournamentId}' AND placement_id IS NOT NULL)::text`
    ) === "true"
  )
  check(
    "the view computes from odds_at_placement, not the live pick odds",
    (() => {
      // Reprice the pick under the placement; the payout must not move.
      runSql(`UPDATE public.bet_picks SET american_odds = 9900 WHERE id = '${openPicks[0]}'`)
      const after = viewRow(openPicks[0], "round(theoretical_payout, 2)")
      return after === "10.50"
    })()
  )

  console.log("Visibility through the view (security_invoker, RLS enforced):")

  check(
    "the bettor sees their own live rows (soft-deleted excluded by the view)",
    asUser(
      CARL,
      `SELECT count(*) FROM public.placement_payouts_view WHERE user_id = '${CARL}'`
    ) === "6"
  )
  check(
    "another user sees none of the open-phase rows (definer would leak here)",
    asUser(
      DANA,
      `SELECT count(*) FROM public.placement_payouts_view WHERE user_id = '${CARL}'`
    ) === "0"
  )

  // Post-close visibility: a placement on the closed bet, resolved hit.
  runSql(
    `INSERT INTO public.bet_placements (user_id, pick_id, amount, odds_at_placement)
     VALUES ('${CARL}', '${closedPick}', 4, -120);
     UPDATE public.bet_picks SET result = 'hit' WHERE id = '${closedPick}'`
  )
  check(
    "everyone sees rows on closed bets, payout included",
    asUser(
      DANA,
      `SELECT round(theoretical_payout, 2) FROM public.placement_payouts_view
       WHERE user_id = '${CARL}' AND pick_id = '${closedPick}'`
    ) === "7.33"
  )
  check(
    "admins see all live rows through the view",
    asUser(
      ADMIN,
      `SELECT count(*) FROM public.placement_payouts_view WHERE user_id = '${CARL}'`
    ) === "7"
  )

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`)
    process.exit(1)
  }
  console.log("\nPayout-view round trip passed: math, exclusions, and RLS hold.")
}

main()
