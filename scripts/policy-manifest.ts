// The RLS policy manifest (#154), and the function-grant manifest (#205).
//
// scripts/users-rls-roundtrip.ts would have caught the #99 bug. This catches
// the NEXT one, without anyone having to think of it first.
//
// The lesson from #124 wasn't "we forgot to test display names". It was that a
// MISSING policy is invisible: an UPDATE with no policy matches zero rows,
// returns success, and looks identical to a write that had nothing to do.
// Behaviour tests can only cover cases somebody thought to write. So this
// asserts the policy set ITSELF — every policy on every table in `public`,
// diffed against a checked-in expectation.
//
// Adding, removing or re-scoping a policy now fails the build until the
// manifest is updated in the same commit. That has two effects worth having:
//
//   1. Deleting a policy can no longer be silent.
//   2. The policy set becomes REVIEWABLE. Before this, "which tables can an
//      admin write, and how" was a question you answered by grepping eleven
//      migrations; now it's a file in the diff.
//
// This asserts the LOCAL set, built from supabase/migrations/. Production can
// still drift from it — see #156 for the migration-tracking drift that makes
// that possible — so a read-only pg_policy query against prod is still worth
// running when a token is around.
//
// ── THE SECOND MANIFEST: FUNCTION EXECUTE GRANTS (#205) ─────────────────────
//
// The policy manifest reads pg_policy only, and nothing in the repo read
// pg_proc.proacl at all — so the project had NO drift check on function
// grants. A migration adding
//
//     GRANT EXECUTE ON FUNCTION public.restore_snapshot(uuid) TO anon;
//
// passed npm test, tsc, lint, local-db-verify.sh and this script without a
// murmur. That is sharp because the app has SECURITY DEFINER functions that
// deliberately bypass RLS, and for several the REVOKE is the ENTIRE boundary:
// take_snapshot() returns every open wager in the tournament, and
// restore_snapshot() replaces the contents of all five money tables.
//
// Both manifests are written and asserted by the same --write mechanism, so
// there is one habit rather than two.
//
// A NOTE ON THE `PUBLIC (default)` LINES. pg_proc.proacl is NULL for a
// function whose grants were never touched, and NULL does not mean "no
// access" — it means the built-in default, EXECUTE TO PUBLIC. That is the
// dangerous case, so it is rendered loudly rather than as `none` (which here
// means an ACL that exists and grants EXECUTE to nobody). Most of those lines
// are trigger functions, which are reached through a trigger rather than a
// call; the point of listing them is that the day one stops being a trigger
// function, the manifest says so.
//
// Usage — normally you don't run this directly; scripts/local-db-verify.sh
// does, right after the migrations are applied. To REGENERATE the manifest
// after an intentional policy change:
//
//   POLICY_MANIFEST_WRITE=1 bash scripts/local-db-verify.sh
//
// (local-db-verify deletes its throwaway cluster on exit, so regenerating has
// to happen inside a run rather than against a database you still have.)

import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const PGURI = process.env.PGURI ?? "postgresql://localhost:5432/ozark_roundtrip"
const MANIFEST = fileURLToPath(
  new URL("../supabase/expected-policies.txt", import.meta.url)
)
const GRANTS_MANIFEST = fileURLToPath(
  new URL("../supabase/expected-function-grants.txt", import.meta.url)
)

/** Stable, greppable, one policy per line:
 *    table | command | policy name | roles
 *  The USING/WITH CHECK expressions are deliberately NOT included. They churn
 *  on formatting, and the failure this guards against is a policy that is
 *  absent or scoped to the wrong command — not a reworded predicate. Keeping
 *  the manifest coarse keeps it honest: nobody updates it reflexively because
 *  it changes constantly. */
const QUERY = `
  SELECT c.relname || ' | ' ||
         CASE p.polcmd
           WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
           WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
           WHEN '*' THEN 'ALL'    ELSE p.polcmd::text
         END || ' | ' || p.polname || ' | ' ||
         COALESCE(
           (SELECT string_agg(r.rolname, ',' ORDER BY r.rolname)
              FROM pg_roles r WHERE r.oid = ANY(p.polroles)),
           'public'
         )
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
   ORDER BY c.relname, p.polcmd, p.polname;
`

/** Stable, greppable, one function per line:
 *    public.name(arg types) | roles with EXECUTE
 *  The roles column is the whole point — a function moving from
 *  `authenticated` to `authenticated,anon` is the failure this exists for.
 *  `PUBLIC (default)` means proacl IS NULL: the built-in default of EXECUTE
 *  TO PUBLIC, never touched by a migration. `none` means an ACL exists and
 *  grants EXECUTE to nobody. The two are opposites and must not read alike.
 *
 *  The OWNER is excluded from the roles column. It always holds EXECUTE
 *  implicitly, so it carries no information — and its NAME is whoever ran
 *  initdb: `postgres` on the machine the manifest was first written on,
 *  `runner` in CI, and the developer's own username on a Mac. Including it
 *  made the manifest environment-specific, so this check failed on every CI
 *  run from Sept 8 2026 (#212) until it was fixed, on a diff that named five
 *  functions and meant nothing. A gate that is always red is not a gate. */
const GRANTS_QUERY = `
  SELECT n.nspname || '.' || p.proname ||
         '(' || pg_get_function_identity_arguments(p.oid) || ') | ' ||
         CASE
           WHEN p.proacl IS NULL THEN 'PUBLIC (default)'
           ELSE COALESCE(
             (SELECT string_agg(
                       CASE WHEN a.grantee = 0 THEN 'PUBLIC'
                            ELSE a.grantee::regrole::text END,
                       ',' ORDER BY 1)
                FROM aclexplode(p.proacl) a
               WHERE a.privilege_type = 'EXECUTE'
                 AND a.grantee IS DISTINCT FROM p.proowner),
             'none')
         END
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
   ORDER BY 1;
`

function runQuery(query: string): string {
  const out = execFileSync("psql", [PGURI, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", query], {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  })
  return out.trim().split("\n").filter(Boolean).join("\n") + "\n"
}

type Manifest = {
  /** Path to the checked-in expectation. */
  file: string
  /** Basename, for messages. */
  name: string
  /** What one line is, plural — "RLS policies", "function EXECUTE grants". */
  noun: string
  query: string
  /** Why a mismatch matters, printed under the diff. */
  why: string
}

const MANIFESTS: Manifest[] = [
  {
    file: MANIFEST,
    name: "supabase/expected-policies.txt",
    noun: "RLS policies",
    query: QUERY,
    why:
      `  If it isn't: a missing policy does not raise at runtime. It makes writes\n` +
      `  match zero rows and report success — see #154.`,
  },
  {
    file: GRANTS_MANIFEST,
    name: "supabase/expected-function-grants.txt",
    noun: "function EXECUTE grants",
    query: GRANTS_QUERY,
    why:
      `  If it isn't: read the roles column. For the SECURITY DEFINER functions\n` +
      `  the REVOKE is the entire security boundary — take_snapshot() returns\n` +
      `  every open wager, restore_snapshot() replaces all five money tables.\n` +
      `  A grant reaching 'anon' or 'PUBLIC' there is a production incident, not\n` +
      `  a manifest that needs regenerating — see #205.`,
  },
]

/** Returns true on match. Writes instead of asserting when --write is passed. */
function reconcile(m: Manifest, write: boolean): boolean {
  const current = runQuery(m.query)
  const count = current.trim().split("\n").length

  if (write) {
    writeFileSync(m.file, current)
    console.log(`Wrote ${count} ${m.noun} to ${m.name}`)
    return true
  }

  let expected: string
  try {
    expected = readFileSync(m.file, "utf-8")
  } catch {
    console.error(
      `No manifest at ${m.name}.\n` +
        `Generate it once with:  POLICY_MANIFEST_WRITE=1 bash scripts/local-db-verify.sh`
    )
    return false
  }

  if (current === expected) {
    console.log(`  ✓ ${count} ${m.noun} match ${m.name}`)
    return true
  }

  const expectedLines = new Set(expected.trim().split("\n"))
  const currentLines = new Set(current.trim().split("\n"))
  const removed = [...expectedLines].filter((l) => !currentLines.has(l))
  const added = [...currentLines].filter((l) => !expectedLines.has(l))

  console.error(`  ✗ FAIL — the ${m.noun} don't match ${m.name}\n`)
  // Removals first and named as such: a policy that disappeared is the
  // dangerous direction. An added policy widens access and wants review; a
  // removed one silently turns writes into no-ops, which is #99 exactly.
  // For grants the asymmetry flips — an ADDED role is the widening — so both
  // halves are labelled rather than left to the reader's assumption.
  for (const line of removed) console.error(`    MISSING (was expected): ${line}`)
  for (const line of added) console.error(`    UNEXPECTED (not in manifest): ${line}`)
  console.error(
    `\n  If this change is intentional, regenerate the manifest IN THE SAME COMMIT:\n` +
      `    POLICY_MANIFEST_WRITE=1 bash scripts/local-db-verify.sh\n\n` +
      m.why
  )
  return false
}

function main() {
  const write = process.argv.includes("--write")
  // Reconcile every manifest before exiting, so one run reports both problems
  // rather than hiding the second behind the first.
  const ok = MANIFESTS.map((m) => reconcile(m, write)).every(Boolean)
  if (!ok) process.exit(1)
}

main()
