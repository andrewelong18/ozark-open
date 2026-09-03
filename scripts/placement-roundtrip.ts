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

import { execFile, execFileSync } from "node:child_process"
import { promisify } from "node:util"

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

  // These RLS rules are all about a bet's status, so the fixture needs one of
  // each. The sample menu ships closed Phase 1 bets (Round 1 has been played —
  // its picks carry results) and hidden Phase 2 ones, so open the
  // lowest-numbered Phase 1 bet here. Opening and closing a bet is an admin
  // action in prod; this DB is throwaway. Idempotent — a re-run finds an open
  // bet already there and does nothing.
  runSql(
    `UPDATE public.bets SET status = 'open'
     WHERE id = (
       SELECT id FROM public.bets
       WHERE tournament_id = '${tournamentId}' AND status = 'closed'
       ORDER BY sheet_bet_id LIMIT 1
     ) AND NOT EXISTS (
       SELECT 1 FROM public.bets
       WHERE tournament_id = '${tournamentId}' AND status = 'open'
     );

     -- Reopening withdraws the verdicts with it: an open bet whose picks carry
     -- results is precisely the state the Sprint 22 import guard (#97) refuses.
     UPDATE public.bet_picks SET result = 'pending'
      WHERE bet_id IN (
        SELECT id FROM public.bets
        WHERE tournament_id = '${tournamentId}' AND status = 'open'
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

  // --- Admin-placed wagers (Sprint 23 / #101, ADR 0001 §13) -----------------
  // The member policies above are untouched; these are a separate admin-scoped
  // pair. What only a real Postgres can prove is that the attribution is
  // enforced by the DATABASE — an admin cannot write a row claiming somebody
  // else entered it — and that an admin gate is permission to act FOR someone,
  // not permission to bet on a bet that isn't open.
  console.log("Placing on a member's behalf (RLS enforced):")

  const bobRow = (fields: string) =>
    runSql(
      `SELECT ${fields} FROM public.bet_placements
       WHERE user_id = '${BOB}' AND pick_id = '${openPick2}'`
    )

  asUser(
    BOB,
    `INSERT INTO public.bet_placements (user_id, pick_id, amount, odds_at_placement)
     VALUES ('${BOB}', '${openPick2}', 7, 150)`
  )
  check(
    "a member's own wager leaves placed_by_user_id NULL (self-placed)",
    bobRow("(placed_by_user_id IS NULL)::text") === "true"
  )
  runSql(`DELETE FROM public.bet_placements WHERE user_id = '${BOB}'`)

  check(
    "a non-admin still cannot place for someone else, even naming themselves",
    asUserExpectFail(
      ALICE,
      `INSERT INTO public.bet_placements (user_id, pick_id, amount, odds_at_placement, placed_by_user_id)
       VALUES ('${BOB}', '${openPick2}', 7, 150, '${ALICE}')`
    )
  )
  check(
    "an admin cannot forge who entered the wager",
    asUserExpectFail(
      ADMIN,
      `INSERT INTO public.bet_placements (user_id, pick_id, amount, odds_at_placement, placed_by_user_id)
       VALUES ('${BOB}', '${openPick2}', 7, 150, '${BOB}')`
    )
  )
  check(
    "an admin who omits the attribution is refused too",
    asUserExpectFail(
      ADMIN,
      `INSERT INTO public.bet_placements (user_id, pick_id, amount, odds_at_placement)
       VALUES ('${BOB}', '${openPick2}', 7, 150)`
    )
  )
  check(
    "an admin gate is not permission to bet on a bet that isn't open",
    asUserExpectFail(
      ADMIN,
      `INSERT INTO public.bet_placements (user_id, pick_id, amount, odds_at_placement, placed_by_user_id)
       VALUES ('${BOB}', '${closedPick}', 7, 150, '${ADMIN}')`
    )
  )

  asUser(
    ADMIN,
    `INSERT INTO public.bet_placements (user_id, pick_id, amount, odds_at_placement, placed_by_user_id)
     VALUES ('${BOB}', '${openPick2}', 7, 150, '${ADMIN}')`
  )
  check(
    "an admin can place for a member, and the row records both identities",
    bobRow(`amount || '/' || (placed_by_user_id = '${ADMIN}')::text`) === "7/true"
  )

  asUser(
    ADMIN,
    `UPDATE public.bet_placements SET amount = 9, placed_by_user_id = '${ADMIN}'
     WHERE user_id = '${BOB}' AND pick_id = '${openPick2}'`
  )
  check("an admin can correct a wager they entered", bobRow("amount") === "9")

  asUser(
    ADMIN,
    `UPDATE public.bet_placements SET deleted_at = now(), placed_by_user_id = '${ADMIN}'
     WHERE user_id = '${BOB}' AND pick_id = '${openPick2}'`
  )
  check(
    "an admin can remove a wager they entered (soft delete)",
    bobRow("(deleted_at IS NOT NULL)::text") === "true"
  )

  check(
    "the bettor still owns the row — it counts as Bob's, not the admin's",
    runSql(
      `SELECT count(*) FROM public.bet_placements
       WHERE user_id = '${BOB}' AND placed_by_user_id = '${ADMIN}'`
    ) === "1"
  )
  runSql(`DELETE FROM public.bet_placements WHERE user_id = '${BOB}'`)

  // --- Soft revoke (Sprint 21 / #91) ----------------------------------------
  // Revoke is now an UPDATE of tournament_participants, not a DELETE, so the
  // "Admins can write participants" policy has to allow the stamp — and
  // nobody else may revoke, or grant themselves access back.
  check(
    "a bettor cannot revoke anyone, themselves included",
    asUserExpectFail(
      BOB,
      `UPDATE public.tournament_participants SET revoked_at = now()
       WHERE user_id = '${ALICE}' AND tournament_id = '${tournamentId}'`
    ) ||
      asUser(
        ADMIN,
        `SELECT count(*) FROM public.tournament_participants
         WHERE user_id = '${ALICE}' AND revoked_at IS NOT NULL`
      ) === "0"
  )
  asUser(
    ADMIN,
    `UPDATE public.tournament_participants SET revoked_at = now()
     WHERE user_id = '${ALICE}' AND tournament_id = '${tournamentId}'`
  )
  check(
    "an admin can stamp revoked_at, and the row and its fee survive",
    asUser(
      ADMIN,
      `SELECT count(*) FROM public.tournament_participants
       WHERE user_id = '${ALICE}' AND entry_fee = 40 AND revoked_at IS NOT NULL`
    ) === "1"
  )
  check(
    "the revoked bettor's placements are untouched — re-approval restores them",
    asUser(
      ADMIN,
      `SELECT count(*) FROM public.bet_placements WHERE user_id = '${ALICE}'`
    ) === "2"
  )
  asUser(
    ADMIN,
    `UPDATE public.tournament_participants SET revoked_at = NULL
     WHERE user_id = '${ALICE}' AND tournament_id = '${tournamentId}'`
  )

  return { tournamentId, openPick, openPick2 }
}

// ---------------------------------------------------------------------------
// The over-commit race (migration 20260902000001)
// ---------------------------------------------------------------------------
//
// THIS IS THE ONE CHECK IN THIS FILE THAT CANNOT BE WRITTEN SYNCHRONOUSLY, and
// the reason is the bug it defends against.
//
// lib/placement-write.ts reads the bettor's placements, sums them in
// TypeScript, and writes — three steps with no lock and no transaction. Two
// requests on DIFFERENT picks each read a total missing the other's, both pass
// validateRunningTotal(), and both land. A sequential test cannot see that: run
// one after the other and the second one's read is correct.
//
// So this runs two genuinely overlapping psql transactions. T1 inserts and then
// sits inside its transaction for a second; T2 starts a third of a second later
// and tries to insert while T1 is uncommitted. Against a $20 entry with two $15
// wagers, exactly one may survive.
//
// WHAT MAKES THE ASSERTION MEAN SOMETHING: this was run against the trigger
// with its `FOR UPDATE` removed and it FAILED, with both wagers landing at $30
// on a $20 entry — because re-summing alone is not enough under READ COMMITTED,
// where neither transaction can see the other's uncommitted row. The lock is
// what serialises them. A concurrency test that has never failed proves
// nothing, so if you touch that function, delete the lock and watch this go red
// before you trust it green.

const execFileAsync = promisify(execFile)

/** One psql process, run without blocking the other. Resolves whether the SQL
 *  succeeded — a raise here is the expected outcome for the loser. */
async function psqlAsync(sql: string): Promise<{ ok: boolean; stderr: string }> {
  try {
    await execFileAsync("psql", [PGURI, "-X", "-v", "ON_ERROR_STOP=1", "-c", sql], {
      encoding: "utf-8",
    })
    return { ok: true, stderr: "" }
  } catch (err) {
    return { ok: false, stderr: String((err as { stderr?: string }).stderr ?? err) }
  }
}

async function raceCheck(ctx: {
  tournamentId: string
  openPick: string
  openPick2: string
}) {
  console.log("\nThe over-commit race (PRD §7 rule 6, as a database guarantee):")

  // A $20 entry and a clean board, so two $15 wagers is unambiguously one too
  // many. Hard DELETE as the superuser — RLS has no DELETE policy.
  runSql(`
    DELETE FROM public.bet_placements WHERE user_id = '${BOB}';
    UPDATE public.tournament_participants SET entry_fee = 20
     WHERE user_id = '${BOB}' AND tournament_id = '${ctx.tournamentId}';
  `)

  const wager = (pickId: string) =>
    `INSERT INTO public.bet_placements (user_id, pick_id, amount, odds_at_placement)
     VALUES ('${BOB}', '${pickId}', 15, 110)`

  const [first, second] = await Promise.all([
    // Holds its transaction open for a second AFTER inserting, which is the
    // window the TypeScript check has no protection against.
    psqlAsync(`BEGIN; ${wager(ctx.openPick)}; SELECT pg_sleep(1); COMMIT;`),
    // Starts inside that window.
    psqlAsync(`SELECT pg_sleep(0.3); BEGIN; ${wager(ctx.openPick2)}; COMMIT;`),
  ])

  const landed = Number(
    runSql(
      `SELECT coalesce(sum(amount), 0) FROM public.bet_placements
        WHERE user_id = '${BOB}' AND deleted_at IS NULL`
    )
  )
  check(
    "two concurrent $15 wagers against a $20 entry leave exactly $15 on the board",
    landed === 15,
    `$${landed} landed — if this is $30, the guard is not holding and PRD §7 rule 6 is a suggestion`
  )
  check(
    "exactly one of the two transactions succeeded",
    Number(first.ok) + Number(second.ok) === 1,
    `first ${first.ok ? "committed" : "raised"}, second ${second.ok ? "committed" : "raised"}`
  )
  // The loser has to read like a rule, not like a crash: lib/placement-write.ts
  // matches SQLSTATE OZ001 to turn this into the same 400 and the same sentence
  // a validated over-commit produces.
  const loser = first.ok ? second.stderr : first.stderr
  check(
    "the loser is refused with validateRunningTotal()'s exact sentence",
    loser.includes("Over your $20 entry"),
    loser.split("\n")[0]
  )

  // A sequential over-commit is refused too — the guard is not only about
  // races, and this is the path an admin hand-editing in Studio would take.
  runSql(`DELETE FROM public.bet_placements WHERE user_id = '${BOB}'`)
  runSql(wager(ctx.openPick))
  const sequential = await psqlAsync(wager(ctx.openPick2))
  check(
    "a plain second wager over the entry is refused as well",
    !sequential.ok && sequential.stderr.includes("Over your $20 entry")
  )

  // Editing DOWN must still work: the guard excludes the row's own old amount
  // via `pl.id <> NEW.id`, so an edit that reduces isn't double-counted.
  const ok = await psqlAsync(
    `UPDATE public.bet_placements SET amount = 5
      WHERE user_id = '${BOB}' AND pick_id = '${ctx.openPick}'`
  )
  check("editing a wager DOWN is not blocked by its own old amount", ok.ok, ok.stderr)
  const raise = await psqlAsync(
    `UPDATE public.bet_placements SET amount = 25
      WHERE user_id = '${BOB}' AND pick_id = '${ctx.openPick}'`
  )
  check(
    "editing a wager UP past the entry is refused",
    !raise.ok && raise.stderr.includes("Over your $20 entry")
  )

  // Removing is always allowed — a soft delete only reduces the total, and a
  // guard that blocked it would trap someone over the cap with no way down.
  const remove = await psqlAsync(
    `UPDATE public.bet_placements SET deleted_at = now()
      WHERE user_id = '${BOB}' AND pick_id = '${ctx.openPick}'`
  )
  check("removing a wager is never blocked", remove.ok, remove.stderr)

  // Restore the fixture for anything downstream.
  runSql(`
    DELETE FROM public.bet_placements WHERE user_id = '${BOB}';
    UPDATE public.tournament_participants SET entry_fee = 40
     WHERE user_id = '${BOB}' AND tournament_id = '${ctx.tournamentId}';
  `)
}

async function run() {
  const ctx = main()
  await raceCheck(ctx)

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`)
    process.exit(1)
  }
  console.log(
    "\nPlacement round trip passed: lifecycle and visibility hold under RLS, and two concurrent wagers cannot exceed the entry."
  )
}

void run()
