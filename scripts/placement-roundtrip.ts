// Sprint 4 placement round-trip: exercise bet_placements lifecycle semantics
// (insert / edit / soft delete / revive) UNDER RLS on a throwaway local
// Postgres — the closest local stand-in for "every §7 violation rejected"
// that doesn't need Supabase creds. The §7 rules themselves are unit-tested
// (lib/validation.test.ts, lib/placements.test.ts); what only a real
// Postgres can verify is the RLS layer the route leans on:
//
//   - inserts allowed only on picks of open bets, only as yourself
//   - the own-rows SELECT policy deliberately does NOT filter deleted_at,
//     so the soft delete itself and the revive lookup both work
//   - hard DELETE is blocked for everyone (0 rows, silently)
//   - other users see nothing while the bet is open, live rows once closed
//   - admins see everything, soft-deleted included
//
// Setup (same throwaway DB as scripts/import-roundtrip.ts — run that first
// to apply migrations and seed the 19-bet/87-pick menu):
//   1. Local Postgres 16 (binaries at /usr/lib/postgresql/16/bin, run via
//      `su postgres -c ...`, data dir under /var/lib/postgresql) with a stub
//      auth schema. The trigger on auth.users needs an email column here:
//        CREATE SCHEMA auth;
//        CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
//        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
//        CREATE ROLE authenticated; CREATE ROLE anon;
//   2. Apply supabase/migrations/*.sql in order.
//   3. PGURI=... node --experimental-strip-types scripts/import-roundtrip.ts
//   4. PGURI=... node --experimental-strip-types scripts/placement-roundtrip.ts
//
// This script replaces the stub auth.uid() with a GUC-backed version
// (Supabase resolves the JWT sub the same way) and GRANTs table access to
// authenticated — both are how the real platform is configured; locally they
// let each scenario run as a chosen user with RLS enforced:
//   SET ROLE authenticated; SET request.jwt.claim.sub = '<uuid>'; <statement>

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

/** Run a statement as an authenticated user (RLS enforced). The two SETs
 * print command tags, so the final statement's result is the last line. */
function asUser(userId: string, sql: string): string {
  const out = runSql(
    `SET ROLE authenticated; SET request.jwt.claim.sub = '${userId}'; ${sql}`
  )
  return out.split("\n").at(-1) ?? ""
}

/** Expect an RLS (or other) rejection; returns true if the statement failed. */
function asUserExpectFail(userId: string, sql: string): boolean {
  try {
    asUser(userId, sql)
    return false
  } catch {
    return true
  }
}

const ALICE = "00000000-0000-4000-8000-00000000a11c"
const BOB = "00000000-0000-4000-8000-0000000000b0"
const ADMIN = "00000000-0000-4000-8000-00000000ad01"

function main() {
  const tournamentId = runSql("SELECT id FROM public.tournaments WHERE year = 2026")
  if (!tournamentId) throw new Error("No 2026 tournament — run the migrations first.")
  const menuCount = Number(
    runSql(`SELECT count(*) FROM public.bets WHERE tournament_id = '${tournamentId}'`)
  )
  if (menuCount === 0)
    throw new Error("Empty menu — run scripts/import-roundtrip.ts first to seed it.")

  // --- Local-stub plumbing: GUC-backed auth.uid() + grants ------------------
  runSql(`
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  `)

  // --- Test users & participants (idempotent) -------------------------------
  runSql(`
    INSERT INTO auth.users (id, email) VALUES
      ('${ALICE}', 'alice@test.local'),
      ('${BOB}', 'bob@test.local'),
      ('${ADMIN}', 'admin@test.local')
    ON CONFLICT (id) DO NOTHING;
    UPDATE public.users SET is_admin = true WHERE id = '${ADMIN}';
    INSERT INTO public.tournament_participants (user_id, tournament_id, entry_fee, is_player) VALUES
      ('${ALICE}', '${tournamentId}', 40, true),
      ('${BOB}', '${tournamentId}', 40, true)
    ON CONFLICT (user_id, tournament_id) DO NOTHING;
  `)

  // The sample menu ships only open and hidden bets; a closed one is needed
  // for the post-close visibility rules, so close the highest-numbered open
  // bet (an admin action in prod; this DB is throwaway). Idempotent —
  // re-runs find it already closed.
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

  // Picks to aim at, by parent bet status.
  const pickByStatus = (status: string, offset = 0) =>
    runSql(
      `SELECT p.id FROM public.bet_picks p JOIN public.bets b ON b.id = p.bet_id
       WHERE b.tournament_id = '${tournamentId}' AND b.status = '${status}'
       ORDER BY p.sheet_pick_id LIMIT 1 OFFSET ${offset}`
    )
  const openPick = pickByStatus("open")
  const openPick2 = pickByStatus("open", 1)
  const closedPick = pickByStatus("closed")
  const hiddenPick = pickByStatus("hidden")
  check("menu has open, closed, and hidden picks to test against",
    Boolean(openPick && openPick2 && closedPick && hiddenPick),
    JSON.stringify({ openPick, openPick2, closedPick, hiddenPick }))

  const aliceRow = (fields: string) =>
    runSql(
      `SELECT ${fields} FROM public.bet_placements
       WHERE user_id = '${ALICE}' AND pick_id = '${openPick}'`
    )

  console.log("Lifecycle as the bettor (RLS enforced):")

  // Clean slate for re-runs (superuser; RLS blocks hard deletes otherwise).
  runSql(`DELETE FROM public.bet_placements WHERE user_id IN ('${ALICE}', '${BOB}')`)

  asUser(
    ALICE,
    `INSERT INTO public.bet_placements (user_id, pick_id, amount, odds_at_placement)
     VALUES ('${ALICE}', '${openPick}', 5, 110)`
  )
  check("insert on an open bet's pick succeeds", aliceRow("amount") === "5")

  check(
    "insert on a closed bet's pick is rejected by RLS",
    asUserExpectFail(
      ALICE,
      `INSERT INTO public.bet_placements (user_id, pick_id, amount, odds_at_placement)
       VALUES ('${ALICE}', '${closedPick}', 5, 110)`
    )
  )
  check(
    "insert on a hidden bet's pick is rejected by RLS",
    asUserExpectFail(
      ALICE,
      `INSERT INTO public.bet_placements (user_id, pick_id, amount, odds_at_placement)
       VALUES ('${ALICE}', '${hiddenPick}', 5, 110)`
    )
  )
  check(
    "inserting as someone else is rejected by RLS",
    asUserExpectFail(
      ALICE,
      `INSERT INTO public.bet_placements (user_id, pick_id, amount, odds_at_placement)
       VALUES ('${BOB}', '${openPick2}', 5, 110)`
    )
  )

  asUser(
    ALICE,
    `UPDATE public.bet_placements SET amount = 8
     WHERE user_id = '${ALICE}' AND pick_id = '${openPick}'`
  )
  check("edit amount succeeds", aliceRow("amount") === "8")
  check(
    "updated_at trigger fires on edit",
    aliceRow("(updated_at > created_at)::text") === "true"
  )

  asUser(
    ALICE,
    `UPDATE public.bet_placements SET deleted_at = now()
     WHERE user_id = '${ALICE}' AND pick_id = '${openPick}'`
  )
  check("soft delete succeeds (SELECT policy doesn't filter deleted_at)",
    aliceRow("(deleted_at IS NOT NULL)::text") === "true")

  check(
    "bettor can still read their own soft-deleted row (revive lookup)",
    asUser(
      ALICE,
      `SELECT count(*) FROM public.bet_placements
       WHERE user_id = '${ALICE}' AND pick_id = '${openPick}'`
    ) === "1"
  )

  asUser(
    ALICE,
    `UPDATE public.bet_placements
     SET deleted_at = NULL, amount = 6, odds_at_placement = 135
     WHERE user_id = '${ALICE}' AND pick_id = '${openPick}'`
  )
  check(
    "revive clears deleted_at, updates amount, re-snapshots odds",
    aliceRow("amount || '/' || odds_at_placement || '/' || (deleted_at IS NULL)::text") ===
      "6/135/true"
  )

  asUser(
    ALICE,
    `DELETE FROM public.bet_placements
     WHERE user_id = '${ALICE}' AND pick_id = '${openPick}'`
  )
  check("hard DELETE is a silent no-op (no DELETE policy)", aliceRow("amount") === "6")

  console.log("Visibility (RLS enforced):")

  check(
    "another user sees nothing while the bet is open",
    asUser(
      BOB,
      `SELECT count(*) FROM public.bet_placements WHERE user_id = '${ALICE}'`
    ) === "0"
  )

  // Placements on a closed bet (written as superuser — the app never writes
  // these post-close; we only care that reads behave).
  runSql(
    `INSERT INTO public.bet_placements (user_id, pick_id, amount, odds_at_placement)
     VALUES ('${ALICE}', '${closedPick}', 4, -120)`
  )
  check(
    "everyone sees live placements once the bet is closed",
    asUser(
      BOB,
      `SELECT count(*) FROM public.bet_placements
       WHERE user_id = '${ALICE}' AND pick_id = '${closedPick}'`
    ) === "1"
  )
  runSql(
    `UPDATE public.bet_placements SET deleted_at = now()
     WHERE user_id = '${ALICE}' AND pick_id = '${closedPick}'`
  )
  check(
    "soft-deleted rows stay hidden from other users even after close",
    asUser(
      BOB,
      `SELECT count(*) FROM public.bet_placements
       WHERE user_id = '${ALICE}' AND pick_id = '${closedPick}'`
    ) === "0"
  )
  check(
    "admins read everything, soft-deleted included",
    asUser(
      ADMIN,
      `SELECT count(*) FROM public.bet_placements WHERE user_id = '${ALICE}'`
    ) === "2"
  )

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`)
    process.exit(1)
  }
  console.log("\nPlacement round trip passed: lifecycle and visibility hold under RLS.")
}

main()
