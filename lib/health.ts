// The health report — the reads the app depends on, run as checks.
//
// WHY THIS EXISTS, in one incident. On Aug 31 the dashboard shipped a select
// on `bets.opened_at` ahead of the migration that adds the column. PostgREST
// refused the query, the dashboard rendered an error card, and every member
// hit it. Vercel was green. Supabase was green. The process was fine; the
// SCHEMA THE CODE EXPECTS was not, and nothing in the stack was watching that.
// A ping on `/` would have stayed green through the whole outage.
//
// So this does not ping. It runs the reads the core pages depend on, naming
// each, so a red check names the schema the code expects and didn't get. A
// deploy that outruns its migration goes red within a poll interval.
//
// It runs UNAUTHENTICATED, which bounds what it can honestly ask — see
// buildHealthReport() below, where getting that wrong cost a production 503 on
// every request for the first hours after this shipped.
//
// It lives in lib/ rather than in the route because it is the part with
// decisions in it (which reads, which order, what counts as red), and the part
// worth testing. app/api/health/route.ts is glue: call this, choose 200 or 503.
//
// WHAT IT WILL NOT DO IS RETURN DATA. Every check is a boolean, a duration and,
// when it fails, the database's own message — which names the missing column,
// the single most useful thing to have in an outage. The endpoint is reachable
// without a session, and the whole app is behind a login wall (CLAUDE.md); a
// health check is not the place to make an exception. Not even counts: "27
// participants" is a fact about this tournament that an unauthenticated caller
// has no business with.
//
// FAILING IS THE FEATURE. Every check is a read that must work for the app to
// work, so red means real breakage rather than noise. A monitor that cries wolf
// gets muted, and a muted monitor is the same as no monitor.

import type { SupabaseClient } from "@supabase/supabase-js"

import { TOURNAMENT_CLOCK_COLUMNS, TOURNAMENT_RULE_COLUMNS } from "./placements.ts"

export type HealthCheck = {
  /** Stable id — it becomes a monitor's alert text, so don't rename casually. */
  name: string
  ok: boolean
  ms: number
  /** Only when ok is false. */
  error?: string
}

export type HealthReport = {
  ok: boolean
  checks: HealthCheck[]
  ms: number
}

type QueryResult = { error: { message: string } | null }

/** Run one check, timed, and never let it throw. A thrown error is usually the
 *  client failing to construct at all — missing env vars, an unreachable host —
 *  which is a check result, not a reason for the endpoint itself to 500. */
async function timed(
  name: string,
  run: () => Promise<QueryResult>
): Promise<HealthCheck> {
  const started = Date.now()
  try {
    const { error } = await run()
    return {
      name,
      ok: !error,
      ms: Date.now() - started,
      ...(error ? { error: error.message } : {}),
    }
  } catch (err) {
    return {
      name,
      ok: false,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Run every check in order.
 *
 * WHAT THESE CHECKS ACTUALLY PROVE, and the correction that got them here.
 *
 * The first version of this file asked the database for the active tournament
 * row and reported "No tournament row." when none came back. In production it
 * answered 503 on every single request, forever — because **this endpoint is
 * public, so it runs as `anon`**, and `tournaments` is `SELECT … TO
 * authenticated` (supabase/expected-policies.txt). RLS filtered the read to
 * zero rows and returned NO ERROR, so the check read an invisible row as a
 * missing one, and the three checks gated behind its id never ran at all.
 *
 * That is the house rule in CLAUDE.md — *a query that matches zero rows is a
 * success, not an error* — which had been written down for writes and missed
 * here for reads. Nothing could have caught it: the unit tests drive a stub
 * client with no RLS, and every DB round-trip runs as superuser or
 * `authenticated`. It took a real anonymous request to production.
 *
 * So the rule now is: **a public health check may only ask questions an
 * anonymous caller can actually get a true answer to.** That is exactly the
 * schema — does the column exist, is the function callable, will PostgREST
 * serve this shape — which is precisely the Aug 31 failure and needs no row to
 * be visible. PostgREST validates the column list against its schema cache
 * BEFORE applying RLS, so a missing column still errors as `anon`; an empty
 * result does not. Every check below therefore treats zero rows as fine and
 * only an ERROR as red.
 *
 * WHAT IT DELIBERATELY NO LONGER CLAIMS: that a tournament row exists, or that
 * a signed-in member can see their data. Both are answerable only from behind
 * the login wall, and a public endpoint that could answer them would be a way
 * to read past RLS. If "the tournaments table is empty" is ever worth alarming
 * on, the upgrade is a `SECURITY DEFINER` probe returning booleans — the
 * `admin_auth_activity()` pattern — not a wider policy and not a session here.
 */
export async function buildHealthReport(
  supabase: SupabaseClient,
  now: () => number = Date.now
): Promise<HealthReport> {
  const started = now()
  const checks: HealthCheck[] = []

  // The tournaments row is the rulebook (CLAUDE.md: rule parameters live on
  // it). Every rule and clock column is named, so a rename or a dropped column
  // is caught. `.limit(1)` and no `.maybeSingle()`: zero rows is a pass.
  checks.push(
    await timed("tournament_rules", async () => {
      const { error } = await supabase
        .from("tournaments")
        .select(
          `id, name, status, ${TOURNAMENT_RULE_COLUMNS}, ${TOURNAMENT_CLOCK_COLUMNS}`
        )
        .limit(1)
      return { error }
    })
  )

  // The dashboard's own read, INCLUDING opened_at — the column whose absence
  // caused the outage this file exists for. No tournament filter: the id would
  // have to come from a row this caller cannot see, and filtering by one
  // proves nothing the column list doesn't already prove.
  checks.push(
    await timed("bets_read", async () => {
      const { error } = await supabase
        .from("bets")
        .select("id, phase, status, opened_at")
        .limit(1)
      return { error }
    })
  )

  // The activity feed's SECURITY DEFINER read. A missing function is a 404
  // from PostgREST rather than a column error, so it fails differently and
  // needs its own check. The nil uuid is deliberate — it matches no tournament
  // and returns nothing, which is all this needs: that the function exists,
  // with this signature, and is callable by this role.
  checks.push(
    await timed("activity_rpc", async () => {
      const { error } = await supabase.rpc("activity_placements", {
        p_tournament_id: "00000000-0000-0000-0000-000000000000",
        p_limit: 1,
      })
      return { error }
    })
  )

  // The collection columns (migration 20260902000000). /admin/people's roster
  // read IS that page — a database without these renders LoadError to an admin
  // — so the deploy-order alarm for that change is a check, not a note in a
  // commit message.
  checks.push(
    await timed("participants_collection", async () => {
      const { error } = await supabase
        .from("tournament_participants")
        .select("user_id, entry_fee, paid_amount, paid_note")
        .limit(1)
      return { error }
    })
  )

  return { ok: checks.every((c) => c.ok), checks, ms: now() - started }
}
