-- Sprint 27 defect fix — the restore button, which was dead in production.
--
-- SYMPTOM. An admin pressed "Restore this" on /admin/snapshots and got back
--
--     The restore did not happen: DELETE requires a WHERE clause
--
-- Nothing was lost: a plpgsql body is one implicit transaction, so the whole
-- restore rolled back, its own pre-restore save state included. But the undo
-- button did not work, which is the one thing it exists for.
--
-- CAUSE. restore_snapshot() clears the five money tables with six UNQUALIFIED
-- deletes (migration 20260908000000, lines 277-283). Supabase preloads the
-- pg-safeupdate extension on the `authenticator` LOGIN role — the role
-- PostgREST connects as — via session_preload_libraries. That extension
-- installs post_parse_analyze_hook and raises exactly the sentence above
-- whenever a CMD_DELETE or CMD_UPDATE arrives with query->jointree->quals set
-- to NULL. Three properties of that hook decide this fix:
--
--   * It is a PARSE-TREE check. It runs on the Query straight out of
--     transformStmt(), before the rewriter and before the planner's
--     eval_const_expressions(). So ANY syntactic WHERE satisfies it.
--   * It fires for statements INSIDE plpgsql (_SPI_prepare_plan ->
--     parse_analyze) and is NOT bypassed by SECURITY DEFINER. Definer rights
--     change the privilege context, not which libraries the session loaded.
--   * Its safeupdate.enabled GUC is PGC_SUSET, and Supabase's `postgres` is
--     not a superuser, so the function cannot switch it off for itself.
--
-- WHY NOTHING CAUGHT IT. scripts/restore-snapshot.ts runs the identical SQL
-- over psql as the database owner, where the library is not preloaded; and
-- scripts/snapshot-restore-roundtrip.ts — the 30-check harness written for
-- this exact RPC — also drives psql, imitating the role with
-- `SET ROLE authenticated`. session_preload_libraries resolves at CONNECT time
-- for the LOGIN role, so SET ROLE never loads it. Every check in this repo was
-- structurally incapable of seeing this. That blindness is now itself asserted
-- (hazard 8 in that harness), which is the durable half of this fix.
--
-- take_snapshot() was never affected: its one DELETE carries
-- `WHERE id IN (...)` (migration 20260813000000, line 154). That asymmetry is
-- why "Snapshot now" worked while restore did not.
--
-- WHAT CHANGES. Six `WHERE true`, and nothing else. The body below is
-- otherwise byte-identical to 20260908000000's.
--
-- THREE ALTERNATIVES REJECTED, so the next person does not re-litigate them:
--
--   WHERE id IS NOT NULL — buys no extra margin (the planner folds that qual
--     and `true` alike, one stage AFTER the hook has already passed) and it
--     names a column, breaking the "NO COLUMN IS NAMED ANYWHERE" property that
--     PRD §12 A21 cites as one of the three things making this a faithful port.
--
--   TRUNCATE — dodges the hook entirely (it is a utility statement), but
--     tournament_invites has a foreign key to tournaments, so truncating the
--     set requires CASCADE: precisely the hazard the invite stash below was
--     written to prevent (see scripts/restore-snapshot.ts, lines 204-212). It
--     would also escalate to ACCESS EXCLUSIVE against live /bets readers.
--
--   Turning safeupdate off — role-wide, or per-function with
--     `ALTER FUNCTION ... SET safeupdate.enabled = off` — strips the guardrail
--     from PostgREST writes (role-wide) or puts the one function that empties
--     all five money tables outside it (per-function), most likely fails
--     anyway on the PGC_SUSET check, and would be a security-posture decision
--     needing a PRD §12 A-number. `WHERE true` needs none, which is why this
--     migration adds no decision entry: nothing was decided or reversed here.
--     A21 already describes the intended design correctly. This was a defect
--     in its implementation.

CREATE OR REPLACE FUNCTION public.restore_snapshot(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Same set and same order as take_snapshot()'s payload. Insert order is
  -- this; delete order is its reverse.
  c_tables  constant text[] := ARRAY[
    'tournaments', 'tournament_participants', 'bets', 'bet_picks', 'bet_placements'
  ];
  v_payload  jsonb;
  v_created  timestamptz;
  v_trigger  text;
  v_invites  jsonb;
  v_pre      uuid;
  v_expected jsonb;
  v_counts   jsonb;
  v_invites_back int;
  v_table    text;
  v_fk       record;
  v_orphans  bigint;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admins only.' USING ERRCODE = '42501';
  END IF;

  -- Read the payload into a variable BEFORE anything else. This is what makes
  -- the retention prune structurally unable to interfere: take_snapshot()
  -- deletes past its keep, and while the call below passes NULL so it prunes
  -- nothing, a payload already in a local cannot be affected by any future
  -- change to that policy either. Belt and braces, on the one operation where
  -- being wrong is unrecoverable.
  SELECT s.payload, s.created_at, s.trigger
    INTO v_payload, v_created, v_trigger
    FROM public.snapshots s
   WHERE s.id = p_id;

  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'No save state with id %.', p_id;
  END IF;

  -- Manifest pre-check. A payload written by an older take_snapshot() would
  -- restore to a subtly older shape — the exact failure that makes
  -- db-export.sh carry an information_schema guard.
  FOREACH v_table IN ARRAY c_tables LOOP
    IF jsonb_typeof(v_payload -> v_table) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION
        'This save state has no ''%'' in it — it was written by an older version of take_snapshot() and cannot be restored safely.',
        v_table;
    END IF;
  END LOOP;

  -- Orphan-account pre-check (Sprint 27). public.users is NOT in the payload
  -- and several of these tables carry a foreign key to it, so a snapshot taken
  -- before an account was deleted cannot be restored. That is correct
  -- behaviour — the transaction would roll back cleanly either way — but the
  -- raw error is a foreign-key violation from deep inside a transaction, and
  -- the person reading it is an admin on a phone. So find it first and say it
  -- in a sentence.
  --
  -- Derived from pg_constraint rather than a list of columns, deliberately:
  -- naming user_id and placed_by_user_id here would be the one place this
  -- function knows a column name, and a migration that added a third such
  -- column would silently fall outside the check. Single-column keys only,
  -- which is all of them and all there is any reason to expect.
  FOR v_fk IN
    SELECT cl.relname AS tbl, a.attname AS col
      FROM pg_constraint c
      JOIN pg_class cl     ON cl.oid = c.conrelid
      JOIN pg_attribute a  ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f'
       AND c.confrelid = 'public.users'::regclass
       AND cl.relnamespace = 'public'::regnamespace
       AND array_length(c.conkey, 1) = 1
       AND cl.relname = ANY (c_tables)
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM jsonb_populate_recordset(null::public.%I, $1 -> %L) x'
      ' LEFT JOIN public.users u ON u.id = x.%I'
      ' WHERE x.%I IS NOT NULL AND u.id IS NULL',
      v_fk.tbl, v_fk.tbl, v_fk.col, v_fk.col
    ) INTO v_orphans USING v_payload;

    IF v_orphans > 0 THEN
      RAISE EXCEPTION
        'This save state holds % row(s) in % belonging to an account that no longer exists, so it cannot be restored. Accounts are not part of a save state (docs/DATA_SAFETY.md). Nothing was changed.',
        v_orphans, v_fk.tbl;
    END IF;
  END LOOP;

  -- What the payload claims to hold, read before the restore so the manifest
  -- can be compared against the tables afterwards. The script's idea: a
  -- restore nobody checked is a command, not a restore.
  SELECT jsonb_object_agg(t, jsonb_array_length(v_payload -> t))
    INTO v_expected
    FROM unnest(c_tables) AS t;

  -- The undo button's own undo, inside this transaction. If anything below
  -- fails, this rolls back with everything else and no stray snapshot is left
  -- behind; if it succeeds, the row survives, because public.snapshots is not
  -- one of the five tables.
  --
  -- NULL KEEP: A RESTORE NEVER PRUNES. take_snapshot() already treats a null
  -- keep as "don't delete anything", and using that is better than passing a
  -- number generous enough to probably not evict the snapshot being restored.
  -- Retention still applies on the next cron or pre-import snapshot.
  v_pre := public.take_snapshot('pre-restore', NULL);

  -- Stand the entry-fee guard down for the restore (migration 20260902000001).
  -- A restore reproduces a state that already existed; re-litigating whether it
  -- was reachable is not its job. A snapshot taken before that trigger shipped
  -- can hold an over-cap row from the very race the trigger now prevents, and a
  -- guard that refused to put it back would break the undo button on exactly
  -- the disaster it was built for. is_local = true, so it lasts one
  -- transaction and no longer.
  PERFORM set_config('ozark.restoring', 'on', true);

  -- Not part of the payload, and would be cascaded away by the DELETE below.
  -- tournament_invites has ON DELETE CASCADE to tournaments and carries the
  -- expected roster, typed in by hand — the thing Sprint 11's plan didn't
  -- anticipate. Stashed as jsonb rather than in a temp table because that is
  -- the payload's own idiom, it needs no pg_temp qualification under
  -- search_path = '', and it cannot collide with a cached plan across two
  -- calls in one session.
  SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    INTO v_invites
    FROM public.tournament_invites t;

  -- Children first, so no foreign key is violated on the way down.
  --
  -- WHERE true IS LOAD-BEARING — see this migration's header. pg-safeupdate is
  -- preloaded on the `authenticator` role PostgREST connects as, and refuses
  -- any DELETE whose jointree carries no quals, inside a SECURITY DEFINER
  -- plpgsql body as readily as at top level. A bare
  -- `DELETE FROM public.bet_placements;` is what answered "DELETE requires a
  -- WHERE clause" when an admin pressed the button (Sept 11, 2026). The check
  -- is on the parse tree, so `WHERE true` satisfies it; the planner folds it
  -- away, so it costs nothing and still means every row; and it names no
  -- column, which `WHERE id IS NOT NULL` would.
  --
  -- Do not tidy these away. scripts/snapshot-restore-roundtrip.ts reads the
  -- INSTALLED prosrc and goes red if any plpgsql function in `public` carries
  -- a WHERE-less DELETE or UPDATE again.
  DELETE FROM public.bet_placements          WHERE true;
  DELETE FROM public.bet_picks               WHERE true;
  DELETE FROM public.bets                    WHERE true;
  DELETE FROM public.tournament_participants WHERE true;
  DELETE FROM public.tournament_invites      WHERE true;
  DELETE FROM public.tournaments             WHERE true;

  -- Parents first on the way back up. jsonb_populate_recordset does the column
  -- mapping, so NO COLUMN IS NAMED ANYWHERE in this block. A migration that
  -- adds one is carried through automatically — the same property that makes
  -- take_snapshot() use to_jsonb(), and the reason neither end of this round
  -- trip can quietly go stale.
  INSERT INTO public.tournaments
  SELECT * FROM jsonb_populate_recordset(null::public.tournaments, v_payload -> 'tournaments');

  INSERT INTO public.tournament_participants
  SELECT * FROM jsonb_populate_recordset(null::public.tournament_participants, v_payload -> 'tournament_participants');

  INSERT INTO public.bets
  SELECT * FROM jsonb_populate_recordset(null::public.bets, v_payload -> 'bets');

  INSERT INTO public.bet_picks
  SELECT * FROM jsonb_populate_recordset(null::public.bet_picks, v_payload -> 'bet_picks');

  INSERT INTO public.bet_placements
  SELECT * FROM jsonb_populate_recordset(null::public.bet_placements, v_payload -> 'bet_placements');

  -- The invites come back for every tournament that survived the restore.
  -- Invites belonging to a tournament the snapshot doesn't have are correctly
  -- gone: so is the tournament.
  INSERT INTO public.tournament_invites
  SELECT i.* FROM jsonb_populate_recordset(null::public.tournament_invites, v_invites) i
   WHERE i.tournament_id IN (SELECT t.id FROM public.tournaments t);
  GET DIAGNOSTICS v_invites_back = ROW_COUNT;

  -- Leave the guard as we found it. SET LOCAL would expire at commit anyway;
  -- doing it explicitly means a caller that wraps this in a larger transaction
  -- doesn't silently inherit a disarmed entry-fee cap.
  PERFORM set_config('ozark.restoring', 'off', true);

  SELECT jsonb_object_agg(x.t, x.n) INTO v_counts FROM (
    SELECT 'tournaments'             AS t, count(*) AS n FROM public.tournaments
    UNION ALL SELECT 'tournament_participants', count(*) FROM public.tournament_participants
    UNION ALL SELECT 'bets',                    count(*) FROM public.bets
    UNION ALL SELECT 'bet_picks',               count(*) FROM public.bet_picks
    UNION ALL SELECT 'bet_placements',          count(*) FROM public.bet_placements
  ) x;

  -- The manifest, so the console can report numbers that prove the restore did
  -- what it said. A restore that silently restored nothing is exactly as
  -- dangerous as an export that silently captured nothing.
  RETURN jsonb_build_object(
    'restored_from',        p_id,
    'taken_at',             v_created,
    'trigger',              v_trigger,
    'pre_restore_snapshot', v_pre,
    'expected',             v_expected,
    'counts',               v_counts,
    'invites_restored',     v_invites_back
  );
END;
$$;

-- Redundant after CREATE OR REPLACE, which keeps the pg_proc row, its oid, its
-- proacl and its COMMENT — supabase/expected-function-grants.txt therefore does
-- NOT need regenerating, and the policy-manifest step staying green is the
-- proof. Re-stated anyway: if this file is ever applied on its own to a
-- database where the function does not exist, the replace becomes a create and
-- proacl defaults to the built-in EXECUTE TO PUBLIC — anon able to empty all
-- five money tables. Two idempotent lines against that operator error.
REVOKE ALL ON FUNCTION public.restore_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_snapshot(uuid) TO authenticated;

-- BOTH SNAPSHOT FUNCTIONS MUST STAY VOLATILE (the default, by omission).
-- Not asserted anywhere, and deliberately so: Postgres itself refuses
-- "DELETE is not allowed in a non-volatile function", on a direct psql
-- connection exactly as over PostgREST, so the restore round trip catches a
-- volatility marker on its very first restore. Unlike the WHERE clause above,
-- this one needs no extra guard — which was worth establishing by sabotage
-- rather than assuming either way.
