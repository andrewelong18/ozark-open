// Sprint 11's "Done when", automated: take a snapshot, deliberately mangle a
// bet and a placement, restore, and prove the state matches the snapshot
// exactly.
//
// The sprint's own acceptance test says "mangle it in Studio". Studio is a
// human with a browser and prod credentials; this is the same four operations
// against the throwaway cluster, run on every `bash scripts/local-db-verify.sh`
// so the answer stays true rather than being true once in August.
//
// The check that carries the weight is a checksum over ALL FIVE tables, not a
// spot-check of the rows that were mangled. A restore that fixed the bet title
// while quietly dropping a soft-deleted placement, resetting a sequence, or
// nulling a column the payload didn't carry would pass any per-row assertion
// and fail this one.
//
// Setup: run by scripts/local-db-verify.sh after the other round trips, against
// the same cluster (migrations + seed already applied).

import { execFileSync } from "node:child_process"

const PGURI = process.env.PGURI ?? "postgresql://localhost:5432/ozark_roundtrip"

let failures = 0
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "  ✓" : "  ✗ FAIL"} ${label}${detail ? ` — ${detail}` : ""}`)
  if (!ok) failures++
}

function runSql(sql: string): string {
  return execFileSync("psql", [PGURI, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim()
}

/** Run a statement as an authenticated user, RLS enforced — the same helper
 * shape scripts/placement-roundtrip.ts uses. */
function asUser(userId: string, sql: string): string {
  const out = runSql(
    `SET ROLE authenticated; SET request.jwt.claim.sub = '${userId}'; ${sql}`
  )
  return out.split("\n").at(-1) ?? ""
}

const TABLES = [
  "tournaments",
  "tournament_participants",
  "bets",
  "bet_picks",
  "bet_placements",
] as const

/**
 * One md5 over every row of the five money tables. to_jsonb so column order and
 * type formatting are stable, ORDER BY id so row order can't make two identical
 * states look different.
 */
function stateChecksum(): string {
  const parts = TABLES.map(
    (t) =>
      `coalesce((SELECT md5(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id))
                 FROM public.${t} x), 'empty')`
  ).join(" || ")
  return runSql(`SELECT md5(${parts});`)
}

console.log("==> snapshot round trip (Sprint 11)")

// ── who we are ─────────────────────────────────────────────────────────────
// local-db-verify seeds four members; the admin flag is what take_snapshot
// gates on, so grab an admin and a non-admin to test both sides of the gate.
const adminId = runSql(
  `SELECT id FROM public.users WHERE is_admin = true ORDER BY email LIMIT 1;`
)
const memberId = runSql(
  `SELECT id FROM public.users WHERE is_admin = false ORDER BY email LIMIT 1;`
)
check("a seeded admin and a seeded member exist", adminId !== "" && memberId !== "")

// ── the gate ───────────────────────────────────────────────────────────────
// Proven here rather than assumed, because SECURITY DEFINER means a mistake in
// the gate is a hole straight past RLS into every wager in the tournament.
let refused = false
try {
  asUser(memberId, `SELECT public.take_snapshot('manual', 10);`)
} catch (err) {
  refused = /admins only/i.test(err instanceof Error ? err.message : String(err))
}
check("a non-admin member cannot take a snapshot", refused)

let memberCantRead = false
try {
  const rows = asUser(memberId, `SELECT count(*) FROM public.snapshots;`)
  memberCantRead = rows === "0"
} catch {
  memberCantRead = true
}
check("a non-admin member cannot read snapshots (payload holds open wagers)", memberCantRead)

// ── an invite, so the cascade hazard is actually exercised ─────────────────
// tournament_invites is NOT in the payload, and it carries an ON DELETE CASCADE
// to tournaments. A restore written the obvious way (TRUNCATE ... CASCADE, or a
// bare DELETE FROM tournaments) destroys the expected roster — hand-typed
// addresses of people not in the app yet — as a side effect of rolling back a
// bad bet import. The seed has no invites, so without this the check below
// would compare 0 to 0 and pass while proving nothing.
runSql(`
  INSERT INTO public.tournament_invites (tournament_id, email, invited_name)
  SELECT id, 'snapshot-roundtrip@test.local', 'Cascade Canary'
  FROM public.tournaments ORDER BY year DESC LIMIT 1
  ON CONFLICT DO NOTHING;`)
check(
  "an invite exists, so the cascade hazard is real in this run",
  runSql(`SELECT count(*) FROM public.tournament_invites;`) !== "0"
)

// ── take one ───────────────────────────────────────────────────────────────
const before = stateChecksum()
const snapshotId = asUser(adminId, `SELECT public.take_snapshot('manual', 50);`)
check("an admin takes a snapshot", /^[0-9a-f-]{36}$/.test(snapshotId), snapshotId)

const payloadCounts = runSql(`
  SELECT ${TABLES.map((t) => `jsonb_array_length(payload->'${t}')`).join(" || ',' || ")}
  FROM public.snapshots WHERE id = '${snapshotId}';`)
const liveCounts = runSql(
  `SELECT ${TABLES.map((t) => `(SELECT count(*) FROM public.${t})`).join(" || ',' || ")};`
)
check(
  "the payload holds every row of all five tables",
  payloadCounts === liveCounts,
  `payload ${payloadCounts} vs live ${liveCounts}`
)

// Taking a snapshot must not itself change the money state — it is a read.
check("taking a snapshot changed nothing", stateChecksum() === before)

// ── mangle it, the way a bad import or a fat-fingered Studio edit would ─────
console.log("\n==> mangling state (a bad edit, deliberately)")

const betId = runSql(`SELECT id FROM public.bets ORDER BY sheet_bet_id LIMIT 1;`)
const pickId = runSql(
  `SELECT id FROM public.bet_picks ORDER BY sheet_pick_id LIMIT 1;`
)
const placementId = runSql(
  `SELECT id FROM public.bet_placements WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;`
)
const softDeletedId = runSql(
  `SELECT id FROM public.bet_placements WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 1;`
)
check(
  "there is a bet, a pick and two live placements to mangle",
  betId !== "" && pickId !== "" && placementId !== "" && softDeletedId !== placementId
)

runSql(`
  -- a bet: retitled and reopened, as a wrong-sheet upload would do
  UPDATE public.bets SET title = 'MANGLED', status = 'hidden' WHERE id = '${betId}';
  -- a pick: repriced, the change that silently moves payouts
  UPDATE public.bet_picks SET american_odds = 99999, result = 'hit' WHERE id = '${pickId}';
  -- a placement: the stake edited, which is money
  UPDATE public.bet_placements SET amount = amount + 777 WHERE id = '${placementId}';
  -- another placement: soft-deleted, so the restore has to bring a REMOVED
  -- wager back to being removed rather than resurrecting it
  UPDATE public.bet_placements SET deleted_at = now() WHERE id = '${softDeletedId}';
  -- a whole row invented, to prove the restore deletes as well as inserts
  INSERT INTO public.bet_picks (bet_id, sheet_pick_id, label, american_odds, fractional_odds, probability)
  VALUES ('${betId}', 999999, 'PHANTOM PICK', -110, '10/11', 0.5238);
  -- and the entry fee moved, which changes the pool itself
  UPDATE public.tournament_participants SET entry_fee = entry_fee + 100
  WHERE id = (SELECT id FROM public.tournament_participants ORDER BY id LIMIT 1);`)

check("the mangled state differs from the snapshot", stateChecksum() !== before)

// ── restore ────────────────────────────────────────────────────────────────
console.log("\n==> restore")

const invitesBefore = runSql(`SELECT count(*) FROM public.tournament_invites;`)

try {
  execFileSync(
    "node",
    [
      "--experimental-strip-types",
      new URL("./restore-snapshot.ts", import.meta.url).pathname,
      snapshotId,
      PGURI,
      "--yes",
    ],
    { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
  )
  check("scripts/restore-snapshot.ts exits 0", true)
} catch (err) {
  const e = err as { stdout?: string; stderr?: string }
  check("scripts/restore-snapshot.ts exits 0", false)
  console.log(e.stdout ?? "")
  console.error(e.stderr ?? "")
}

// The headline: byte-for-byte, all five tables.
check("state matches the snapshot exactly", stateChecksum() === before)

// And the specific hazards, named, so a failure says which one broke.
check(
  "the retitled bet is back",
  runSql(`SELECT count(*) FROM public.bets WHERE title = 'MANGLED';`) === "0"
)
check(
  "the phantom pick is gone",
  runSql(`SELECT count(*) FROM public.bet_picks WHERE sheet_pick_id = 999999;`) === "0"
)
check(
  "the soft-deleted wager is still soft-deleted, not resurrected",
  runSql(
    `SELECT count(*) FROM public.bet_placements WHERE id = '${softDeletedId}' AND deleted_at IS NULL;`
  ) === "1"
)
check(
  "tournament_invites survived — it is not in the payload and must not be cascaded away",
  runSql(`SELECT count(*) FROM public.tournament_invites;`) === invitesBefore &&
    invitesBefore !== "0",
  `${invitesBefore} before`
)

// A restore is a state change worth recording, and the snapshot it restored
// from must still be there to restore again.
check(
  "the snapshot itself survived the restore",
  runSql(`SELECT count(*) FROM public.snapshots WHERE id = '${snapshotId}';`) === "1"
)

// ── restoring twice is the same as restoring once ──────────────────────────
try {
  execFileSync(
    "node",
    [
      "--experimental-strip-types",
      new URL("./restore-snapshot.ts", import.meta.url).pathname,
      snapshotId,
      PGURI,
      "--yes",
    ],
    { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
  )
} catch {
  // reported by the check below
}
check("restoring the same snapshot twice is idempotent", stateChecksum() === before)

// ── the guard rail ─────────────────────────────────────────────────────────
let refusedWithoutYes = false
try {
  execFileSync(
    "node",
    [
      "--experimental-strip-types",
      new URL("./restore-snapshot.ts", import.meta.url).pathname,
      snapshotId,
      PGURI,
    ],
    { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
  )
} catch {
  refusedWithoutYes = true
}
check("restoring without --yes is refused", refusedWithoutYes)
check("...and refusing changed nothing", stateChecksum() === before)

if (failures > 0) {
  console.error(`\nSnapshot round trip FAILED (${failures}).`)
  process.exit(1)
}
console.log(
  "\nSnapshot round trip passed: a deliberate bad edit is fully reversed by a snapshot id."
)
