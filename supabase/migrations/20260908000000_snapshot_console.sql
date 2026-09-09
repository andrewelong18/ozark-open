-- Sprint 27: the save-state console. A restore button, in the app.
--
-- THIS REVERSES A DECISION 20260813000000_snapshots.sql STATES IN CAPITALS.
-- That file's header says "No restore UI, no diffing, no partial rollback, no
-- undo stack", and it was right: restore was a developer's tool, reached from a
-- laptop with psql on it. It stopped being right when Sprint 23 settled that
-- PAT RUNS THE TOURNAMENT WITHOUT DATABASE ACCESS — which left the tool for the
-- most likely weekend disaster (uploading last week's sheet, fat-fingering a
-- cell at 10pm) as the one thing he cannot reach. PRD §12 A21 records the
-- reversal; the header of the older migration is amended in the same commit
-- series, because a comment that contradicts shipped behaviour is drift.
--
-- What is NOT reversed: no diffing, no partial rollback, no undo stack. Boring
-- stays boring. This adds exactly two functions and one CHECK value.
--
-- scripts/restore-snapshot.ts is NOT retired. It is the path that still works
-- when the app itself is down, which is one of the two disasters this whole
-- system exists for (docs/DATA_SAFETY.md).

-- ---------------------------------------------------------------------------
-- 1. 'pre-restore' becomes a legal trigger
-- ---------------------------------------------------------------------------
--
-- The undo button gets its own undo: restore_snapshot() takes one of these
-- before it touches a row. It is a distinct value rather than reusing 'manual'
-- so the console can say, at a glance, which rows are the ones you reach for
-- when a restore itself was the mistake.

ALTER TABLE public.snapshots DROP CONSTRAINT IF EXISTS snapshots_trigger_check;
ALTER TABLE public.snapshots ADD CONSTRAINT snapshots_trigger_check
  CHECK (trigger IN ('cron', 'manual', 'pre-import', 'pre-restore'));

COMMENT ON TABLE public.snapshots IS
  'Point-in-time dumps of the money tables (Sprint 11). payload is a jsonb object keyed by table name, each an array of whole rows including soft-deleted ones. Restore from /admin/snapshots (Sprint 27), or with scripts/restore-snapshot.ts when the app itself is down.';

-- ---------------------------------------------------------------------------
-- 2. The listing
-- ---------------------------------------------------------------------------
--
-- AN RPC RATHER THAN A POSTGREST SELECT, for two reasons that are not
-- stylistic:
--
--   * jsonb_array_length cannot be expressed in a PostgREST `select`, and the
--     bet-placement count is the number Pat asked for by name.
--   * payload is hundreds of KB per row. Counting client-side would mean
--     selecting it — shipping megabytes to a phone to render five integers.
--
-- So THE LISTING MUST NEVER SELECT payload, and this function is what makes
-- that possible. scripts/snapshot-restore-roundtrip.ts asserts the result
-- signature carries no payload column, so the property is checked rather than
-- merely intended.
--
-- SECURITY DEFINER and the internal gate for the same reasons take_snapshot()
-- has them (see that migration's long comment): definer rights make the counts
-- true by construction rather than dependent on the shape of a dozen SELECT
-- policies, and the gate is INSIDE the function because SECURITY DEFINER
-- bypasses the RLS policy on the table. The gate is
-- "auth.uid() IS NOT NULL AND NOT is_admin()" rather than a bare
-- "NOT is_admin()" so a JWT-less direct connection (psql, Studio, a migration)
-- still gets through by design; the REVOKE below is what keeps `anon` out,
-- because an anonymous web caller also has a null auth.uid().
CREATE OR REPLACE FUNCTION public.snapshot_index(p_limit int DEFAULT 50)
RETURNS TABLE (
  id                      uuid,
  created_at              timestamptz,
  trigger                 text,
  bytes                   bigint,
  tournaments             int,
  tournament_participants int,
  bets                    int,
  bet_picks               int,
  bet_placements          int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
-- Every OUT parameter above shares a name with a table or a column below, and
-- plpgsql resolves a bare identifier to the variable. Qualifying through the
-- `s` alias is what disambiguates it; this pragma is the belt to that braces,
-- so a future column rename can't silently turn a count into a variable read.
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admins only.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.created_at,
    s.trigger,
    pg_column_size(s.payload)::bigint,
    -- NULL, not 0, when a key is missing: a payload written by an older
    -- take_snapshot() cannot be restored safely, and the console needs to tell
    -- "this snapshot holds no bets" apart from "this snapshot predates bets
    -- being captured". It renders the second as an em dash and refuses the
    -- restore, which is the same call restore_snapshot() makes below.
    jsonb_array_length(s.payload -> 'tournaments'),
    jsonb_array_length(s.payload -> 'tournament_participants'),
    jsonb_array_length(s.payload -> 'bets'),
    jsonb_array_length(s.payload -> 'bet_picks'),
    jsonb_array_length(s.payload -> 'bet_placements')
  FROM public.snapshots s
  -- Newest first is the only order this is ever read in, and the index
  -- snapshots_created_at_idx already serves it.
  ORDER BY s.created_at DESC, s.id DESC
  LIMIT greatest(coalesce(p_limit, 50), 1);
END;
$$;

REVOKE ALL ON FUNCTION public.snapshot_index(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.snapshot_index(int) TO authenticated;

COMMENT ON FUNCTION public.snapshot_index(int) IS
  'The save-state listing for /admin/snapshots: id, created_at, trigger, payload size and the five row counts, newest first. Never returns payload — that is the whole reason it exists rather than a PostgREST select. Admin-gated internally (SECURITY DEFINER).';

-- ---------------------------------------------------------------------------
-- 3. The restore
-- ---------------------------------------------------------------------------
--
-- A FAITHFUL PORT of scripts/restore-snapshot.ts's restoreSql block. That
-- script is not retired and this is not a redesign: every line below has a
-- reason, and most of them were learned from a bug. Read that file's
-- "the restore, in one transaction" comment alongside this one — they are the
-- same transaction expressed twice, and they must stay that way.
--
-- ATOMICITY. A plpgsql body is one implicit transaction, so this is atomic the
-- way the script's explicit BEGIN/COMMIT is. A restore that half-applied would
-- leave the money data in a state that never existed, which is worse than
-- either endpoint. Nothing below needs its own error handling to get that;
-- an exception anywhere rolls the whole thing back, the pre-restore snapshot
-- included.
--
-- ORDER MATTERS AND IS NOT ARBITRARY:
--   read payload  -> so no later prune can affect a restore in flight
--   pre-checks    -> refuse before anything is destroyed, never halfway
--   pre-restore   -> the undo button's own undo
--   guard down    -> the entry-fee trigger stands aside for a replay
--   stash invites -> they cascade off tournaments and are NOT in the payload
--   delete/insert -> children first down, parents first up
--
-- The first destructive control in this app is the button that calls this. The
-- ceremony around it (a typed word, a panel naming what is discarded) lives in
-- components/admin/snapshots-console.tsx; the safety that does not depend on a
-- human reading carefully lives here.
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
  DELETE FROM public.bet_placements;
  DELETE FROM public.bet_picks;
  DELETE FROM public.bets;
  DELETE FROM public.tournament_participants;
  DELETE FROM public.tournament_invites;
  DELETE FROM public.tournaments;

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

REVOKE ALL ON FUNCTION public.restore_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_snapshot(uuid) TO authenticated;

COMMENT ON FUNCTION public.restore_snapshot(uuid) IS
  'Roll the five money tables back to a save state, in one transaction (Sprint 27). Takes a pre-restore snapshot first, stands down the entry-fee guard, and preserves tournament_invites, which cascades off tournaments and is not in the payload. A SECURITY DEFINER port of scripts/restore-snapshot.ts, which stays as the path that works when the app is down. Returns a manifest naming the pre-restore snapshot. Admin-gated internally.';
