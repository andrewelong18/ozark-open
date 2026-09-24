-- Pick → golfer link REPAIR (Sept 24, 2026) — WRITES. One transaction.
--
-- Run docs/admin/pick-links-check.sql first; run this only if it lists rows.
-- Paste the WHOLE file into the Supabase SQL editor (it runs as postgres, so
-- RLS and the users self-update guard don't apply). Any failed check below
-- raises, and the whole transaction rolls back — nothing half-applied.
--
-- WHAT IT DOES
--   1. Takes a save state (it appears on /admin/snapshots as "manual"), so
--      the restore button there undoes all of this.
--   2. Renames three accounts whose display names never matched the sheet or
--      the roster profile seed. This is the same write /admin/people makes
--      (#99), and it fires the same users_seed_player_profile trigger, which
--      is what puts them on /roster. Each rename is guarded by the old name,
--      so re-running the file is a no-op for them.
--   3. Relinks every pick to the account its label names — label minus the
--      stroke suffix (same regex as lib/pick-label.ts), matched against
--      display_name, case-insensitively — or to NULL when no account has that
--      name. Only rows that change are written.
--   4. Asserts nothing is left pointing at the wrong person, then commits.
--
-- WHAT IT DOES NOT DO
--   * It never touches bet_placements. The money path reads the live fact
--     (placement_payouts_view.is_self_pick joins the pick's player_user_id at
--     read time), so correcting the pick corrects every wager on it.
--     requires_admin_review is a write-time snapshot by design and is left as
--     written; /admin/view shows the live is_self_pick beside it.
--   * It doesn't decide anything about wagers the old links let through.
--     Those are an admin's call (Pat), made on /bets?for=<member>.
--
-- CAVEAT — it treats the name on the label as the truth. A deliberate
-- hand-link on a pick whose name matches no account would be cleared. On
-- Sept 24, 2026 there were none; fix a name mismatch by renaming the account
-- on /admin/people (as step 2 does) rather than hand-linking, and this stays
-- true.
--
-- WHY THIS EXISTS: see pick-links-check.sql. In short, the Sept 23 upload put
-- the real field into pick_ids the placeholder sheet had used for the early
-- accounts ("Pat Leicht (-5)" → "Dustin Scheller (E)"), the importer kept
-- the old link because Dustin had no account yet, and ~20 golfers signed up
-- after the upload that opened Phase 1, so their picks linked to nobody.

BEGIN;

-- 1. Save state first. auth.uid() is NULL in the SQL editor, which
--    take_snapshot() treats as a trusted caller. NULL keep = prune nothing.
SELECT public.take_snapshot('manual', NULL) AS snapshot_id;

-- 2. Account names → the names on the sheet and in player_profile_seed.
DO $$
DECLARE
  r record;
  n int;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('DonH',           'Don Harris'),
      ('Michael Yenzer', 'Mike Yenzer'),
      ('Steven Jones',   'Steve Jones')
    ) AS v(old_name, new_name)
  LOOP
    UPDATE public.users SET display_name = r.new_name
    WHERE display_name = r.old_name;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 1 THEN
      RAISE EXCEPTION 'Rename "%" matched % accounts — expected at most one.', r.old_name, n;
    END IF;
  END LOOP;
END $$;

-- 3a. A name two accounts share can't be matched safely; stop rather than guess.
DO $$
DECLARE
  dup text;
BEGIN
  SELECT lower(trim(u.display_name)) INTO dup
  FROM public.users u
  WHERE u.display_name IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.bet_picks pk
      WHERE lower(trim(regexp_replace(pk.label, '\s*\((E|[+-]?\d+)\)\s*$', '', 'i')))
            = lower(trim(u.display_name))
    )
  GROUP BY 1
  HAVING count(*) > 1
  LIMIT 1;
  IF dup IS NOT NULL THEN
    RAISE EXCEPTION 'Two accounts share the name "%" — fix that on /admin/people first.', dup;
  END IF;
END $$;

-- 3b. Relink every pick by name.
UPDATE public.bet_picks pk
SET player_user_id = m.user_id
FROM (
  SELECT p.id, u.id AS user_id
  FROM public.bet_picks p
  LEFT JOIN public.users u
    ON lower(trim(u.display_name))
     = lower(trim(regexp_replace(p.label, '\s*\((E|[+-]?\d+)\)\s*$', '', 'i')))
) m
WHERE m.id = pk.id
  AND pk.player_user_id IS DISTINCT FROM m.user_id;

-- 4. Nothing may still point at someone the label doesn't name.
DO $$
DECLARE
  bad int;
BEGIN
  SELECT count(*) INTO bad
  FROM public.bet_picks pk
  LEFT JOIN public.users u
    ON lower(trim(u.display_name))
     = lower(trim(regexp_replace(pk.label, '\s*\((E|[+-]?\d+)\)\s*$', '', 'i')))
  WHERE pk.player_user_id IS DISTINCT FROM u.id;
  IF bad > 0 THEN
    RAISE EXCEPTION '% picks still disagree with their label after the relink — rolled back.', bad;
  END IF;
END $$;

COMMIT;

-- Afterwards: run pick-links-check.sql again. Both counts should be zero.
