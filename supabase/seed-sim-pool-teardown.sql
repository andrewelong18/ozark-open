-- Teardown for supabase/seed-sim-pool.sql — removes the ~32 simulated members
-- and every wager they placed, and puts the menu back to a pre-simulation
-- state.
--
-- Double-fenced, the same way supabase/dry-run/90-teardown.sql is: it matches
-- only '%@sim.ozark.test' and refuses to run at all if that pattern would catch
-- an admin. A teardown that can delete a real account is a teardown nobody runs.

BEGIN;

DO $$
DECLARE
  admins int;
BEGIN
  SELECT count(*) INTO admins
    FROM public.users
   WHERE email LIKE '%@sim.ozark.test' AND is_admin;
  IF admins > 0 THEN
    RAISE EXCEPTION
      'Refusing to run: % admin account(s) match %@sim.ozark.test.', admins, '%';
  END IF;
END $$;

-- Order matters — neither bet_placements.user_id nor bet_picks.player_user_id
-- cascades from a deleted user.
DELETE FROM public.bet_placements
 WHERE user_id IN (SELECT id FROM public.users WHERE email LIKE '%@sim.ozark.test');

UPDATE public.bet_picks
   SET player_user_id = NULL
 WHERE player_user_id IN (SELECT id FROM public.users WHERE email LIKE '%@sim.ozark.test');

-- Cascades to public.users, auth.identities and tournament_participants.
DELETE FROM auth.users WHERE email LIKE '%@sim.ozark.test';

COMMIT;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect zeroes on both counts.
SELECT
  (SELECT count(*) FROM public.users WHERE email LIKE '%@sim.ozark.test') AS members_left,
  (SELECT count(*) FROM public.bet_placements pl
     JOIN public.users u ON u.id = pl.user_id
    WHERE u.email LIKE '%@sim.ozark.test')                                 AS wagers_left;
