// Sprint 30 entry-request round trip: prove that "one time" is the database's
// promise (migration 20260914000001), not the form's.
//
// The form warns a member that they can't add to or change their request
// later. What makes that true is UNIQUE (tournament_id, user_id) plus the
// ABSENCE of a member UPDATE/DELETE policy — and an absent policy is the
// failure mode this project keeps meeting: an UPDATE with no policy matches
// zero rows and reports success (#99). So every denial below asserts the row
// is UNCHANGED as read back by the superuser, never merely that a statement
// threw.
//
// Runs after scripts/users-rls-roundtrip.ts in scripts/local-db-verify.sh,
// by which point placement-roundtrip has installed the GUC-backed auth.uid()
// and the table grants this shares. Standalone:
//   PGURI=... node --experimental-strip-types scripts/entry-request-roundtrip.ts

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

function asUserExpectFail(userId: string, sql: string): boolean {
  try {
    asUser(userId, sql)
    return false
  } catch {
    return true
  }
}

function expectFail(sql: string): boolean {
  try {
    runSql(sql)
    return false
  } catch {
    return true
  }
}

// Dedicated fixture ids, distinct from every other harness.
const ERIN = "00000000-0000-4000-8000-00000000e971"
const FRAN = "00000000-0000-4000-8000-00000000e972"
const ADMIN = "00000000-0000-4000-8000-00000000ad03"

function main() {
  const tournamentId = runSql("SELECT id FROM public.tournaments WHERE year = 2026")
  if (!tournamentId) throw new Error("No 2026 tournament — run the migrations first.")

  // --- Local-stub plumbing (idempotent) ---------------------------------------
  runSql(`
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  `)
  runSql(`
    INSERT INTO auth.users (id, email) VALUES
      ('${ERIN}', 'erin@test.local'),
      ('${FRAN}', 'fran@test.local'),
      ('${ADMIN}', 'admin3@test.local')
    ON CONFLICT (id) DO NOTHING;
    UPDATE public.users SET is_admin = true WHERE id = '${ADMIN}';
    DELETE FROM public.entry_requests WHERE user_id IN ('${ERIN}', '${FRAN}');
  `)

  const erinRow = (fields: string) =>
    runSql(
      `SELECT ${fields} FROM public.entry_requests
       WHERE user_id = '${ERIN}' AND tournament_id = '${tournamentId}'`
    )
  const request = (userId: string, p1: number, p2: number, extra = "") =>
    `INSERT INTO public.entry_requests (tournament_id, user_id, phase1_amount, phase2_amount${extra ? ", is_player" : ""})
     VALUES ('${tournamentId}', '${userId}', ${p1}, ${p2}${extra ? `, ${extra}` : ""})`

  console.log("The one-time request (RLS enforced):")

  asUser(ERIN, request(ERIN, 30, 30, "false"))
  check(
    "a member can request their own entry, once",
    erinRow("phase1_amount || '/' || phase2_amount || '/' || is_player::text") === "30/30/false"
  )
  check(
    "a second request from the same member collides (UNIQUE)",
    asUserExpectFail(ERIN, request(ERIN, 20, 0)) && erinRow("count(*)") === "1"
  )
  check(
    "a member cannot request on somebody else's behalf",
    asUserExpectFail(ERIN, request(FRAN, 20, 20)) &&
      runSql(`SELECT count(*) FROM public.entry_requests WHERE user_id = '${FRAN}'`) === "0"
  )

  // The two silent-no-op denials, asserted on the value, not on a throw.
  asUser(
    ERIN,
    `UPDATE public.entry_requests SET phase1_amount = 50
     WHERE user_id = '${ERIN}' AND tournament_id = '${tournamentId}'`
  )
  check(
    "a member cannot change their request (no UPDATE policy — zero rows, value unchanged)",
    erinRow("phase1_amount") === "30"
  )
  asUser(
    ERIN,
    `DELETE FROM public.entry_requests
     WHERE user_id = '${ERIN}' AND tournament_id = '${tournamentId}'`
  )
  check(
    "a member cannot withdraw their request (no DELETE policy — row still there)",
    erinRow("count(*)") === "1"
  )

  console.log("Who sees what:")

  check(
    "a member reads their own request",
    asUser(ERIN, `SELECT count(*) FROM public.entry_requests WHERE user_id = '${ERIN}'`) === "1"
  )
  check(
    "another member sees nothing of it",
    asUser(FRAN, `SELECT count(*) FROM public.entry_requests WHERE user_id = '${ERIN}'`) === "0"
  )
  check(
    "an admin reads every request",
    asUser(ADMIN, `SELECT count(*) FROM public.entry_requests WHERE user_id = '${ERIN}'`) === "1"
  )

  console.log("What is always true (CHECKs, as the superuser):")

  check(
    "a request for nothing at all is refused",
    expectFail(request(FRAN, 0, 0))
  )
  check(
    "a negative amount is refused",
    expectFail(request(FRAN, -20, 40))
  )
  check(
    "sitting one phase out is a legal request",
    (() => {
      runSql(request(FRAN, 0, 40))
      return (
        runSql(
          `SELECT phase1_amount || '/' || phase2_amount FROM public.entry_requests
            WHERE user_id = '${FRAN}'`
        ) === "0/40"
      )
    })()
  )

  console.log("The admin's way back:")

  asUser(
    ADMIN,
    `DELETE FROM public.entry_requests
     WHERE user_id = '${ERIN}' AND tournament_id = '${tournamentId}'`
  )
  check(
    "an admin can clear a mistaken request so the member may try again",
    erinRow("count(*)") === "0"
  )
  asUser(ERIN, request(ERIN, 20, 0))
  check("…and the member's next request lands", erinRow("phase1_amount || '/' || phase2_amount") === "20/0")

  // Clean up so nothing downstream inherits these rows.
  runSql(`DELETE FROM public.entry_requests WHERE user_id IN ('${ERIN}', '${FRAN}')`)

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`)
    process.exit(1)
  }
  console.log(
    "\nEntry-request round trip passed: one row per member, immutable from their side, readable by them and by admins only."
  )
}

main()
