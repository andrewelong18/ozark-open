// public.users RLS round-trip (#154) — the harness whose absence let a live
// production bug ship green.
//
// WHAT WENT WRONG, because this file exists to stop it happening twice.
//
// public.users had no admin UPDATE policy. Its only UPDATE policy was the
// own-row `auth.uid() = id`. So the Sprint 23 / #99 display-name edit was a
// SILENT NO-OP for every user but the acting admin: RLS filtered the row out,
// zero rows matched, PostgREST returned success with no error, the route
// answered 200 and the console said "saved". It ran that way in production.
//
// Two properties made it invisible:
//
//   1. Every DB script in this repo connects as the SUPERUSER, where RLS is
//      bypassed entirely. No harness had ever exercised public.users as an
//      authenticated user, so no local run could have caught it.
//   2. A write that matches zero rows SUCCEEDS. `error` is null. The absence
//      of an error was never evidence the write landed.
//
// Together those mean: we could prove a policy allows what it should, and we
// could not notice a policy that was MISSING.
//
// ---------------------------------------------------------------------------
// WHAT THIS COVERS, AND WHAT IT DELIBERATELY DOESN'T
//
// This is the RLS POLICY layer: who may touch whose row at all.
//
// scripts/onboarding-guard-roundtrip.ts covers the GUARD TRIGGER layer — which
// columns a member may change on the row RLS already let them reach
// (display_name pinned after onboarding, onboarded_at not clearable, is_admin
// not self-settable, nickname still editable). Those are different layers and
// they fail differently, so they stay in separate files.
//
// The distinction is the bug, in one line: the trigger's admin exemption was
// written expecting a row to reach it, and RLS is evaluated FIRST, so none ever
// did. A harness for one proves nothing about the other.
//
// ---------------------------------------------------------------------------
// Setup: run on the same throwaway DB as the other round-trips, after
// placement-roundtrip.ts (which installs the GUC-backed auth.uid()). The
// plumbing below is re-asserted idempotently so it also works standalone.
//   PGURI=... node --experimental-strip-types scripts/users-rls-roundtrip.ts

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

/** Run a statement as an authenticated user (RLS enforced). The two SETs print
 *  command tags, so the final statement's result is the last line. */
function asUser(userId: string, sql: string): string {
  const out = runSql(
    `SET ROLE authenticated; SET request.jwt.claim.sub = '${userId}'; ${sql}`
  )
  return out.split("\n").at(-1) ?? ""
}

/** Expect an outright rejection (no policy at all for that command). */
function asUserExpectFail(userId: string, sql: string): boolean {
  try {
    asUser(userId, sql)
    return false
  } catch {
    return true
  }
}

// Distinct from the placement round-trip's, so the two can share a database
// without either one's fixtures perturbing the other's assertions.
const MEMBER = "00000000-0000-4000-8000-0000000005e1"
const OTHER = "00000000-0000-4000-8000-0000000005e2"
const ADMIN = "00000000-0000-4000-8000-0000000005ad"

/** Read a column as the superuser — the ground truth a write either reached or
 *  didn't. Never read back through the same session that wrote: the point of
 *  most checks here is that the write silently did nothing. */
function actual(userId: string, column: string): string {
  return runSql(`SELECT ${column} FROM public.users WHERE id = '${userId}'`)
}

function main() {
  // --- Local-stub plumbing: GUC-backed auth.uid() + grants ------------------
  runSql(`
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  `)

  // Fixtures. handle_new_user() mirrors auth.users into public.users, so these
  // arrive with display_name = email and onboarded_at NULL; stamp them so the
  // guard trigger treats display_name as admin-owned, which is the state the
  // #99 edit actually runs against.
  runSql(`
    DELETE FROM public.users WHERE id IN ('${MEMBER}', '${OTHER}', '${ADMIN}');
    DELETE FROM auth.users  WHERE id IN ('${MEMBER}', '${OTHER}', '${ADMIN}');
    INSERT INTO auth.users (id, email) VALUES
      ('${MEMBER}', 'member@rls.test'),
      ('${OTHER}',  'other@rls.test'),
      ('${ADMIN}',  'admin@rls.test');
    UPDATE public.users
       SET onboarded_at = now(),
           display_name = CASE id
             WHEN '${MEMBER}'::uuid THEN 'Member One'
             WHEN '${OTHER}'::uuid  THEN 'Other Two'
             ELSE 'Admin Three' END
     WHERE id IN ('${MEMBER}', '${OTHER}', '${ADMIN}');
    UPDATE public.users SET is_admin = true WHERE id = '${ADMIN}';
  `)

  console.log("public.users under RLS — the member's own row:")

  asUser(MEMBER, `UPDATE public.users SET nickname = 'Mem' WHERE id = '${MEMBER}'`)
  check("a member can update their own row", actual(MEMBER, "nickname") === "Mem")

  console.log("Crossing to somebody else's row:")

  // THE SHAPE THAT HID THE BUG. This does not raise — RLS filters the row out
  // and the UPDATE reports success having changed nothing. So the assertion has
  // to read the value back as the superuser; expecting a throw would pass for
  // entirely the wrong reason.
  asUser(MEMBER, `UPDATE public.users SET nickname = 'hacked' WHERE id = '${OTHER}'`)
  check(
    "a member updating someone else's row is a SILENT no-op, not an error",
    actual(OTHER, "nickname") === ""
  )

  asUser(
    MEMBER,
    `UPDATE public.users SET display_name = 'Renamed By Peer' WHERE id = '${OTHER}'`
  )
  check(
    "a member cannot rename another member",
    actual(OTHER, "display_name") === "Other Two"
  )

  console.log("The admin path (#99 — this is the check that was missing):")

  // The single most important line in this file. Before 20260814000000 this
  // failed: no admin UPDATE policy existed, so the row never reached the
  // guard trigger's admin exemption and the write vanished.
  asUser(
    ADMIN,
    `UPDATE public.users SET display_name = 'Corrected Name' WHERE id = '${OTHER}'`
  )
  check(
    "an admin CAN correct another member's display_name",
    actual(OTHER, "display_name") === "Corrected Name",
    "if this fails, /admin/people's name edit is silently doing nothing again"
  )

  // display_name is what lib/import.ts matches picks to people by, so a name
  // the admin can't fix disables that member's self-bet cap, self-pick flag and
  // opponent block. That is why the above is a rules check, not a cosmetic one.
  asUser(
    ADMIN,
    `UPDATE public.users SET created_by_user_id = '${ADMIN}' WHERE id = '${OTHER}'`
  )
  check(
    "an admin can stamp created_by_user_id (the #124 audit trail)",
    actual(OTHER, "created_by_user_id") === ADMIN
  )

  asUser(ADMIN, `UPDATE public.users SET nickname = 'AdminSet' WHERE id = '${MEMBER}'`)
  check(
    "the admin policy reaches every member, not just one",
    actual(MEMBER, "nickname") === "AdminSet"
  )

  console.log("Commands with no policy at all:")

  // Rows arrive only via handle_new_user(), which is SECURITY DEFINER and
  // bypasses RLS. There is deliberately no INSERT policy, so a direct insert
  // is refused outright rather than silently dropped.
  check(
    "a member cannot INSERT a users row (no INSERT policy)",
    asUserExpectFail(
      MEMBER,
      `INSERT INTO public.users (id, email, display_name)
       VALUES ('00000000-0000-4000-8000-00000000dead', 'x@rls.test', 'X')`
    )
  )
  check(
    "an admin cannot INSERT one either — accounts come from auth, not the app",
    asUserExpectFail(
      ADMIN,
      `INSERT INTO public.users (id, email, display_name)
       VALUES ('00000000-0000-4000-8000-00000000beef', 'y@rls.test', 'Y')`
    )
  )

  // No DELETE policy: rows leave only by ON DELETE CASCADE from auth.users.
  // A DELETE with no policy matches nothing rather than raising — the same
  // silent shape as the cross-user UPDATE above, so it's checked the same way.
  // Asserted by row COUNT, not by a column value: a value-based check here
  // would also fail whenever an earlier check failed, turning one real fault
  // into a cascade of red that buries which assertion actually broke.
  const stillThere = (id: string) =>
    runSql(`SELECT count(*) FROM public.users WHERE id = '${id}'`) === "1"

  asUser(MEMBER, `DELETE FROM public.users WHERE id = '${MEMBER}'`)
  check(
    "a member's DELETE of their own row is a silent no-op (no DELETE policy)",
    stillThere(MEMBER)
  )
  asUser(ADMIN, `DELETE FROM public.users WHERE id = '${OTHER}'`)
  check("an admin's DELETE is a silent no-op too", stillThere(OTHER))

  console.log("Escalation:")

  // Belt and braces across both layers: the guard trigger pins is_admin for a
  // non-admin session (proven in detail by onboarding-guard-roundtrip.ts), so a
  // member cannot promote themselves and then use the admin policy.
  asUser(MEMBER, `UPDATE public.users SET is_admin = true WHERE id = '${MEMBER}'`)
  check(
    "a member cannot promote themselves and inherit the admin policy",
    actual(MEMBER, "is_admin") === "f"
  )

  // Cleanup: leave the database as this script found it, so the round-trips
  // that follow (and a re-run of this one) see the seed unchanged.
  runSql(`
    DELETE FROM public.users WHERE id IN ('${MEMBER}', '${OTHER}', '${ADMIN}');
    DELETE FROM auth.users  WHERE id IN ('${MEMBER}', '${OTHER}', '${ADMIN}');
  `)

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`)
    process.exit(1)
  }
  console.log("\nusers RLS round trip passed: the admin path works and the member path is fenced.")
}

main()
