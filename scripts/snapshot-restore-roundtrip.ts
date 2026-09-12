// restore_snapshot() / snapshot_index() round-trip — the restore button, tested.
//
// Sprint 27 moved the restore out of scripts/restore-snapshot.ts and into the
// database, so that Pat can reach it from a phone. That script keeps its own
// round trip (scripts/snapshot-roundtrip.ts); this one covers the RPC path the
// app actually presses, which shares none of its code.
//
// It is the first destructive control in the app, so the checks are chosen for
// how badly each failure ends rather than for coverage:
//
//   1. THE GATE. A non-admin JWT is refused with 42501, on both functions, and
//      anon cannot execute either at all. There is no other guard: the
//      functions are SECURITY DEFINER, so RLS is switched off inside them, and
//      scripts/policy-manifest.ts only looks at pg_policy — a GRANT EXECUTE to
//      anon on an RPC would pass every other check in this repo.
//   2. THE LISTING NEVER RETURNS payload. It is hundreds of KB a row, and the
//      whole reason snapshot_index() exists rather than a PostgREST select.
//   3. THE RESTORE IS EXACT. md5 over all five money tables, before and after.
//   4. THE THINGS THAT ARE NOT IN THE PAYLOAD SURVIVE — tournament_invites
//      cascades off tournaments, and losing it costs the hand-typed roster.
//   5. THE UNDO HAS AN UNDO. A 'pre-restore' snapshot exists, holds the state
//      as it was JUST BEFORE the restore, and restores back to it.
//   6. THE GUARD STANDS DOWN. A save state holding an over-cap wager — from
//      the very race migration 20260902000001 prevents — must restore.
//   7. THE PRUNE CANNOT EAT ITS OWN TAIL. Restoring must not evict the
//      snapshot being restored.
//   8. THE TWO PROPERTIES THIS HARNESS IS OTHERWISE BLIND TO, because it
//      talks to Postgres over psql as the database owner while production
//      talks to it through PostgREST as `authenticated`. Sprint 27 shipped
//      `DELETE FROM public.bet_placements;` and checks 1-7 went green for
//      three days while the button was dead in prod, answering "DELETE
//      requires a WHERE clause" to every press: the `authenticator` LOGIN
//      role has session_preload_libraries = safeupdate, a
//      post_parse_analyze_hook that rejects CMD_DELETE/CMD_UPDATE whose
//      jointree->quals is NULL — inside plpgsql, SECURITY DEFINER or not —
//      and session_preload_libraries resolves at CONNECT time for the LOGIN
//      role, so the `SET ROLE authenticated` below never loads it.
//
//      Volatility was checked here too for one draft, on the theory that
//      PostgREST runs a STABLE function in a read-only transaction where psql
//      does not. It was removed once the sabotage showed Postgres refuses
//      "DELETE is not allowed in a non-volatile function" on BOTH paths, at
//      which point checks 3-7 catch a volatility marker immediately and
//      loudly. A check that only fires where another already has is worse
//      than none here, because it is counted.
//
// EVERY ONE OF THESE WAS PROVEN ABLE TO FAIL by sabotaging the thing it
// guards and watching it go red; the transcripts are in the commit that added
// this file. That discipline is not decoration here — Sprint 11's invite check
// compared 0 to 0 and proved nothing for a month, and Sprint 26 found a unit
// fixture that could not distinguish the axis it was testing. Hence the
// `invitesBefore !== "0"` clauses below: a check that cannot fail is worse
// than no check, because it is counted.
//
// Setup: the throwaway cluster the other round-trips use. Run standalone with
//   PGURI=... node --experimental-strip-types scripts/snapshot-restore-roundtrip.ts

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

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

/**
 * The same, with SQLSTATEs in the error text.
 *
 * This repo has never asserted a SQLSTATE before — scripts/snapshot-roundtrip.ts
 * matches on /admins only/i — and there is a trap in doing it naively: under
 * psql's default verbosity the code is NEVER printed, so a /42501/ test would
 * silently never match and the check would pass or fail by accident. VERBOSITY
 * = verbose is what puts "ERROR:  42501: Admins only." on stderr.
 */
function runSqlVerbose(sql: string): string {
  return execFileSync(
    "psql",
    [PGURI, "-X", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-At", "-c", sql],
    { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
  ).trim()
}

/** Run as an authenticated member, RLS enforced. The SETs print command tags,
 *  so the statement's own result is the last line. */
function asUser(userId: string, sql: string): string {
  const out = runSql(
    `SET ROLE authenticated; SET request.jwt.claim.sub = '${userId}'; ${sql}`
  )
  return out.split("\n").at(-1) ?? ""
}

/** Did this raise the given SQLSTATE? Verbose mode, so the code is in the text. */
function raisesSqlstate(userId: string | null, sql: string, code: string): boolean {
  const prefix =
    userId === null
      ? "SET ROLE anon;"
      : `SET ROLE authenticated; SET request.jwt.claim.sub = '${userId}';`
  try {
    runSqlVerbose(`${prefix} ${sql}`)
    return false
  } catch (err) {
    const e = err as { message?: string; stderr?: string }
    return new RegExp(`\\b${code}\\b`).test(`${e.stderr ?? ""}${e.message ?? ""}`)
  }
}

const TABLES = [
  "tournaments",
  "tournament_participants",
  "bets",
  "bet_picks",
  "bet_placements",
] as const

/** One md5 over every row of the five money tables — the same shape
 *  scripts/snapshot-roundtrip.ts uses, so the two harnesses agree on what
 *  "identical state" means. to_jsonb for stable column order, ORDER BY id so
 *  row order can't make two identical states look different. */
function stateChecksum(): string {
  const parts = TABLES.map(
    (t) =>
      `coalesce((SELECT md5(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id))
                 FROM public.${t} x), 'empty')`
  ).join(" || ")
  return runSql(`SELECT md5(${parts});`)
}

function count(table: string): string {
  return runSql(`SELECT count(*) FROM public.${table};`)
}

function main() {
  console.log("restore_snapshot() / snapshot_index() round-trip\n")

  // --- Local-stub plumbing: GUC-backed auth.uid() + grants ------------------
  // Re-asserted idempotently so this runs standalone. USAGE goes to anon too,
  // deliberately: the anon checks below must fail on the function's own REVOKE,
  // not on a missing schema grant, or they would pass for the wrong reason.
  runSql(`
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    GRANT USAGE ON SCHEMA public TO authenticated, anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  `)

  const adminId = runSql(
    `SELECT id FROM public.users WHERE is_admin = true ORDER BY email LIMIT 1;`
  )
  const memberId = runSql(
    `SELECT id FROM public.users WHERE is_admin = false ORDER BY email LIMIT 1;`
  )
  check("a seeded admin and a seeded member exist", adminId !== "" && memberId !== "")

  // The cascade canary. tournament_invites is NOT in the payload and carries an
  // ON DELETE CASCADE to tournaments, so a restore written the obvious way
  // destroys the hand-typed roster as a side effect of rolling back a bad bet
  // import. The seed has no invites, so WITHOUT THIS ROW the survival check
  // below would compare 0 to 0 and prove nothing — which is precisely what
  // Sprint 11's version did.
  runSql(`
    INSERT INTO public.tournament_invites (tournament_id, email, invited_name)
    SELECT id, 'restore-roundtrip@test.local', 'Cascade Canary'
    FROM public.tournaments ORDER BY year DESC LIMIT 1
    ON CONFLICT DO NOTHING;`)
  const invitesBefore = count("tournament_invites")
  check(
    "an invite exists, so the cascade hazard is real in this run",
    invitesBefore !== "0",
    `${invitesBefore} invite(s)`
  )

  // --- 1. snapshot_index(): shape ------------------------------------------
  console.log("\n  snapshot_index()")

  const signature = runSql(
    `SELECT pg_get_function_result('public.snapshot_index(int)'::regprocedure)`
  ).replace(/\s+/g, " ")
  check(
    "returns exactly (id, created_at, trigger, bytes, the five counts, the two live counts)",
    signature ===
      "TABLE(id uuid, created_at timestamp with time zone, trigger text, bytes bigint, " +
        "tournaments integer, tournament_participants integer, bets integer, " +
        "bet_picks integer, bet_placements integer, live_placements integer, " +
        "active_participants integer)",
    signature
  )
  // The reason the function exists. payload is hundreds of KB a row, and a
  // listing that selected it would ship megabytes to a phone.
  check("never returns payload", !/payload/i.test(signature), signature)

  // --- 2. The gate ----------------------------------------------------------
  console.log("\n  the gate")

  check(
    "a non-admin member calling snapshot_index() is refused with 42501",
    raisesSqlstate(memberId, `SELECT * FROM public.snapshot_index(10);`, "42501")
  )
  check(
    "a non-admin member calling restore_snapshot() is refused with 42501",
    raisesSqlstate(
      memberId,
      `SELECT public.restore_snapshot('00000000-0000-4000-8000-000000000000');`,
      "42501"
    )
  )
  // anon has USAGE on the schema (granted above), so this can only fail on the
  // function's REVOKE — which is the only drift check these grants will ever
  // have, since policy-manifest.ts reads pg_policy and not pg_proc.proacl.
  let anonIndex = false
  try {
    runSql(`SET ROLE anon; SELECT * FROM public.snapshot_index(10);`)
  } catch {
    anonIndex = true
  }
  check("anon cannot execute snapshot_index() at all", anonIndex)

  let anonRestore = false
  try {
    runSql(
      `SET ROLE anon; SELECT public.restore_snapshot('00000000-0000-4000-8000-000000000000');`
    )
  } catch {
    anonRestore = true
  }
  check("anon cannot execute restore_snapshot() at all", anonRestore)

  // --- 3. The over-cap wager the guard must let back in ---------------------
  //
  // A snapshot can legitimately hold a row that breaks PRD §7 rule 6, because
  // it was taken before migration 20260902000001 shipped, or because it caught
  // the very race that trigger now prevents. A restore reproduces a state that
  // existed; re-litigating whether it was reachable is not its job. So the
  // save state below is built by standing the guard down deliberately, and the
  // restore has to be able to put it back.
  console.log("\n  the entry-fee guard stands down for a replay")

  const capUser = runSql(`
    SELECT tp.user_id FROM public.tournament_participants tp
     WHERE tp.revoked_at IS NULL ORDER BY tp.id LIMIT 1;`)
  const capPick = runSql(`
    SELECT p.id FROM public.bet_picks p
     WHERE p.id NOT IN (SELECT pick_id FROM public.bet_placements WHERE user_id = '${capUser}')
     ORDER BY p.id LIMIT 1;`)
  // Over the entry fee on its own, so it cannot pass the trigger honestly.
  runSql(`
    SET ozark.restoring = 'on';
    INSERT INTO public.bet_placements (user_id, pick_id, amount, odds_at_placement)
    SELECT '${capUser}', '${capPick}', tp.entry_fee + 500, -110
      FROM public.tournament_participants tp
     WHERE tp.user_id = '${capUser}' LIMIT 1;`)
  const overCapId = runSql(
    `SELECT id FROM public.bet_placements WHERE user_id = '${capUser}' AND pick_id = '${capPick}';`
  )
  check("an over-cap wager exists, so this check is not vacuous", overCapId !== "")

  const capSnapshot = asUser(adminId, `SELECT public.take_snapshot('manual', NULL);`)
  runSql(`DELETE FROM public.bet_placements WHERE id = '${overCapId}';`)
  check(
    "...and is gone before the restore",
    runSql(`SELECT count(*) FROM public.bet_placements WHERE id = '${overCapId}';`) === "0"
  )

  let capRestored = false
  try {
    asUser(adminId, `SELECT public.restore_snapshot('${capSnapshot}');`)
    capRestored =
      runSql(`SELECT count(*) FROM public.bet_placements WHERE id = '${overCapId}';`) === "1"
  } catch (err) {
    // OZ001 is enforce_placement_total()'s code: the guard did NOT stand down.
    console.log(`      ${(err as Error).message.split("\n")[0]}`)
  }
  check("an over-cap wager restores — the guard stood down (OZ001 would mean it didn't)", capRestored)

  runSql(`DELETE FROM public.bet_placements WHERE id = '${overCapId}';`)

  // --- 4. The restore itself ------------------------------------------------
  console.log("\n  the restore")

  const before = stateChecksum()
  const expectedPlacements = count("bet_placements")
  const snapshotId = asUser(adminId, `SELECT public.take_snapshot('manual', NULL);`)
  check("an admin can take a snapshot", /^[0-9a-f-]{36}$/.test(snapshotId), snapshotId)

  // The listing reports the save state's own contents, which is the number Pat
  // reads off the console before deciding to restore.
  const indexed = asUser(
    adminId,
    `SELECT bet_placements || '/' || tournaments || '/' || (bytes > 0)::text
       FROM public.snapshot_index(50) WHERE id = '${snapshotId}';`
  )
  check(
    "snapshot_index() reports the save state's bet-placement count",
    indexed === `${expectedPlacements}/1/true`,
    `${indexed} (live placements: ${expectedPlacements})`
  )

  // --- 3b. The counts tell a row from a wager -------------------------------
  //
  // THE SEPT 12 BUG, encoded. Remove a wager, take a save state, and every
  // number on /admin/snapshots sat still: removal is a soft delete, so the row
  // survives in the payload (deliberately — restoring without it would
  // resurrect money the bettor had taken off the table) and
  // jsonb_array_length() counted it. The headline could only ever go up.
  //
  // Both numbers are asserted together on purpose. Filtering the row count
  // would "fix" the headline and quietly break the restore; the point is that
  // the payload keeps everything and the LISTING learns to read it two ways.
  console.log("\n  live counts vs row counts")

  const rowsBefore = Number(count("bet_placements"))
  const liveBefore = Number(
    runSql(`SELECT count(*) FROM public.bet_placements WHERE deleted_at IS NULL;`)
  )
  // Not vacuous in either direction: the seed already carries soft-deleted
  // wagers, which is exactly why the two numbers have to be measured rather
  // than derived from each other.
  check(
    "the seed already holds removed wagers, so the two counts start apart",
    liveBefore < rowsBefore,
    `${liveBefore} live of ${rowsBefore} rows`
  )

  const doomed = runSql(
    `SELECT id FROM public.bet_placements WHERE deleted_at IS NULL ORDER BY id LIMIT 1;`
  )
  runSql(`UPDATE public.bet_placements SET deleted_at = now() WHERE id = '${doomed}';`)

  const softId = asUser(adminId, `SELECT public.take_snapshot('manual', NULL);`)
  const softCounts = asUser(
    adminId,
    `SELECT bet_placements || '/' || live_placements
       FROM public.snapshot_index(50) WHERE id = '${softId}';`
  )
  check(
    "removing a wager drops live_placements but not the row count",
    softCounts === `${rowsBefore}/${liveBefore - 1}`,
    `${softCounts} (expected ${rowsBefore}/${liveBefore - 1})`
  )

  // Same shape for the roster: revoking is a soft stamp, and eligibility
  // everywhere else in the app is "a row exists AND revoked_at IS NULL".
  const participantRows = Number(count("tournament_participants"))
  const revoked = runSql(
    `SELECT id FROM public.tournament_participants
      WHERE revoked_at IS NULL ORDER BY id LIMIT 1;`
  )
  runSql(
    `UPDATE public.tournament_participants SET revoked_at = now() WHERE id = '${revoked}';`
  )
  const revokedId = asUser(adminId, `SELECT public.take_snapshot('manual', NULL);`)
  const revokedCounts = asUser(
    adminId,
    `SELECT tournament_participants || '/' || active_participants
       FROM public.snapshot_index(50) WHERE id = '${revokedId}';`
  )
  check(
    "revoking a participant drops active_participants but not the row count",
    revokedCounts === `${participantRows}/${participantRows - 1}`,
    `${revokedCounts} (expected ${participantRows}/${participantRows - 1})`
  )

  // A payload from before a table was captured reports NULL for the row count;
  // the live count must agree rather than reporting a confident 0, or the
  // console's "predates this" em dash becomes "this save state holds none".
  const legacyId = runSql(`
    WITH ins AS (
      INSERT INTO public.snapshots (trigger, payload)
      VALUES ('manual', '{"tournaments": []}'::jsonb) RETURNING id
    ) SELECT id FROM ins;`)
  const legacy = asUser(
    adminId,
    `SELECT coalesce(bet_placements::text, 'null') || '/' ||
            coalesce(live_placements::text, 'null')
       FROM public.snapshot_index(50) WHERE id = '${legacyId}';`
  )
  check(
    "a payload predating wagers reports NULL for both, never 0",
    legacy === "null/null",
    legacy
  )
  runSql(`DELETE FROM public.snapshots WHERE id = '${legacyId}';`)

  // Put the two soft stamps back: everything below checksums the whole state,
  // and a restore to `before` has to be comparable to what was captured there.
  runSql(`
    UPDATE public.bet_placements SET deleted_at = NULL WHERE id = '${doomed}';
    UPDATE public.tournament_participants SET revoked_at = NULL WHERE id = '${revoked}';`)

  // A bad edit, the shape of the disaster this whole system exists for:
  // last week's sheet, or a fat-fingered cell at 10pm.
  const betId = runSql(`SELECT id FROM public.bets ORDER BY sheet_bet_id LIMIT 1;`)
  const pickId = runSql(`SELECT id FROM public.bet_picks WHERE bet_id = '${betId}' ORDER BY id LIMIT 1;`)
  runSql(`
    UPDATE public.bets SET title = 'MANGLED', status = 'hidden' WHERE id = '${betId}';
    UPDATE public.bet_picks SET american_odds = 99999, result = 'hit' WHERE id = '${pickId}';
    -- Edited DOWN: since 20260902000001 the database refuses a write that takes
    -- a bettor over their entry, so "+777" is no longer a bad edit an admin can
    -- actually make.
    UPDATE public.bet_placements SET amount = 1
     WHERE id = (SELECT id FROM public.bet_placements WHERE deleted_at IS NULL ORDER BY id LIMIT 1);
    INSERT INTO public.bet_picks (bet_id, sheet_pick_id, label, american_odds, fractional_odds, probability)
    VALUES ('${betId}', 999999, 'PHANTOM PICK', -110, '10/11', 0.5238);
    UPDATE public.tournament_participants SET entry_fee = entry_fee + 100
     WHERE id = (SELECT id FROM public.tournament_participants ORDER BY id LIMIT 1);`)
  const mangled = stateChecksum()
  check("the mangled state differs from the save state", mangled !== before)
  // The invites are deliberately NOT touched by the mangle. The hazard is that
  // the restore's own DELETE FROM tournaments cascades them away as a side
  // effect — nobody asked for that, which is what makes it a bug rather than a
  // rollback. They must still be here going in.
  check("...and the invites are still standing going into the restore",
    count("tournament_invites") === invitesBefore)

  const manifest = JSON.parse(
    asUser(adminId, `SELECT public.restore_snapshot('${snapshotId}');`)
  ) as {
    restored_from: string
    pre_restore_snapshot: string
    counts: Record<string, number>
    expected: Record<string, number>
    invites_restored: number
  }

  check("state matches the save state exactly", stateChecksum() === before)
  check(
    "the manifest's counts match what the payload claimed",
    TABLES.every((t) => manifest.counts[t] === manifest.expected[t]),
    JSON.stringify(manifest.counts)
  )
  check("the manifest names the snapshot it restored", manifest.restored_from === snapshotId)
  check(
    "the snapshot it restored still exists",
    runSql(`SELECT count(*) FROM public.snapshots WHERE id = '${snapshotId}';`) === "1"
  )
  asUser(adminId, `SELECT public.restore_snapshot('${snapshotId}');`)
  check("restoring the same save state twice is idempotent", stateChecksum() === before)

  // --- 5. The things not in the payload ------------------------------------
  console.log("\n  what is not in the payload")

  // The mangle DELETEd every invite, so a restore that merely failed to cascade
  // them away would still leave 0 here. Getting the canary back means the stash
  // put it back — and `invitesBefore !== "0"` is what stops this comparing 0 to 0.
  check(
    "tournament_invites came back — it is not in the payload and must be stashed",
    count("tournament_invites") === invitesBefore && invitesBefore !== "0",
    `${invitesBefore} before, ${count("tournament_invites")} after`
  )

  // --- 6. The undo's undo ---------------------------------------------------
  console.log("\n  the pre-restore save state")

  check(
    "a 'pre-restore' snapshot was written",
    runSql(
      `SELECT count(*) FROM public.snapshots WHERE id = '${manifest.pre_restore_snapshot}' AND trigger = 'pre-restore';`
    ) === "1"
  )
  // It has to hold the state as it was JUST BEFORE the restore — i.e. the
  // MANGLED one. A pre-restore snapshot taken a moment too late would look
  // identical to the restored state and be worthless as an undo.
  const preChecksum = (() => {
    asUser(adminId, `SELECT public.restore_snapshot('${manifest.pre_restore_snapshot}');`)
    return stateChecksum()
  })()
  check("...and it holds the state from just BEFORE the restore, not after", preChecksum === mangled)

  // Back to good, so the checks below (and any later harness) see sane state.
  asUser(adminId, `SELECT public.restore_snapshot('${snapshotId}');`)
  check("...and restoring forward again returns to the save state", stateChecksum() === before)

  // --- 7. The prune cannot eat its own tail --------------------------------
  console.log("\n  retention")

  // take_snapshot() prunes past its keep. If restore_snapshot() passed a small
  // one, the pre-restore snapshot it writes could evict the very save state
  // being restored — losing the ability to redo it. It passes NULL instead.
  const snapshotsBefore = Number(count("snapshots"))
  asUser(adminId, `SELECT public.restore_snapshot('${snapshotId}');`)
  check(
    "a restore prunes nothing — every earlier save state survives, plus the new pre-restore",
    Number(count("snapshots")) === snapshotsBefore + 1,
    `${snapshotsBefore} before, ${count("snapshots")} after`
  )
  check(
    "the oldest save state is still restorable after several restores",
    runSql(`SELECT count(*) FROM public.snapshots WHERE id = '${capSnapshot}';`) === "1"
  )

  // --- 8. Refusals that leave nothing behind -------------------------------
  console.log("\n  refusals")

  const beforeRefusal = stateChecksum()
  const snapshotsAtRefusal = count("snapshots")
  let missingRefused = false
  try {
    asUser(adminId, `SELECT public.restore_snapshot('00000000-0000-4000-8000-0000000000ff');`)
  } catch {
    missingRefused = true
  }
  check("restoring an id that doesn't exist is refused", missingRefused)
  check("...and left no pre-restore snapshot behind", count("snapshots") === snapshotsAtRefusal)
  check("...and changed nothing", stateChecksum() === beforeRefusal)

  // A payload missing a key predates the current take_snapshot() and would
  // restore to a subtly older shape. It must be refused BEFORE anything is
  // deleted — which is why the manifest pre-check runs before take_snapshot().
  // A CTE, not a bare `INSERT ... RETURNING`: under psql -At the latter prints
  // the row AND the "INSERT 0 1" command tag, and the second line ends up
  // inside the uuid.
  const truncated = runSql(`
    WITH ins AS (
      INSERT INTO public.snapshots (trigger, payload)
      VALUES ('manual', jsonb_build_object('tournaments', '[]'::jsonb))
      RETURNING id
    ) SELECT id FROM ins;`)
  let truncatedRefused = false
  try {
    asUser(adminId, `SELECT public.restore_snapshot('${truncated}');`)
  } catch (err) {
    truncatedRefused = /older version of take_snapshot/i.test((err as Error).message)
  }
  check("a save state missing a table is refused, by name", truncatedRefused)
  check("...and changed nothing", stateChecksum() === beforeRefusal)
  runSql(`DELETE FROM public.snapshots WHERE id = '${truncated}';`)

  // ── 8. what psql cannot see ────────────────────────────────────────────
  //
  // Asserted against the INSTALLED definition rather than the migration files,
  // for three reasons: 20260908000000 still contains the six WHERE-less
  // deletes and migrations are immutable, so a file lint would have to
  // allowlist the very file that caused the bug; supabase/dry-run/90-teardown
  // .sql carries a seventh (harmless, psql-only) one it would also trip over;
  // and prosrc after the migrations apply in order IS the truth, whichever
  // file is stale. It also covers every plpgsql/sql function in `public` for
  // free, without naming any of them.
  //
  // THE LIMIT, stated rather than glossed: this is a text property. It proves
  // no WHERE-less DML is installed. It does NOT prove pg-safeupdate accepts
  // these statements — that needs the extension, which is not in the Ubuntu
  // archive, so the behavioural version is filed as an issue, not built here.
  //
  // Comments are stripped before splitting, because the fixed function's own
  // comment quotes the bare statement that broke it.
  console.log("\n  what psql cannot see")

  const wherelessDml = runSql(`
    SELECT coalesce(string_agg(x.proname || ': ' || left(x.stmt, 80), ' | '), '')
    FROM (
      SELECT p.proname,
             btrim(regexp_replace(frag, '\\s+', ' ', 'g')) AS stmt
      FROM pg_proc p
      JOIN pg_language l ON l.oid = p.prolang
      JOIN pg_namespace n ON n.oid = p.pronamespace,
      LATERAL regexp_split_to_table(
        regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), ';'
      ) AS frag
      WHERE n.nspname = 'public'
        AND l.lanname IN ('plpgsql', 'sql')
        AND frag ~* '^\\s*(DELETE\\s+FROM|UPDATE)\\s'
        AND frag !~* '\\mWHERE\\M'
    ) x;`)
  check(
    "no plpgsql/sql function in public holds a WHERE-less DELETE or UPDATE",
    wherelessDml === "",
    wherelessDml === ""
      ? undefined
      : `${wherelessDml} — pg-safeupdate is preloaded on authenticator, so PostgREST refuses these`
  )

  // The other half of "the same transaction expressed twice": a DOCUMENTATION
  // invariant, not a runtime one. The WHERE is not load-bearing over psql — the
  // script connects as the owner, where safeupdate is not preloaded — but
  // 20260908000000 line 126 says the two must stay identical, which makes any
  // divergence a defect someone has to explain.
  const scriptSrc = readFileSync(
    new URL("./restore-snapshot.ts", import.meta.url),
    "utf-8"
  )
  const scriptDeletes = scriptSrc.match(/^DELETE FROM public\.\w+\s+WHERE true;$/gm) ?? []
  check(
    "scripts/restore-snapshot.ts still expresses the same six deletes",
    scriptDeletes.length === 6,
    `${scriptDeletes.length} of 6`
  )

  console.log(
    failures === 0
      ? "\nrestore_snapshot(): all checks passed — the console's restore is the script's transaction."
      : `\nrestore_snapshot(): ${failures} check(s) FAILED`
  )
  process.exit(failures === 0 ? 0 : 1)
}

main()
