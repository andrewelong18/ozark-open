// The test that makes lib/supabase/admin.ts's containment a fact rather than a
// comment (#124).
//
// That module builds a client with SUPABASE_SERVICE_ROLE_KEY, which BYPASSES
// ROW-LEVEL SECURITY ENTIRELY — every policy in supabase/migrations/ is inert
// against it. DATA_MODEL.md §5 argued against having such a key in the runtime
// at all, and Sprint 11 chose pg_cron over Vercel Cron specifically to avoid
// introducing one. It exists now for exactly one reason: public.users.id is a
// foreign key to auth.users(id), so an account cannot be created without it.
//
// The risk is not that the key gets used — it's that it gets used a SECOND
// time, somewhere convenient, by someone who finds it already in the codebase
// and reasonably concludes it's available. That's how a narrow exception turns
// into a general-purpose backdoor, and it happens one honest commit at a time.
//
// So the blast radius is pinned here. If you are reading this because the test
// failed: adding an importer is a security decision, not a refactor. Take the
// anon path — a policy, or a SECURITY DEFINER function like
// public.admin_auth_activity() — and if you genuinely can't, change ALLOWED
// deliberately and say why in the commit.
//
// Deliberately a source-text scan rather than an import graph: it needs to
// catch a `require`, a dynamic `import()`, and a re-export alike, and it has to
// run under `node --test` with no bundler. Zero dependencies, same as every
// other test here.

import test from "node:test"
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url))

/** Every file permitted to import the service-role client. */
const ALLOWED = ["app/api/admin/members/route.ts"]

/** The module itself, which obviously "mentions" its own path in comments. */
const SELF = "lib/supabase/admin.ts"

const SEARCH_DIRS = ["app", "components", "lib", "scripts", "e2e"]
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build"])

function sourceFiles(dir: string): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }
  const found: string[] = []
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full))
    } else if (SOURCE_EXT.test(entry)) {
      found.push(full)
    }
  }
  return found
}

/** Matches `@/lib/supabase/admin`, `./admin`, `../supabase/admin.ts` — in an
 *  import, a re-export, a require, or a dynamic import. Narrow enough not to
 *  fire on `lib/supabase/server`, and it ignores the prose in this file by
 *  requiring the path to sit inside quotes. */
const IMPORT_RE =
  /(?:from|import|require)\s*\(?\s*["'][^"']*(?:supabase\/admin|\.\/admin)(?:\.ts)?["']/

test("only the members route imports the service-role client", () => {
  const importers: string[] = []

  for (const dir of SEARCH_DIRS) {
    for (const file of sourceFiles(join(REPO_ROOT, dir))) {
      const rel = relative(REPO_ROOT, file).split("\\").join("/")
      if (rel === SELF || rel === "lib/admin-client-containment.test.ts") continue
      if (IMPORT_RE.test(readFileSync(file, "utf8"))) importers.push(rel)
    }
  }

  assert.deepEqual(
    importers.sort(),
    [...ALLOWED].sort(),
    "lib/supabase/admin.ts bypasses RLS entirely — read this file's header before widening ALLOWED"
  )
})

test("the scan would actually catch a new importer", () => {
  // A containment test that silently matches nothing is worse than none at all:
  // it reports green forever while the thing it guards drifts. Prove the regex
  // fires on the shapes a future import could take.
  const shapes = [
    'import { createAdminClient } from "@/lib/supabase/admin"',
    "import {createAdminClient} from '@/lib/supabase/admin'",
    'export { createAdminClient } from "../lib/supabase/admin.ts"',
    'const { createAdminClient } = require("@/lib/supabase/admin")',
    'const mod = await import("@/lib/supabase/admin")',
    'import { createAdminClient } from "./admin"',
  ]
  for (const shape of shapes) {
    assert.ok(IMPORT_RE.test(shape), `should have matched: ${shape}`)
  }

  // And that it does NOT fire on the ordinary anon client every other route uses.
  const innocent = [
    'import { createClient } from "@/lib/supabase/server"',
    'import { createClient } from "@/lib/supabase/client"',
    'import { requireAdminRoute } from "@/lib/admin-gate"',
  ]
  for (const shape of innocent) {
    assert.equal(IMPORT_RE.test(shape), false, `should not have matched: ${shape}`)
  }
})

test("the allowed importer exists and really does import it", () => {
  // Guards the other failure direction: if the route is renamed and ALLOWED
  // isn't updated, the first test still passes (nothing imports it) and the
  // containment claim quietly becomes vacuous.
  for (const allowed of ALLOWED) {
    const source = readFileSync(join(REPO_ROOT, allowed), "utf8")
    assert.ok(
      IMPORT_RE.test(source),
      `${allowed} is listed as the service-role importer but doesn't import it`
    )
  }
})
