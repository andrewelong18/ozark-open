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
  /** Return no tournament row at all — a healthy database with a dead app. */
  noTournament?: boolean
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

    // PostgREST returns no data alongside an error, which is what makes a
    // failed tournaments read skip the id-dependent checks rather than run
    // them against a stale id.
    const result = fail
      ? { data: null, error: { message: fail } }
      : {
          data:
            table === "tournaments"
              ? failures.noTournament
                ? null
                : { id: "t-1" }
              : [],
          error: null,
        }

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
    rpc(name: string) {
      reads.push(`rpc:${name}`)
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
    [
      "tournament_rules",
      "tournament_exists",
      "bets_read",
      "activity_rpc",
      "participants_collection",
    ]
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

test("no tournament row is red — a healthy database with a dead app", async () => {
  const report = await buildHealthReport(stub({ noTournament: true }))
  assert.equal(report.ok, false)
  const checks = byName(report)
  assert.equal(checks.tournament_rules.ok, true)
  assert.equal(checks.tournament_exists.ok, false)
  // The three id-dependent checks are SKIPPED rather than failed: reporting
  // four failures for one cause reads as a much bigger outage than it is.
  assert.equal(report.checks.length, 2)
})

test("an unreadable tournaments table skips the rest instead of cascading", async () => {
  // One red check, not five. Everything below needs the id this read didn't
  // return, and "No tournament row." would send an admin looking in the wrong
  // place when the truth is that the database was unreachable.
  const report = await buildHealthReport(stub({ tournaments: "connection refused" }))
  assert.equal(report.ok, false)
  assert.deepEqual(report.checks.map((c) => c.name), ["tournament_rules"])
  assert.equal(byName(report).tournament_rules.ok, false)
})

test("a throwing client is a check result, not a crash", async () => {
  // What a deploy with no NEXT_PUBLIC_SUPABASE_URL does. The endpoint has to
  // answer 503 with a reason, not 500 with a stack trace.
  const report = await buildHealthReport(stub({ throwOn: "tournaments" }))
  assert.equal(report.ok, false)
  assert.match(byName(report).tournament_rules.error ?? "", /no client/)
  assert.deepEqual(report.checks.map((c) => c.name), ["tournament_rules"])
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
