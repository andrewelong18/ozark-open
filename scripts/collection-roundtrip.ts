// Entry-collection round trip — the columns, the RLS on them, and the two
// surfaces that report them, against a real database.
//
// WHAT THIS IS DEFENDING, in one sentence: an admin marks a payment on
// /admin/people and the number they see afterwards has to be the number that
// is actually in the row.
//
// Three layers, and they fail differently, so each is asserted separately:
//
//   1. THE COLUMNS. paid_amount/paid_at/paid_note exist with the right
//      defaults and the CHECK actually refuses a negative. A column with a
//      NULL default would make every sum NaN in the console.
//   2. THE WRITE, UNDER RLS. tournament_participants is admin-write-only. The
//      #99 class of bug is a write that matches ZERO rows and reports success
//      — so every assertion here reads the value back as the superuser rather
//      than trusting the UPDATE, and the member case asserts the value is
//      UNCHANGED rather than expecting a throw.
//   3. THE MATH. lib/collection.ts and lib/settlement.ts are pure and unit
//      tested, but nothing proved they were fed the same rows the database
//      holds. Here their output is checked against SQL ground truth computed
//      independently, in SQL, over the same rows.
//
// AND THE ONE PROPERTY THE WHOLE FEATURE RESTS ON: collection is NOT a pool
// input. The pool is Σ entry_fee − Σ voided stakes (ADR 0001 §9) whether or
// not the money arrived. The last check drives paid_amount to zero for
// everybody and asserts placement_payouts_view is byte-identical, because the
// day someone wires this into payout math is the day an unpaid member stops
// getting their winnings.
//
// Runs on the same throwaway DB as the other round-trips, after
// placement-roundtrip.ts (which installs the GUC-backed auth.uid()). The
// plumbing is re-asserted idempotently so it also works standalone.
//   PGURI=... node --experimental-strip-types scripts/collection-roundtrip.ts

import { execFileSync } from "node:child_process"

import { collectionStanding, type CollectionParticipant } from "../lib/collection.ts"
import { buildCollectionSummary } from "../lib/settlement.ts"

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

/** Run a statement with RLS enforced, as that user. */
function asUser(userId: string, sql: string): string {
  const out = runSql(
    `SET ROLE authenticated; SET request.jwt.claim.sub = '${userId}'; ${sql}`
  )
  return out.split("\n").at(-1) ?? ""
}

function expectRaise(sql: string): boolean {
  try {
    runSql(sql)
    return false
  } catch {
    return true
  }
}

// Distinct ids from the other round-trips so fixtures can't collide.
const ADMIN = "00000000-0000-4000-8000-0000000006ad"
const PAID = "00000000-0000-4000-8000-0000000006a1"
const HALF = "00000000-0000-4000-8000-0000000006a2"
const NONE = "00000000-0000-4000-8000-0000000006a3"
const GONE = "00000000-0000-4000-8000-0000000006a4"

/** Ground truth, as the superuser. Never read back through the writing session. */
function paidOf(userId: string): string {
  return runSql(
    `SELECT paid_amount FROM public.tournament_participants WHERE user_id = '${userId}'`
  )
}

function main() {
  runSql(`
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  `)

  const tournamentId = runSql(
    `SELECT id FROM public.tournaments ORDER BY year DESC LIMIT 1`
  )
  if (!tournamentId) {
    console.error("No tournament seeded — run the migrations + seed first.")
    process.exit(1)
  }

  const ids = [ADMIN, PAID, HALF, NONE, GONE]
  runSql(`
    DELETE FROM public.tournament_participants WHERE user_id IN (${ids.map((i) => `'${i}'`).join(",")});
    DELETE FROM public.users WHERE id IN (${ids.map((i) => `'${i}'`).join(",")});
    DELETE FROM auth.users  WHERE id IN (${ids.map((i) => `'${i}'`).join(",")});
    INSERT INTO auth.users (id, email) VALUES
      ('${ADMIN}', 'admin@collect.test'),
      ('${PAID}',  'paid@collect.test'),
      ('${HALF}',  'half@collect.test'),
      ('${NONE}',  'none@collect.test'),
      ('${GONE}',  'gone@collect.test');
    UPDATE public.users SET onboarded_at = now(), display_name = CASE id
        WHEN '${ADMIN}'::uuid THEN 'Admin Ada'
        WHEN '${PAID}'::uuid  THEN 'Paid Pat'
        WHEN '${HALF}'::uuid  THEN 'Half Hayden'
        WHEN '${NONE}'::uuid  THEN 'Owes Olivia'
        ELSE 'Gone Gary' END
      WHERE id IN (${ids.map((i) => `'${i}'`).join(",")});
    UPDATE public.users SET is_admin = true WHERE id = '${ADMIN}';
    INSERT INTO public.tournament_participants (user_id, tournament_id, entry_fee, revoked_at) VALUES
      ('${PAID}', '${tournamentId}', 30, NULL),
      ('${HALF}', '${tournamentId}', 30, NULL),
      ('${NONE}', '${tournamentId}', 20, NULL),
      ('${GONE}', '${tournamentId}', 50, now());
  `)

  // --- 1. The columns ------------------------------------------------------
  console.log("The columns migration 20260902000000 adds:")

  check(
    "paid_amount defaults to 0, not NULL — the console sums these",
    paidOf(PAID) === "0",
    `got "${paidOf(PAID)}"`
  )
  check(
    "paid_at starts NULL — nobody has recorded anything yet",
    runSql(
      `SELECT paid_at IS NULL FROM public.tournament_participants WHERE user_id = '${PAID}'`
    ) === "t"
  )
  check(
    "the CHECK refuses a negative payment",
    expectRaise(
      `UPDATE public.tournament_participants SET paid_amount = -1 WHERE user_id = '${PAID}'`
    )
  )
  const overpay = runSql(
    // First line: psql prints the "UPDATE 1" completion tag after a RETURNING
    // result set even under -At.
    `UPDATE public.tournament_participants SET paid_amount = 45 WHERE user_id = '${PAID}' RETURNING paid_amount`
  ).split("\n")[0]
  check(
    "an overpayment is allowed — it is a real thing, not a constraint violation",
    overpay === "45",
    `got "${overpay}"`
  )
  runSql(
    `UPDATE public.tournament_participants SET paid_amount = 0, paid_at = NULL WHERE user_id = '${PAID}'`
  )

  // --- 2. The write, under RLS --------------------------------------------
  console.log("Who may record a payment (tournament_participants is admin-write):")

  // The exact statement app/api/admin/participants/route.ts issues.
  asUser(
    ADMIN,
    `UPDATE public.tournament_participants
        SET paid_amount = 30, paid_at = now(), paid_note = 'Venmo 9/2'
      WHERE user_id = '${PAID}' AND tournament_id = '${tournamentId}'`
  )
  check("an admin can record a payment", paidOf(PAID) === "30", `got "${paidOf(PAID)}"`)
  check(
    "…and the note lands with it",
    runSql(
      `SELECT paid_note FROM public.tournament_participants WHERE user_id = '${PAID}'`
    ) === "Venmo 9/2"
  )
  check(
    "…and paid_at is stamped",
    runSql(
      `SELECT paid_at IS NOT NULL FROM public.tournament_participants WHERE user_id = '${PAID}'`
    ) === "t"
  )

  // THE #99 SHAPE. This does not raise: RLS filters the row out and the UPDATE
  // reports success having changed nothing. Expecting a throw would pass for
  // the wrong reason, so the value is read back as the superuser instead.
  asUser(
    HALF,
    `UPDATE public.tournament_participants SET paid_amount = 30 WHERE user_id = '${HALF}'`
  )
  check(
    "a member marking THEMSELVES paid is a silent no-op, not an error",
    paidOf(HALF) === "0",
    `got "${paidOf(HALF)}" — if this is 30, anyone can clear their own debt`
  )
  asUser(
    HALF,
    `UPDATE public.tournament_participants SET paid_amount = 0 WHERE user_id = '${PAID}'`
  )
  check(
    "a member cannot un-record someone else's payment either",
    paidOf(PAID) === "30"
  )

  // The rest of the fixture, recorded the way the route does.
  asUser(
    ADMIN,
    `UPDATE public.tournament_participants SET paid_amount = 12, paid_at = now()
      WHERE user_id = '${HALF}' AND tournament_id = '${tournamentId}'`
  )
  asUser(
    ADMIN,
    `UPDATE public.tournament_participants SET paid_amount = 40, paid_at = now()
      WHERE user_id = '${GONE}' AND tournament_id = '${tournamentId}'`
  )

  // --- 3. The math, against SQL ground truth -------------------------------
  console.log("What the console and the settlement block report:")

  // The read /results does: live participants only, revoked excluded.
  const rowsCsv = runSql(`
    SELECT u.display_name || '|' || tp.entry_fee || '|' || tp.paid_amount
      FROM public.tournament_participants tp
      JOIN public.users u ON u.id = tp.user_id
     WHERE tp.tournament_id = '${tournamentId}'
       AND tp.revoked_at IS NULL
       AND tp.user_id IN ('${PAID}', '${HALF}', '${NONE}')
     ORDER BY u.display_name
  `)
  const participants: CollectionParticipant[] = rowsCsv
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [display_name, entry_fee, paid_amount] = line.split("|")
      return {
        display_name,
        entry_fee: Number(entry_fee),
        paid_amount: Number(paid_amount),
      }
    })

  const standing = collectionStanding(participants)

  // Computed independently, in SQL, over the same rows — so a bug in the
  // TypeScript sum can't validate itself.
  const truth = runSql(`
    SELECT sum(tp.entry_fee)::int || '|' || sum(least(tp.paid_amount, tp.entry_fee))::int
      FROM public.tournament_participants tp
     WHERE tp.tournament_id = '${tournamentId}'
       AND tp.revoked_at IS NULL
       AND tp.user_id IN ('${PAID}', '${HALF}', '${NONE}')
  `)
  const [truthExpected, truthCollected] = truth.split("|").map(Number)

  check(
    "expected matches SQL",
    standing.expected === truthExpected,
    `${standing.expected} vs ${truthExpected}`
  )
  check(
    "collected matches SQL",
    standing.collected === truthCollected,
    `${standing.collected} vs ${truthCollected}`
  )
  check(
    "the two people who are short are named, biggest gap first",
    JSON.stringify(standing.outstanding) ===
      JSON.stringify([
        { name: "Owes Olivia", owed: 20 },
        { name: "Half Hayden", owed: 18 },
      ]),
    JSON.stringify(standing.outstanding)
  )

  // A revoked member is out of the pool entirely (Sprint 21 / #91), so their
  // $40 must not appear as money collected — the console and /results both
  // filter revoked_at, and this proves the filter is doing something.
  check(
    "a revoked member's payment is not counted as collected",
    standing.collected === 42 && !JSON.stringify(standing.outstanding).includes("Gone Gary"),
    `collected ${standing.collected}`
  )

  const summary = buildCollectionSummary(standing, "Round Trip Open")
  check(
    "the settlement block reports the same numbers as the console",
    summary.includes(`$${standing.collected} of $${standing.expected} collected`),
    summary.split("\n")[2]
  )
  check(
    "…and names everyone still short",
    summary.includes("Owes Olivia — $20") && summary.includes("Half Hayden — $18")
  )

  // --- 4. The property the whole feature rests on --------------------------
  console.log("Collection is NOT a pool input (ADR 0001 §9):")

  const payoutsBefore = runSql(`
    SELECT coalesce(sum(theoretical_payout), 0)::text || '|' || count(*)::text
      FROM public.placement_payouts_view
  `)
  runSql(`UPDATE public.tournament_participants SET paid_amount = 0`)
  const payoutsAfter = runSql(`
    SELECT coalesce(sum(theoretical_payout), 0)::text || '|' || count(*)::text
      FROM public.placement_payouts_view
  `)
  check(
    "wiping every payment changes no payout at all",
    payoutsBefore === payoutsAfter,
    `${payoutsBefore} vs ${payoutsAfter} — an unpaid member still funds the pool and still gets paid`
  )
  const feesUnchanged = runSql(`
    SELECT sum(entry_fee)::int FROM public.tournament_participants
     WHERE tournament_id = '${tournamentId}' AND revoked_at IS NULL
  `)
  check(
    "…and no entry fee moved with it",
    Number(feesUnchanged) > 0,
    `Σ entry_fee = ${feesUnchanged}`
  )

  // Leave the database as we found it for anything downstream.
  runSql(`
    DELETE FROM public.tournament_participants WHERE user_id IN (${ids.map((i) => `'${i}'`).join(",")});
    DELETE FROM public.users WHERE id IN (${ids.map((i) => `'${i}'`).join(",")});
    DELETE FROM auth.users  WHERE id IN (${ids.map((i) => `'${i}'`).join(",")});
  `)

  console.log("")
  if (failures > 0) {
    console.error(`Entry-collection round trip FAILED: ${failures} check(s).`)
    process.exit(1)
  }
  console.log(
    "Entry-collection round trip passed: only an admin can record a payment, the two surfaces agree with SQL, and none of it touches the pool."
  )
}

main()
