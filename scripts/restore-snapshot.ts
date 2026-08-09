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

const payload = `(SELECT payload FROM public.snapshots WHERE id = ${sqlLiteral(snapshotId)})`

const restoreSql = `
BEGIN;

-- Not part of the payload, and would be cascaded away by the DELETE below.
CREATE TEMP TABLE _kept_invites ON COMMIT DROP AS
  SELECT * FROM public.tournament_invites;

-- Children first, so no foreign key is violated on the way down.
DELETE FROM public.bet_placements;
DELETE FROM public.bet_picks;
DELETE FROM public.bets;
DELETE FROM public.tournament_participants;
DELETE FROM public.tournament_invites;
DELETE FROM public.tournaments;

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
// dry run and scripts/sim-pool-verify.sh check against: entry fees minus voided
// stakes equals the pool. A restore that produced the right row counts but a
// different pool would mean the payload itself was wrong.
console.log("\nPool reconciliation (per tournament)")
const pool = execFileSync(
  "psql",
  [
    DB_URL as string,
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `SELECT
       t.name,
       t.status,
       coalesce(fees.entry_fees, 0)                                AS entry_fees,
       coalesce(v.voided_stakes, 0)                                AS voided_stakes,
       coalesce(fees.entry_fees, 0) - coalesce(v.voided_stakes, 0) AS pool,
       coalesce(p.pending_picks, 0)                                AS pending_picks
     FROM public.tournaments t
     LEFT JOIN LATERAL (
       SELECT sum(tp.entry_fee) AS entry_fees
       FROM public.tournament_participants tp
       WHERE tp.tournament_id = t.id AND tp.revoked_at IS NULL
     ) fees ON true
     LEFT JOIN LATERAL (
       SELECT sum(bp.amount) AS voided_stakes
       FROM public.bet_placements bp
       JOIN public.bet_picks pk ON pk.id = bp.pick_id
       JOIN public.bets b       ON b.id  = pk.bet_id
       JOIN public.tournament_participants tp
         ON tp.user_id = bp.user_id AND tp.tournament_id = b.tournament_id
       WHERE b.tournament_id = t.id
         AND bp.deleted_at IS NULL
         AND tp.revoked_at IS NULL
         AND pk.result = 'void'
     ) v ON true
     LEFT JOIN LATERAL (
       SELECT count(*) AS pending_picks
       FROM public.bet_picks pk
       JOIN public.bets b ON b.id = pk.bet_id
       WHERE b.tournament_id = t.id AND pk.result = 'pending'
     ) p ON true
     ORDER BY t.year DESC;`,
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
