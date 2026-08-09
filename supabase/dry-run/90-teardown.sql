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
  n_real_wagers int;
BEGIN
  SELECT count(*) INTO n_admins
  FROM public.users
  WHERE email LIKE '%@dryrun.ozark.test' AND is_admin;

  IF n_admins > 0 THEN
    RAISE EXCEPTION
      'Refusing to run: % admin account(s) match the sim-account pattern. Check the LIKE clause before continuing.',
      n_admins;
  END IF;

  -- ── THE REAL-WAGER GUARD ────────────────────────────────────────────────
  --
  -- The DELETE below is unconditioned, and that is only safe when every wager
  -- in the table belongs to the dry run. On Jul 31 that held, because
  -- 00-reset.sql had just cleared the table. It does NOT hold in general.
  --
  -- Found on Aug 9, 2026: production carried two real wagers of Pat's ($5 and
  -- $7, placed through the app) against a menu with 13 bets open. Running this
  -- file as written would have deleted both — silently, since a DELETE of rows
  -- nobody remembers placing looks exactly like success — and then hidden all
  -- 13 open bets. The wagers are money; deleting them is not recoverable from
  -- anything but a snapshot.
  --
  -- So: refuse unless every wager is a simulated one. Clearing the decks is
  -- 00-reset.sql's job, and doing it deliberately is the point.
  SELECT count(*) INTO n_real_wagers
  FROM public.bet_placements p
  JOIN public.users u ON u.id = p.user_id
  WHERE u.email NOT LIKE '%@dryrun.ozark.test';

  IF n_real_wagers > 0 THEN
    RAISE EXCEPTION
      'Refusing to run: % wager(s) belong to real accounts and this file deletes every row in bet_placements. Take a snapshot, then clear them deliberately with 00-reset.sql if that is what you want.',
      n_real_wagers;
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

-- ── PUT THE MENU BACK BEHIND THE CURTAIN ──────────────────────────────────
--
-- Deleting the wagers is not enough on its own. The dry run walks the book all
-- the way to "closed and settled", so without this the menu is left with every
-- bet closed and every pick carrying a verdict — including the two voids the
-- session injects, which never existed in the real data. Anyone logging in
-- afterwards sees a fully revealed, settled book with nobody's money on it.
--
-- This mirrors steps 2 and 3 of 00-reset.sql, so teardown returns the menu to
-- the same "opening night" shape the dry run starts from. The menu STRUCTURE
-- survives — bets, picks, labels and odds are untouched — because it is the
-- sample book Pat's September upload will overwrite anyway.
--
-- Note this cannot restore whatever results production held *before* the dry
-- run; 00-reset.sql already discarded those. Pre-run state lives only in the
-- Part 0 snapshot, which is why taking it is a P0 step.
UPDATE public.bet_picks pk SET result = 'pending'
  FROM public.bets b
 WHERE pk.bet_id = b.id AND pk.result <> 'pending';

-- Note this hides EVERY visible bet, not just ones the dry run opened. That is
-- correct after a dry run (which starts from an all-hidden menu) and wrong at
-- any other time — mid-tournament it would pull a live book off the screen.
-- The real-wager guard at the top is what keeps the two situations apart: if
-- anyone has money on the board, this file refuses to run at all.
UPDATE public.bets SET status = 'hidden' WHERE status <> 'hidden';

-- Back to pre-tournament. Flip this to 'active' the week of the tournament
-- and 'completed' once final payouts are posted.
UPDATE public.tournaments SET status = 'upcoming' WHERE year = 2026;

COMMIT;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect: sim_accounts 0 · placements 0 · real_accounts 3 · status upcoming
--         · visible_bets 0 · settled_picks 0  (the menu itself survives intact)
SELECT
  (SELECT count(*) FROM public.users WHERE email LIKE '%@dryrun.ozark.test') AS sim_accounts,
  (SELECT count(*) FROM public.bet_placements)                                AS placements,
  (SELECT count(*) FROM public.users)                                         AS real_accounts,
  (SELECT status FROM public.tournaments WHERE year = 2026)                   AS tournament_status,
  (SELECT count(*) FROM public.bets WHERE status <> 'hidden')                 AS visible_bets,
  (SELECT count(*) FROM public.bet_picks WHERE result <> 'pending')           AS settled_picks,
  (SELECT count(*) FROM public.bets)                                          AS bets_kept,
  (SELECT count(*) FROM public.bet_picks)                                     AS picks_kept;

-- Optional: also clear the invite list Pat pasted in Act 2.
--   DELETE FROM public.tournament_invites;
--
-- Optional: release the remaining pick→player links (the real accounts', which
-- this file leaves in place) so the September import starts from a clean
-- match. Only needed if the real roster's display names have changed.
--   UPDATE public.bet_picks SET player_user_id = NULL;
