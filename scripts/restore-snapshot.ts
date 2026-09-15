// Roll the money tables back to a save state (Sprint 11).
//
//   node --experimental-strip-types scripts/restore-snapshot.ts <id> --yes
//   node --experimental-strip-types scripts/restore-snapshot.ts <id> "$SUPABASE_DB_URL" --yes
//   node --experimental-strip-types scripts/restore-snapshot.ts --list
//
// THIS OVERWRITES CURRENT STATE. Everything written to tournaments,
// tournament_participants, bets, bet_picks and bet_placements since the
// snapshot was taken is gone when this finishes — including wagers placed in
// the meantime. It is the right tool for "the upload was wrong, put it back"
// and the wrong tool for almost everything else. --yes is required, and the
// script prints how old the snapshot is before it touches anything, because
// "how much am I about to throw away" is the only question that matters here.
//
// Relationship to scripts/db-export.sh (Sprint 9): that is the floor, this is
// the net. db-export.sh answers "the building burned down, rebuild from a
// folder"; this answers "someone mis-typed one cell five minutes ago". Neither
// replaces the other, and the runbook in docs/DATA_SAFETY.md says so.
//
// Same conventions as the other harnesses in this directory: psql over a
// connection string, no client library, a check() counter, non-zero exit on
// failure.

import { execFileSync } from "node:child_process"

// ── the five tables, parent-first ──────────────────────────────────────────
// Same set and same order as public.take_snapshot()'s payload. Insert order is
// this; delete order is its reverse.
const TABLES = [
  "tournaments",
  "tournament_participants",
  "bets",
  "bet_picks",
  "bet_placements",
] as const

let failures = 0
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "  ✓" : "  ✗ FAIL"} ${label}${detail ? ` — ${detail}` : ""}`)
  if (!ok) failures++
}

// ── arguments ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const confirmed = args.includes("--yes")
const listOnly = args.includes("--list")
const positional = args.filter((a) => !a.startsWith("--"))

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const snapshotId = positional.find((a) => UUID.test(a))
// Anything else positional is the connection string. Falls back the same way
// db-export.sh does, so the two scripts take the same arguments in the same
// order of preference.
const DB_URL =
  positional.find((a) => a !== snapshotId) ??
  process.env.SUPABASE_DB_URL ??
  process.env.PGURI

if (!DB_URL) {
  console.error(`No database to restore into.

  * For prod:  node --experimental-strip-types scripts/restore-snapshot.ts <id> "$SUPABASE_DB_URL" --yes
               (Supabase dashboard -> Project Settings -> Database -> Connection
                string. See docs/DATA_SAFETY.md for where the password lives.)
  * For local: PGURI=... node --experimental-strip-types scripts/restore-snapshot.ts <id> --yes`)
  process.exit(1)
}

// Never print the connection string: it carries the database password, and this
// script's output ends up pasted into issues and chat. Same treatment as
// db-export.sh.
const SAFE_HOST =
  DB_URL.replace(/^[^@]*@/, "").replace(/[/?].*$/, "") || "local socket"

function runSql(sql: string): string {
  return execFileSync(
    "psql",
    [DB_URL as string, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
    { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
  ).trim()
}

function runSqlFile(sql: string): string {
  return execFileSync(
    "psql",
    [DB_URL as string, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-At", "-f", "-"],
    { encoding: "utf-8", input: sql, stdio: ["pipe", "pipe", "pipe"] }
  ).trim()
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

// ── --list ─────────────────────────────────────────────────────────────────

function listSnapshots() {
  const rows = runSql(`
    SELECT id || E'\\t' || to_char(created_at, 'YYYY-MM-DD HH24:MI:SS')
           || E'\\t' || trigger
           || E'\\t' || pg_size_pretty(pg_column_size(payload)::bigint)
    FROM public.snapshots ORDER BY created_at DESC LIMIT 25;`)
  if (rows === "") {
    console.log("No snapshots yet.")
    return
  }
  console.log("id                                     taken (UTC)          trigger      size")
  for (const line of rows.split("\n")) {
    const [id, taken, trigger, size] = line.split("\t")
    console.log(
      `${id}  ${taken}  ${(trigger ?? "").padEnd(11)}  ${size}`
    )
  }
  console.log(
    "\nRestore one:  node --experimental-strip-types scripts/restore-snapshot.ts <id> --yes"
  )
}

if (listOnly) {
  listSnapshots()
  process.exit(0)
}

if (!snapshotId) {
  console.error(
    "Which snapshot? Pass its id (a uuid).\n" +
      "  node --experimental-strip-types scripts/restore-snapshot.ts --list"
  )
  process.exit(1)
}

// ── the snapshot ───────────────────────────────────────────────────────────

console.log(`==> restoring into ${SAFE_HOST}`)

const meta = runSql(`
  SELECT to_char(created_at, 'YYYY-MM-DD HH24:MI:SS')
         || E'\\t' || trigger
         || E'\\t' || round(extract(epoch FROM (now() - created_at)) / 60)::text
  FROM public.snapshots WHERE id = ${sqlLiteral(snapshotId)};`)

if (meta === "") {
  console.error(`No snapshot with id ${snapshotId}.`)
  console.error(
    "  node --experimental-strip-types scripts/restore-snapshot.ts --list"
  )
  process.exit(1)
}

const [takenAt, trigger, ageMinutes] = meta.split("\t")
console.log(
  `    snapshot ${snapshotId}\n` +
    `    taken    ${takenAt} UTC (${ageMinutes} minutes ago, trigger: ${trigger})`
)

// What the payload claims to hold. Read before the restore so it can be
// compared against the tables afterwards — this is the manifest idea from
// db-export.sh: a restore nobody checked is a command, not a restore.
const expected = new Map<string, number>()
for (const table of TABLES) {
  const n = runSql(
    `SELECT jsonb_array_length(payload->${sqlLiteral(table)})
     FROM public.snapshots WHERE id = ${sqlLiteral(snapshotId)};`
  )
  if (n === "" || n === null) {
    console.error(
      `This snapshot has no '${table}' in its payload — it was written by an ` +
        `older version of take_snapshot() and can't be restored safely.`
    )
    process.exit(1)
  }
  expected.set(table, Number(n))
}

console.log("\n    the save state holds:")
for (const table of TABLES) {
  console.log(`      ${table.padEnd(24)} ${expected.get(table)}`)
}

// What is there now, so the operator sees the size of what they're discarding.
console.log("\n    the database currently holds:")
const current = new Map<string, number>()
for (const table of TABLES) {
  const n = Number(runSql(`SELECT count(*) FROM public.${table};`))
  current.set(table, n)
  const delta = n - (expected.get(table) ?? 0)
  const note = delta === 0 ? "" : delta > 0 ? `  (${delta} will be discarded)` : `  (${-delta} will come back)`
  console.log(`      ${table.padEnd(24)} ${n}${note}`)
}

if (!confirmed) {
  console.error(
    "\nRefusing to restore without --yes.\n" +
      "This OVERWRITES current state: everything written to those five tables\n" +
      "since the snapshot was taken is discarded, including wagers placed in\n" +
      "the meantime. Re-run with --yes when you're sure."
  )
  process.exit(1)
}

// ── the restore, in one transaction ────────────────────────────────────────
//
// DELETE-and-reinsert rather than TRUNCATE, for one specific reason:
// tournament_invites has an ON DELETE CASCADE foreign key to tournaments and is
// NOT part of the payload. A TRUNCATE ... CASCADE, or a bare DELETE FROM
// tournaments, would silently destroy the invite list — the expected roster,
// typed in by hand — as a side effect of rolling back a bad bet import. So the
// invites are stashed in a temp table and put back afterwards, for every
// tournament that still exists once the payload has been applied. Invites
// belonging to a tournament the snapshot doesn't have are correctly gone: so is
// the tournament.
//
// jsonb_populate_recordset does the column mapping, so NO COLUMN IS NAMED
// ANYWHERE in this file. A migration that adds one is carried through
// automatically — the same property that makes take_snapshot() use to_jsonb(),
// and the reason neither end of this round trip can quietly go stale.
//
// One transaction: a restore that half-applied would leave the money data in a
// state that never existed, which is worse than either endpoint.
//
// WHY EVERY DELETE BELOW CARRIES `WHERE true`. It is not needed on this path:
// psql connects as the database owner, where pg-safeupdate is not preloaded, so
// a bare `DELETE FROM public.bet_placements;` runs fine from here — and did, for
// a month. It is needed in public.restore_snapshot() (migration
// 20260911000000), because PostgREST connects as `authenticator`, which has
// session_preload_libraries = safeupdate and refuses WHERE-less DML inside a
// SECURITY DEFINER body. The clause is mirrored here for one reason:
// 20260908000000 line 126 says this transaction and that function's are "the
// same transaction expressed twice, and they must stay that way", and a reader
// comparing the two must not find a difference they have to explain.
// scripts/snapshot-restore-roundtrip.ts asserts they match.

const payload = `(SELECT payload FROM public.snapshots WHERE id = ${sqlLiteral(snapshotId)})`

const restoreSql = `
BEGIN;

-- Stand the entry-fee guard down for the restore (migration 20260902000001).
-- A restore reproduces a state that already existed; re-litigating whether it
-- was reachable is not its job. A snapshot taken before that trigger shipped
-- can hold an over-cap row from the very race the trigger now prevents, and a
-- guard that refused to put it back would have broken the undo button on
-- exactly the disaster it was built for. SET LOCAL, so it lasts one
-- transaction and no longer.
SET LOCAL ozark.restoring = 'on';

-- Not part of the payload, and would be cascaded away by the DELETE below.
CREATE TEMP TABLE _kept_invites ON COMMIT DROP AS
  SELECT * FROM public.tournament_invites;

-- Children first, so no foreign key is violated on the way down. The
-- \`WHERE true\` is not load-bearing HERE (see the note above), only identical.
DELETE FROM public.bet_placements          WHERE true;
DELETE FROM public.bet_picks               WHERE true;
DELETE FROM public.bets                    WHERE true;
DELETE FROM public.tournament_participants WHERE true;
DELETE FROM public.tournament_invites      WHERE true;
DELETE FROM public.tournaments             WHERE true;

-- Parents first on the way back up.
INSERT INTO public.tournaments
SELECT * FROM jsonb_populate_recordset(null::public.tournaments, ${payload}->'tournaments');

INSERT INTO public.tournament_participants
SELECT * FROM jsonb_populate_recordset(null::public.tournament_participants, ${payload}->'tournament_participants');

INSERT INTO public.bets
SELECT * FROM jsonb_populate_recordset(null::public.bets, ${payload}->'bets');

INSERT INTO public.bet_picks
SELECT * FROM jsonb_populate_recordset(null::public.bet_picks, ${payload}->'bet_picks');

INSERT INTO public.bet_placements
SELECT * FROM jsonb_populate_recordset(null::public.bet_placements, ${payload}->'bet_placements');

-- The invites come back for every tournament that survived the restore.
INSERT INTO public.tournament_invites
SELECT * FROM _kept_invites
WHERE tournament_id IN (SELECT id FROM public.tournaments);

COMMIT;
`

console.log("\n==> restoring (one transaction)")
try {
  runSqlFile(restoreSql)
} catch (err) {
  const detail = err instanceof Error ? err.message : String(err)
  console.error("\nRESTORE FAILED — the transaction rolled back and nothing changed.")
  console.error(detail)
  process.exit(1)
}

// ── the manifest ───────────────────────────────────────────────────────────
//
// db-export.sh's idea, applied to the other direction: the operation reports
// numbers that prove it did what it said. A restore that silently restored
// nothing is exactly as dangerous as an export that silently captured nothing.

console.log("\nRestore manifest")
console.log("  snapshot   :", snapshotId)
console.log("  taken (UTC):", takenAt)
console.log("  host       :", SAFE_HOST)
console.log("\nRow counts (restored vs the save state)")

for (const table of TABLES) {
  const actual = Number(runSql(`SELECT count(*) FROM public.${table};`))
  const want = expected.get(table) ?? -1
  check(
    `${table.padEnd(24)} ${String(actual).padStart(5)}`,
    actual === want,
    actual === want ? undefined : `expected ${want}`
  )
}

// The same reconciliation db-export.sh's manifest carries, and the same one the
// dry run and scripts/sim-pool-verify.sh check against — per phase since
// Sprint 30 (ADR 0002): committed entries minus voided stakes equals each pot.
// A restore that produced the right row counts but a different pool would
// mean the payload itself was wrong.
console.log("\nPool reconciliation (per tournament, per phase)")
const pool = execFileSync(
  "psql",
  [
    DB_URL as string,
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `WITH phases AS (
       SELECT t.id AS tournament_id, t.name, t.status, t.year, t.entry_fee_min, ph.phase
       FROM public.tournaments t
       CROSS JOIN (VALUES (1), (2)) AS ph (phase)
     ),
     entries AS (
       -- Revoked participants leave the pots entirely, fees and wagers together
       -- (PRD §12 A13). NULL = not entered in that phase.
       SELECT tp.tournament_id, ph.phase, tp.user_id,
              CASE ph.phase WHEN 1 THEN tp.phase1_entry_fee ELSE tp.phase2_entry_fee END AS entry
       FROM public.tournament_participants tp
       CROSS JOIN (VALUES (1), (2)) AS ph (phase)
       WHERE tp.revoked_at IS NULL
     ),
     live AS (
       SELECT b.tournament_id, b.phase, bp.user_id,
              sum(bp.amount)                                    AS wagered,
              coalesce(sum(bp.amount) FILTER (WHERE pk.result = 'void'), 0) AS voided,
              count(*)                                          AS placements
       FROM public.bet_placements bp
       JOIN public.bet_picks pk ON pk.id = bp.pick_id
       JOIN public.bets b       ON b.id  = pk.bet_id
       WHERE bp.deleted_at IS NULL
       GROUP BY b.tournament_id, b.phase, bp.user_id
     ),
     per_bettor AS (
       -- Only people entered in the phase: a wager in a phase with no entry
       -- belongs to no pot (lib/payouts.ts drops it the same way).
       SELECT e.tournament_id, e.phase, e.entry,
              coalesce(l.wagered, 0)    AS wagered,
              coalesce(l.voided, 0)     AS voided,
              coalesce(l.placements, 0) AS placements
       FROM entries e
       LEFT JOIN live l
         ON l.tournament_id = e.tournament_id AND l.phase = e.phase AND l.user_id = e.user_id
       WHERE e.entry IS NOT NULL
     )
     SELECT
       p.name,
       p.status,
       p.phase,
       count(pb.entry)                                                        AS entrants,
       coalesce(sum(pb.entry), 0)                                             AS entries,
       coalesce(sum(LEAST(pb.entry, GREATEST(pb.wagered, p.entry_fee_min))), 0) AS committed,
       coalesce(sum(pb.voided), 0)                                            AS voided_stakes,
       coalesce(sum(LEAST(pb.entry, GREATEST(pb.wagered, p.entry_fee_min))), 0)
         - coalesce(sum(pb.voided), 0)                                        AS pool,
       coalesce(sum(pb.wagered), 0)                                           AS wagered,
       coalesce(sum(pb.placements), 0)                                        AS live_placements,
       (SELECT count(*)
          FROM public.bet_picks pk
          JOIN public.bets b ON b.id = pk.bet_id
         WHERE b.tournament_id = p.tournament_id
           AND b.phase = p.phase
           AND pk.result = 'pending')                                         AS pending_picks
     FROM phases p
     LEFT JOIN per_bettor pb ON pb.tournament_id = p.tournament_id AND pb.phase = p.phase
     GROUP BY p.tournament_id, p.name, p.status, p.year, p.phase, p.entry_fee_min
     ORDER BY p.year DESC, p.phase;`,
  ],
  { encoding: "utf-8" }
)
console.log(pool.trimEnd())

if (failures > 0) {
  console.error(
    `\nRESTORE VERIFICATION FAILED (${failures}). The transaction committed, but ` +
      `the tables do not match the save state — do not carry on as if they do.`
  )
  process.exit(1)
}

console.log("\nRestore complete: the five money tables match the save state.")
console.log(
  "Nothing else was touched — accounts, invites and avatars are as they were."
)
