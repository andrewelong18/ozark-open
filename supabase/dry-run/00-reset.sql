-- ═══════════════════════════════════════════════════════════════════════════
-- Dry run · step 0 — reset the tournament to "opening night"
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Run this FIRST, before 10-accounts.sql. It rewinds the tournament to the
-- state it is in the evening before Phase 1 opens:
--
--   · no wagers placed by anyone
--   · every bet hidden (so Act 3's spreadsheet upload is a real "menu goes
--     live" moment rather than a no-op)
--   · every pick's result back to 'pending' (nothing has been played yet)
--   · tournaments.status = 'active' so the dashboard's "Betting Open" badge
--     lights up — note this flag does NOT gate placement; bets.status does
--
-- WHY A RESET IS NEEDED AT ALL: production currently holds the sample menu
-- with every Phase 1 result already filled in (hit/miss/push), plus a dozen
-- leftover test placements. Starting there would mean opening a menu whose
-- outcomes are already decided, and a pari-mutuel pool polluted by old rows.
--
-- SAFETY: this only ever touches the 2026 tournament's own rows. It never
-- deletes a user, never drops a table, and never touches auth.*. It is
-- destructive to PLACEMENTS — take the snapshot in the gameplan's Part 0
-- first if you want the old rows back.
--
-- Idempotent: run it as many times as you like.

BEGIN;

DO $$
DECLARE
  t_id uuid;
  n_placements int;
  n_picks int;
  n_bets int;
BEGIN
  SELECT id INTO t_id FROM public.tournaments WHERE year = 2026;
  IF t_id IS NULL THEN
    RAISE EXCEPTION 'No 2026 tournament row — run the migrations first.';
  END IF;

  -- 1. Wipe every wager, including the soft-deleted ones. A dry run wants a
  --    virgin pool; leaving deleted_at rows behind would also make the
  --    "remove then re-place revives the same row" test in Act 4 ambiguous.
  DELETE FROM public.bet_placements p
  USING public.bet_picks pk, public.bets b
  WHERE p.pick_id = pk.id AND pk.bet_id = b.id AND b.tournament_id = t_id;
  GET DIAGNOSTICS n_placements = ROW_COUNT;

  -- 2. Nothing has been played yet.
  UPDATE public.bet_picks pk SET result = 'pending'
  FROM public.bets b
  WHERE pk.bet_id = b.id AND b.tournament_id = t_id AND pk.result <> 'pending';
  GET DIAGNOSTICS n_picks = ROW_COUNT;

  -- 3. The whole menu goes back behind the curtain. Act 3's upload is what
  --    opens Phase 1 — that is the test.
  UPDATE public.bets SET status = 'hidden'
  WHERE tournament_id = t_id AND status <> 'hidden';
  GET DIAGNOSTICS n_bets = ROW_COUNT;

  -- 4. Light the "Betting Open" badge. There is no admin UI for this — it is
  --    Studio/SQL only, which is itself worth flagging to Pat (Act 10).
  UPDATE public.tournaments SET status = 'active' WHERE id = t_id;

  RAISE NOTICE 'Reset complete: % placements deleted, % picks back to pending, % bets hidden.',
    n_placements, n_picks, n_bets;
END $$;

COMMIT;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect: placements 0 · non_pending_picks 0 · visible_bets 0 · status active
SELECT
  (SELECT count(*) FROM public.bet_placements)                          AS placements,
  (SELECT count(*) FROM public.bet_picks WHERE result <> 'pending')     AS non_pending_picks,
  (SELECT count(*) FROM public.bets WHERE status <> 'hidden')           AS visible_bets,
  (SELECT status FROM public.tournaments WHERE year = 2026)             AS tournament_status;
