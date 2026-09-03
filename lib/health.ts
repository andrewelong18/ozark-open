// The health report — the reads the app depends on, run as checks.
//
// WHY THIS EXISTS, in one incident. On Aug 31 the dashboard shipped a select
// on `bets.opened_at` ahead of the migration that adds the column. PostgREST
// refused the query, the dashboard rendered an error card, and every member
// hit it. Vercel was green. Supabase was green. The process was fine; the
// SCHEMA THE CODE EXPECTS was not, and nothing in the stack was watching that.
// A ping on `/` would have stayed green through the whole outage.
//
// So this does not ping. It runs the actual reads the core pages depend on,
// naming each, so a red check is the failure a member would have seen. A
// deploy that outruns its migration goes red within a poll interval —
// including the two migrations shipped alongside this file.
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
 * Run every check in order. Sequential, not parallel, on purpose: three of the
 * five need the tournament id, and four simultaneous connection failures for
 * one cause read like a far bigger outage than the one that happened.
 */
export async function buildHealthReport(
  supabase: SupabaseClient,
  now: () => number = Date.now
): Promise<HealthReport> {
  const started = now()
  const checks: HealthCheck[] = []

  // The tournaments row is the rulebook (CLAUDE.md: rule parameters live on it),
  // read here with every rule and clock column the app pulls off it.
  let tournamentId: string | null = null
  const rules = await timed("tournament_rules", (async () => {
      const { data, error } = await supabase
        .from("tournaments")
        .select(
          `id, name, status, ${TOURNAMENT_RULE_COLUMNS}, ${TOURNAMENT_CLOCK_COLUMNS}`
        )
        .order("year", { ascending: false })
        .limit(1)
        .maybeSingle()
      tournamentId = (data as { id: string } | null)?.id ?? null
      return { error }
    }))
  checks.push(rules)

  // Only asked when the read itself worked. "No tournament row." is a specific
  // and actionable thing to tell an admin, and saying it because the database
  // was unreachable would send them looking in the wrong place.
  if (rules.ok) {
    checks.push(
      await timed("tournament_exists", async () => ({
        // Not a query — a judgement on the row above. An empty tournaments
        // table is a healthy database and a dead app: every page gates on it.
        error: tournamentId ? null : { message: "No tournament row." },
      }))
    )
  }

  if (tournamentId) {
    // The dashboard's own read, INCLUDING opened_at — the column whose absence
    // caused the outage this file is named after.
    checks.push(
      await timed("bets_read", async () => {
        const { error } = await supabase
          .from("bets")
          .select("id, phase, status, opened_at")
          .eq("tournament_id", tournamentId)
          .limit(1)
        return { error }
      })
    )

    // The activity feed's SECURITY DEFINER read. A missing function is a 404
    // from PostgREST rather than a column error, so it fails differently and
    // needs a check of its own.
    checks.push(
      await timed("activity_rpc", async () => {
        const { error } = await supabase.rpc("activity_placements", {
          p_tournament_id: tournamentId,
          p_limit: 1,
        })
        return { error }
      })
    )

    // The collection columns (migration 20260902000000). /admin/people's roster
    // read IS that page — a database without these renders LoadError to an
    // admin — so the deploy-order alarm for that change is a check, not a note
    // in a commit message.
    checks.push(
      await timed("participants_collection", async () => {
        const { error } = await supabase
          .from("tournament_participants")
          .select("user_id, entry_fee, paid_amount, paid_note")
          .eq("tournament_id", tournamentId)
          .limit(1)
        return { error }
      })
    )
  }

  return { ok: checks.every((c) => c.ok), checks, ms: now() - started }
}
