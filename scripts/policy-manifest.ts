// The RLS policy manifest (#154).
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

function currentManifest(): string {
  const out = execFileSync("psql", [PGURI, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", QUERY], {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  })
  return out.trim().split("\n").filter(Boolean).join("\n") + "\n"
}

function main() {
  const current = currentManifest()

  if (process.argv.includes("--write")) {
    writeFileSync(MANIFEST, current)
    console.log(`Wrote ${current.trim().split("\n").length} policies to expected-policies.txt`)
    return
  }

  let expected: string
  try {
    expected = readFileSync(MANIFEST, "utf-8")
  } catch {
    console.error(
      `No manifest at supabase/expected-policies.txt.\n` +
        `Generate it once with:  PGURI=... node --experimental-strip-types scripts/policy-manifest.ts --write`
    )
    process.exit(1)
  }

  if (current === expected) {
    console.log(
      `  ✓ ${current.trim().split("\n").length} RLS policies match supabase/expected-policies.txt`
    )
    return
  }

  const expectedLines = new Set(expected.trim().split("\n"))
  const currentLines = new Set(current.trim().split("\n"))
  const removed = [...expectedLines].filter((l) => !currentLines.has(l))
  const added = [...currentLines].filter((l) => !expectedLines.has(l))

  console.error("  ✗ FAIL — the RLS policy set doesn't match supabase/expected-policies.txt\n")
  // Removals first and named as such: a policy that disappeared is the
  // dangerous direction. An added policy widens access and wants review; a
  // removed one silently turns writes into no-ops, which is #99 exactly.
  for (const line of removed) console.error(`    MISSING (was expected): ${line}`)
  for (const line of added) console.error(`    UNEXPECTED (not in manifest): ${line}`)
  console.error(
    `\n  If this change is intentional, regenerate the manifest IN THE SAME COMMIT:\n` +
      `    POLICY_MANIFEST_WRITE=1 bash scripts/local-db-verify.sh\n` +
      `\n  If it isn't: a missing policy does not raise at runtime. It makes writes\n` +
      `  match zero rows and report success — see #154.`
  )
  process.exit(1)
}

main()
