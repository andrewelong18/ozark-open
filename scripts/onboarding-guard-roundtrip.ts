// Sprint 16 onboarding-guard round-trip: prove the relaxed
// guard_users_self_update trigger under RLS on a throwaway local Postgres.
// The pure validation lives in lib/profile.test.ts; what only a real Postgres
// can verify is the DB-level pin:
//
//   - a fresh member (onboarded_at IS NULL) may set their own display_name
//     and stamp onboarded_at exactly once (their /onboarding write)
//   - once onboarded, a self-serve update can NO LONGER change display_name
//     and can never clear onboarded_at or self-escalate is_admin
//   - nickname stays editable after onboarding (the Sprint 15 behavior)
//
// Setup: run after scripts/placement-roundtrip.ts on the same throwaway DB
// (it installs the GUC-backed auth.uid()); this script re-asserts that
// plumbing idempotently so it also works standalone.
//   PGURI=... node --experimental-strip-types scripts/onboarding-guard-roundtrip.ts

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

function asUser(userId: string, sql: string): string {
  const out = runSql(
    `SET ROLE authenticated; SET request.jwt.claim.sub = '${userId}'; ${sql}`
  )
  return out.split("\n").at(-1) ?? ""
}

const NEWBIE = "00000000-0000-4000-8000-00000000ffff"

function main() {
  // Idempotent plumbing: GUC-backed auth.uid() + grants (same as the other
  // round-trips), so a chosen user runs with RLS enforced.
  runSql(`
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  `)

  // A brand-new login: the auth.users insert fires handle_new_user, which
  // creates public.users with display_name = email and onboarded_at NULL.
  runSql(`
    DELETE FROM public.users WHERE id = '${NEWBIE}';
    DELETE FROM auth.users WHERE id = '${NEWBIE}';
    INSERT INTO auth.users (id, email) VALUES ('${NEWBIE}', 'newbie@test.local');
  `)
  check(
    "new login starts un-onboarded with email as display_name",
    runSql(`SELECT onboarded_at IS NULL AND display_name = 'newbie@test.local'
            FROM public.users WHERE id = '${NEWBIE}'`) === "t"
  )

  // The /onboarding write: set your own display_name + stamp onboarded_at.
  asUser(
    NEWBIE,
    `UPDATE public.users SET display_name = 'Real Name', nickname = 'Newbie',
     onboarded_at = now() WHERE id = '${NEWBIE}'`
  )
  check(
    "member sets their own display_name once while un-onboarded",
    runSql(`SELECT display_name = 'Real Name' AND onboarded_at IS NOT NULL
            FROM public.users WHERE id = '${NEWBIE}'`) === "t"
  )

  // Now onboarded: a self-serve display_name change is silently pinned.
  asUser(NEWBIE, `UPDATE public.users SET display_name = 'Hacker' WHERE id = '${NEWBIE}'`)
  check(
    "display_name is pinned after onboarding (self-update can't change it)",
    runSql(`SELECT display_name FROM public.users WHERE id = '${NEWBIE}'`) === "Real Name"
  )

  // ...and onboarded_at can't be cleared to reopen the window.
  asUser(
    NEWBIE,
    `UPDATE public.users SET onboarded_at = NULL, display_name = 'Hacker2' WHERE id = '${NEWBIE}'`
  )
  check(
    "onboarded_at can't be cleared by a self-update",
    runSql(`SELECT onboarded_at IS NOT NULL AND display_name = 'Real Name'
            FROM public.users WHERE id = '${NEWBIE}'`) === "t"
  )

  // is_admin stays pinned (no self-escalation).
  asUser(NEWBIE, `UPDATE public.users SET is_admin = true WHERE id = '${NEWBIE}'`)
  check(
    "is_admin can't be self-set",
    runSql(`SELECT is_admin FROM public.users WHERE id = '${NEWBIE}'`) === "f"
  )

  // nickname stays editable after onboarding (Sprint 15 behavior intact).
  asUser(NEWBIE, `UPDATE public.users SET nickname = 'Slim' WHERE id = '${NEWBIE}'`)
  check(
    "nickname stays editable after onboarding",
    runSql(`SELECT nickname FROM public.users WHERE id = '${NEWBIE}'`) === "Slim"
  )

  runSql(`RESET ROLE;`)
  runSql(`DELETE FROM public.users WHERE id = '${NEWBIE}'; DELETE FROM auth.users WHERE id = '${NEWBIE}';`)

  console.log(
    failures === 0
      ? "\nOnboarding-guard round trip passed: the one-time name self-set holds under RLS."
      : `\n${failures} check(s) FAILED.`
  )
  if (failures > 0) process.exit(1)
}

main()
