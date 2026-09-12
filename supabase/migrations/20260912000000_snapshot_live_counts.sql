-- The save-state listing learns the difference between a row and a wager.
--
-- THE BUG, reported Sept 12 2026: remove five wagers, press Snapshot now, and
-- every number on /admin/snapshots is unchanged. Two causes, both in the
-- readout rather than the data:
--
--   1. "bets" and "picks" on that page are the MENU (public.bets,
--      public.bet_picks) — what Pat uploaded, not what anybody wagered. No
--      member action can move them. That one is a labelling problem and is
--      fixed in components/admin/snapshots-console.tsx.
--
--   2. The bet-placement count — the number Pat asked for by name, the big one
--      on the right — counts SOFT-DELETED wagers. Removing a wager stamps
--      deleted_at and leaves the row (20260717000001_bet_placements.sql: "No
--      DELETE policy: hard deletes are blocked for everyone"), take_snapshot()
--      captures those rows deliberately, and jsonb_array_length() then counts
--      them. So the headline was "wager rows ever created", which only ever
--      goes up. That is this file.
--
-- NOTHING ABOUT THE PAYLOAD OR THE RESTORE CHANGES HERE, and that is the
-- point. take_snapshot() still captures every row including the removed ones —
-- a removed wager is part of the state being saved, and restoring without it
-- would resurrect money the bettor had taken off the table. The restore was
-- never wrong. Only the reading of it was, so only the reader moves.
--
-- Two derived counts are added, alongside the five row counts rather than
-- instead of them: the row counts are what a restore is verified against, and
-- the live counts are what an admin is actually asking when they look.

-- A return-type change, so CREATE OR REPLACE cannot do it. The drop also
-- resets proacl, which is why the REVOKE/GRANT below is re-issued rather than
-- assumed — for a SECURITY DEFINER function that REVOKE is the entire
-- boundary, and supabase/expected-function-grants.txt is what asserts it.
DROP FUNCTION IF EXISTS public.snapshot_index(int);

CREATE FUNCTION public.snapshot_index(p_limit int DEFAULT 50)
RETURNS TABLE (
  id                      uuid,
  created_at              timestamptz,
  trigger                 text,
  bytes                   bigint,
  tournaments             int,
  tournament_participants int,
  bets                    int,
  bet_picks               int,
  bet_placements          int,
  live_placements         int,
  active_participants     int
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
    -- restore, which is the same call restore_snapshot() makes.
    jsonb_array_length(s.payload -> 'tournaments'),
    jsonb_array_length(s.payload -> 'tournament_participants'),
    jsonb_array_length(s.payload -> 'bets'),
    jsonb_array_length(s.payload -> 'bet_picks'),
    jsonb_array_length(s.payload -> 'bet_placements'),
    -- The two the bug was about. Derived from the same payload, never stored:
    -- a snapshot is a set of rows, and "how many of them are live" is a
    -- question asked of it, not a fact recorded in it.
    --
    -- The jsonb_typeof guard is not decoration. jsonb_array_elements() over a
    -- missing key yields zero rows, so without it a payload predating wagers
    -- would report a confident 0 here while the row count beside it reports
    -- NULL — the exact "no wagers" / "predates wagers" confusion the comment
    -- above exists to prevent, reintroduced one line below it.
    CASE WHEN jsonb_typeof(s.payload -> 'bet_placements') = 'array' THEN (
      SELECT count(*)::int
        FROM jsonb_array_elements(s.payload -> 'bet_placements') e
       WHERE e ->> 'deleted_at' IS NULL
    ) END,
    -- Same shape for the roster. Betting eligibility everywhere else in the
    -- app is "a row exists AND revoked_at IS NULL" (20260807000000), never
    -- bare row-existence, and the listing was the one place still counting the
    -- other way. ->> yields NULL both for an absent key and for a JSON null,
    -- and both mean "not revoked", so this is correct rather than lucky.
    CASE WHEN jsonb_typeof(s.payload -> 'tournament_participants') = 'array' THEN (
      SELECT count(*)::int
        FROM jsonb_array_elements(s.payload -> 'tournament_participants') e
       WHERE e ->> 'revoked_at' IS NULL
    ) END
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
  'The save-state listing for /admin/snapshots: id, created_at, trigger, payload size, the five row counts, and the two live counts (wagers with deleted_at IS NULL, participants with revoked_at IS NULL), newest first. Never returns payload — that is the whole reason it exists rather than a PostgREST select. Admin-gated internally (SECURITY DEFINER).';
