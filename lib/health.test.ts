// Unit tests for lib/health.ts, driven by a stub Supabase client.
//
// The point of the endpoint is that it goes RED when a deploy outruns its
// migration, so the tests that matter are the failing ones: a check that never
// fails is a green light wired to nothing. Each of these makes one read fail
// the way PostgREST actually fails it — a missing column, a missing function —
// and asserts the report names that check and nothing else.

import test from "node:test"
import assert from "node:assert/strict"
import type { SupabaseClient } from "@supabase/supabase-js"

import { buildHealthReport } from "./health.ts"

/** What a stub is asked to do: fail this read, with this message. */
type Failures = {
  tournaments?: string
  bets?: string
  participants?: string
  rpc?: string
  /** Every read comes back EMPTY with no error — what RLS does to an
   *  anonymous caller. The bug that shipped: this must stay green. */
  rlsFiltersEverything?: boolean
  /** Throw rather than resolve, the way a client with no env vars does. */
  throwOn?: "tournaments" | "bets"
}

/**
 * A stand-in for the query builder. Every chained method returns `this`, so the
 * stub doesn't care which of .eq/.limit/.order the caller uses — it only has to
 * settle to { data, error } when awaited, which is what the module reads.
 */
function stub(failures: Failures = {}): SupabaseClient {
  const reads: string[] = []

  function builder(table: string) {
    const fail =
      table === "tournaments"
        ? failures.tournaments
        : table === "bets"
          ? failures.bets
          : failures.participants

    // PostgREST returns no data alongside an error. Note the non-failing case
    // returns an EMPTY array, not a row: that is what every one of these reads
    // gets as `anon`, and every check must still pass on it.
    const result = fail
      ? { data: null, error: { message: fail } }
      : { data: [], error: null }

    const chain: Record<string, unknown> = {
      then(resolve: (v: unknown) => unknown) {
        return Promise.resolve(result).then(resolve)
      },
    }
    for (const method of ["select", "eq", "limit", "order", "is"]) {
      chain[method] = () => {
        if (failures.throwOn === table) throw new Error(`no client for ${table}`)
        return chain
      }
    }
    chain.maybeSingle = () => {
      if (failures.throwOn === table) throw new Error(`no client for ${table}`)
      return Promise.resolve(result)
    }
    return chain
  }

  return {
    reads,
    from(table: string) {
      reads.push(table)
      return builder(table)
    },
    rpc(name: string, args: Record<string, unknown>) {
      reads.push(`rpc:${name}:${JSON.stringify(args)}`)
      return Promise.resolve({
        data: [],
        error: failures.rpc ? { message: failures.rpc } : null,
      })
    },
  } as unknown as SupabaseClient
}

function byName(report: { checks: { name: string; ok: boolean; error?: string }[] }) {
  return Object.fromEntries(report.checks.map((c) => [c.name, c]))
}

test("a healthy stack is ok, with every check green", async () => {
  const report = await buildHealthReport(stub())
  assert.equal(report.ok, true)
  assert.deepEqual(
    report.checks.map((c) => c.name),
    ["tournament_rules", "bets_read", "activity_rpc", "participants_collection"]
  )
  assert.ok(report.checks.every((c) => c.ok))
  assert.ok(report.checks.every((c) => c.error === undefined))
})

test("the Aug 31 outage: a missing bets column turns it red and names it", async () => {
  const report = await buildHealthReport(
    stub({ bets: `column bets.opened_at does not exist` })
  )
  assert.equal(report.ok, false)
  const checks = byName(report)
  assert.equal(checks.bets_read.ok, false)
  assert.match(checks.bets_read.error ?? "", /opened_at/)
  // Only that one. A report that reds everything tells an admin nothing about
  // where to look.
  assert.equal(checks.tournament_rules.ok, true)
  assert.equal(checks.participants_collection.ok, true)
})

test("this change's own deploy order: missing paid_amount turns it red", async () => {
  const report = await buildHealthReport(
    stub({ participants: "column tournament_participants.paid_amount does not exist" })
  )
  assert.equal(report.ok, false)
  const checks = byName(report)
  assert.equal(checks.participants_collection.ok, false)
  assert.match(checks.participants_collection.error ?? "", /paid_amount/)
  assert.equal(checks.bets_read.ok, true)
})

test("a missing RPC is its own check, not a column error", async () => {
  const report = await buildHealthReport(
    stub({ rpc: "Could not find the function public.activity_placements" })
  )
  assert.equal(report.ok, false)
  assert.equal(byName(report).activity_rpc.ok, false)
})

// THE REGRESSION TEST. This endpoint is public, so it runs as `anon`, and
// every table it touches is RLS-protected — so every read comes back EMPTY
// with NO ERROR. The first version treated that emptiness as "no tournament
// exists" and answered 503 on every request in production, forever, with the
// three checks that matter skipped behind it. Zero rows is a PASS.
test("RLS filtering every read to nothing is GREEN, not a 503", () => {
  return buildHealthReport(stub({ rlsFiltersEverything: true })).then((report) => {
    assert.equal(report.ok, true)
    assert.ok(report.checks.every((c) => c.ok))
  })
})

test("every check runs unconditionally — none is gated on a visible row", () => {
  // The other half of the same bug: three checks sat behind an id that came
  // from a row `anon` can never see, so they never ran at all.
  const report = stub()
  return buildHealthReport(report).then((r) => {
    assert.equal(r.checks.length, 4)
    assert.ok(r.checks.every((c) => c.ok))
  })
})

test("the activity RPC is probed with the nil uuid, not a real tournament", async () => {
  // It only has to prove the function exists with this signature and is
  // callable by this role. Asking about a real tournament would need an id
  // this caller cannot obtain.
  const client = stub()
  await buildHealthReport(client)
  const reads = (client as unknown as { reads: string[] }).reads
  const rpc = reads.find((r) => r.startsWith("rpc:"))
  assert.match(rpc ?? "", /00000000-0000-0000-0000-000000000000/)
})

test("an unreadable tournaments table is red but does not stop the rest", async () => {
  // A column error still errors as `anon` — PostgREST validates the select
  // list against its schema cache BEFORE applying RLS, which is exactly why
  // schema questions are the ones this endpoint can honestly ask.
  const report = await buildHealthReport(stub({ tournaments: "connection refused" }))
  assert.equal(report.ok, false)
  assert.equal(byName(report).tournament_rules.ok, false)
  // The remaining three still run and still report.
  assert.equal(report.checks.length, 4)
  assert.equal(byName(report).bets_read.ok, true)
})

test("a throwing client is a check result, not a crash", async () => {
  // What a deploy with no NEXT_PUBLIC_SUPABASE_URL does. The endpoint has to
  // answer 503 with a reason, not 500 with a stack trace.
  const report = await buildHealthReport(stub({ throwOn: "tournaments" }))
  assert.equal(report.ok, false)
  assert.match(byName(report).tournament_rules.error ?? "", /no client/)
})

test("the report carries no data, only names, booleans and timings", async () => {
  // The endpoint is reachable without a session and the whole app is behind a
  // login wall. If a check ever starts returning rows or counts, this fails.
  const report = await buildHealthReport(stub())
  for (const check of report.checks) {
    assert.deepEqual(Object.keys(check).sort(), ["ms", "name", "ok"])
  }
  assert.deepEqual(Object.keys(report).sort(), ["checks", "ms", "ok"])
})

test("timings are reported, in ms, for the whole run and each check", async () => {
  let clock = 1000
  const report = await buildHealthReport(stub(), () => (clock += 7))
  assert.ok(report.ms >= 7)
  assert.ok(report.checks.every((c) => typeof c.ms === "number" && c.ms >= 0))
})
