-- ═══════════════════════════════════════════════════════════════════════════
-- Dry run · step 9 — teardown
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Run this AFTER the session, once the issue log is written up. It removes
-- every simulated account and every wager anyone placed during the dry run,
-- leaving the three real accounts and the bet menu behind.
--
-- ── THE DOMAIN GUARD ───────────────────────────────────────────────────────
--
-- Deleting from auth.users is the single most destructive thing in this repo
-- — it cascades to public.users, tournament_participants and every placement
-- those users made. So the delete is fenced twice:
--
--   1. It matches ONLY '%@dryrun.ozark.test'. Real accounts are gmail.com and
--      the dev fixtures in supabase/seed-dev-accounts.sql are @ozark.test —
--      neither can match.
--   2. It refuses to run if that pattern would catch an admin, which is the
--      cheapest possible tripwire against a fat-fingered edit to the LIKE.
--
-- If you want to keep the dry run's data around to study, DON'T run this yet.
-- Nothing expires.

BEGIN;

DO $$
DECLARE
  n_users int;
  n_admins int;
BEGIN
  SELECT count(*) INTO n_admins
  FROM public.users
  WHERE email LIKE '%@dryrun.ozark.test' AND is_admin;

  IF n_admins > 0 THEN
    RAISE EXCEPTION
      'Refusing to run: % admin account(s) match the sim-account pattern. Check the LIKE clause before continuing.',
      n_admins;
  END IF;

  -- ORDER MATTERS. Neither bet_placements.user_id nor bet_picks.player_user_id
  -- cascades — that is deliberate (money rows keep their history, and deleting
  -- a person must never quietly rewrite the menu). So both references have to
  -- be released before the accounts can go, or the delete fails with a hard FK
  -- error. Every wager placed during the dry run is going anyway, so this
  -- clears them all — including soft-deleted rows, which a WHERE deleted_at IS
  -- NULL would leave behind to block the delete.
  DELETE FROM public.bet_placements;

  UPDATE public.bet_picks pk SET player_user_id = NULL
  FROM public.users u
  WHERE pk.player_user_id = u.id AND u.email LIKE '%@dryrun.ozark.test';

  DELETE FROM auth.users WHERE email LIKE '%@dryrun.ozark.test';
  GET DIAGNOSTICS n_users = ROW_COUNT;
  RAISE NOTICE 'Removed % simulated account(s) and everything they cascaded to.', n_users;
END $$;

-- Back to pre-tournament. Flip this to 'active' the week of the tournament
-- and 'completed' once final payouts are posted.
UPDATE public.tournaments SET status = 'upcoming' WHERE year = 2026;

COMMIT;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect: sim_accounts 0 · placements 0 · real_accounts 3 · status upcoming
SELECT
  (SELECT count(*) FROM public.users WHERE email LIKE '%@dryrun.ozark.test') AS sim_accounts,
  (SELECT count(*) FROM public.bet_placements)                                AS placements,
  (SELECT count(*) FROM public.users)                                         AS real_accounts,
  (SELECT status FROM public.tournaments WHERE year = 2026)                   AS tournament_status;

-- Optional: also clear the invite list Pat pasted in Act 2.
--   DELETE FROM public.tournament_invites;
--
-- Optional: release the remaining pick→player links (the real accounts', which
-- this file leaves in place) so the September import starts from a clean
-- match. Only needed if the real roster's display names have changed.
--   UPDATE public.bet_picks SET player_user_id = NULL;
