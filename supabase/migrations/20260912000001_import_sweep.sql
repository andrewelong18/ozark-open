-- Sprint 29: the import sweeps what the sheet no longer lists.
--
-- Pat, Sept 11, 2026: "anytime I upload a sheet it should delete all bets that
-- aren't in the sheet being uploaded. It can warn me that I am about to delete
-- some bets."
--
-- Until now the importer was purely additive: it upserts by the sheet's
-- bet_id/pick_id and had no concept of a row the sheet stopped mentioning, so a
-- bet dropped from the spreadsheet stayed on the menu forever with no path in
-- the app to remove it. A Phase 1 refresh on Sept 11 left 19 stale bets live and
-- clearing them needed database access.
--
-- WHY A FUNCTION RATHER THAN POLICIES AND THREE POSTGREST CALLS
--
--   1. Atomicity. PostgREST cannot span calls, so deleting placements, then
--      picks, then bets across three requests can half-apply — and the half that
--      lands first is the money.
--   2. There is deliberately NO DELETE POLICY on public.bet_placements: removals
--      through the app are soft (deleted_at). Adding a blanket admin DELETE
--      policy to the money table to serve one importer path would be a much
--      wider grant than the job needs, and a write that RLS filters to zero rows
--      comes back as success with error = null — the trap CLAUDE.md names.
--      SECURITY DEFINER plus the REVOKE at the bottom is the narrower boundary.
--
-- WHAT THIS REVERSES, DELIBERATELY (PRD §12 A24)
--
-- PRD §10 said placements are soft-deleted and never hard-deleted; PRD §8.2 said
-- uploads never touch placements. Both are amended rather than quietly broken.
-- The defence is that every import takes a `pre-import` snapshot first and
-- REFUSES to run if it can't (Sprint 11), and snapshots.payload carries
-- bet_placements in full — so the audit trail survives the delete and
-- restore_snapshot() puts the wagers back. And bet_placements.pick_id's missing
-- ON DELETE CASCADE was written to stop a delete happening AS A SIDE EFFECT
-- (20260717000001_bet_placements.sql); this one is a named admin act, confirmed
-- on its own control, which is the distinction that comment was drawing.
--
-- p_clear_wagers is the whole of that difference. Left false — the default, and
-- what the confirm panel sends unless Pat says otherwise — this function will
-- not delete a placement, and refuses the whole sweep rather than let the FK
-- surface a raw constraint name at an admin on a phone.

CREATE OR REPLACE FUNCTION public.sweep_bets(
  p_bet_ids      uuid[],
  p_pick_ids     uuid[],
  p_clear_wagers boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_bets         uuid[] := COALESCE(p_bet_ids, '{}');
  v_picks        uuid[] := COALESCE(p_pick_ids, '{}');
  v_targets      uuid[];
  v_blocked      text;
  v_placements   int := 0;
  v_picks_gone   int := 0;
  v_bets_gone    int := 0;
BEGIN
  -- Same gate as take_snapshot()/restore_snapshot(): a null auth.uid() is a
  -- direct database connection (psql, a migration, the round-trip harness),
  -- already trusted with more than this. The REVOKE below is what keeps `anon`
  -- out — it can't execute the function at all, so it never reaches here.
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admins only.' USING ERRCODE = '42501';
  END IF;

  IF cardinality(v_bets) = 0 AND cardinality(v_picks) = 0 THEN
    RETURN jsonb_build_object('bets', 0, 'picks', 0, 'placements', 0);
  END IF;

  -- Never sweep a settled tournament. The route already refuses to import into
  -- one (it reads tournaments filtered to upcoming/active), but a sweep rewrites
  -- results the payouts were already split from, so the refusal is repeated here
  -- where it cannot be bypassed by a different caller.
  IF EXISTS (
    SELECT 1
      FROM public.bets b
      JOIN public.tournaments t ON t.id = b.tournament_id
     WHERE t.status = 'completed'
       AND (b.id = ANY(v_bets)
            OR b.id IN (SELECT bet_id FROM public.bet_picks WHERE id = ANY(v_picks)))
  ) THEN
    RAISE EXCEPTION
      'This tournament is finalized. Unpost the leaderboard before changing the menu.'
      USING ERRCODE = '42501';
  END IF;

  -- Every pick that is about to disappear: the ones named directly, plus every
  -- pick of a bet named directly (they go by ON DELETE CASCADE).
  SELECT array_agg(id) INTO v_targets FROM (
    SELECT unnest(v_picks) AS id
    UNION
    SELECT id FROM public.bet_picks WHERE bet_id = ANY(v_bets)
  ) x;
  v_targets := COALESCE(v_targets, '{}');

  IF NOT p_clear_wagers THEN
    -- deleted_at is a column, not a row removal, so a soft-deleted wager still
    -- holds the foreign key. Name what is in the way, in words, rather than
    -- letting a 23503 and a constraint name reach the admin.
    SELECT string_agg(DISTINCT format('%s ("%s")', b.sheet_bet_id, b.title), ', ')
      INTO v_blocked
      FROM public.bet_placements pl
      JOIN public.bet_picks pk ON pk.id = pl.pick_id
      JOIN public.bets b       ON b.id = pk.bet_id
     WHERE pl.pick_id = ANY(v_targets);

    IF v_blocked IS NOT NULL THEN
      RAISE EXCEPTION
        'Nothing was deleted: bet_id % still carries wagers. Clear them explicitly, or leave those rows in place.',
        v_blocked
        USING ERRCODE = '23503';
    END IF;
  ELSE
    WITH gone AS (
      DELETE FROM public.bet_placements WHERE pick_id = ANY(v_targets) RETURNING 1
    )
    SELECT count(*) INTO v_placements FROM gone;
  END IF;

  -- Picks named on their own (a player dropped from a surviving bet's slate).
  WITH gone AS (
    DELETE FROM public.bet_picks WHERE id = ANY(v_picks) RETURNING 1
  )
  SELECT count(*) INTO v_picks_gone FROM gone;

  -- Whole bets; their remaining picks follow by ON DELETE CASCADE.
  WITH gone AS (
    DELETE FROM public.bets WHERE id = ANY(v_bets) RETURNING 1
  )
  SELECT count(*) INTO v_bets_gone FROM gone;

  RETURN jsonb_build_object(
    'bets', v_bets_gone,
    'picks', v_picks_gone,
    'placements', v_placements
  );
END;
$$;

COMMENT ON FUNCTION public.sweep_bets(uuid[], uuid[], boolean) IS
  'Sprint 29: delete bets/picks the uploaded sheet no longer lists. Called by /api/admin/import after its upserts, behind a confirmation. p_clear_wagers=false refuses rather than touching a placement; true hard-deletes them (PRD §12 A24 — the pre-import snapshot is the audit trail).';

-- For a SECURITY DEFINER function the REVOKE is the entire boundary (#205).
REVOKE ALL ON FUNCTION public.sweep_bets(uuid[], uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sweep_bets(uuid[], uuid[], boolean) TO authenticated;
