-- E2E fixture — layered ON TOP OF seed-sample-phase1.sql + seed-dev-accounts.sql.
-- Load order: sample menu → dev accounts → this file. scripts/e2e-verify.sh does that.
--
-- Why this file has to exist at all: seed-sample-phase1.sql publishes all 13 bets
-- as `status = 'closed'` with a Round-1 verdict on every pick. Nothing in it can
-- be wagered on, which is why scripts/placement-roundtrip.ts opens a bet itself
-- before it can test anything. (docs/DEV_TESTING.md used to claim the seeded menu
-- was open — it never was.) Post-Sprint-25 a bet also needs its phase deadline
-- still ahead of us: wagering_open <=> bets.status = 'open' AND now() < the
-- phase's closes_at (lib/phases.ts wageringOpen).
--
-- So this seed leaves the menu deliberately MIXED:
--
--   OPEN   bets 1, 3, 7, 8   — placeable; their picks reset to 'pending'
--   CLOSED everything else   — keeps its Round-1 results
--
-- The mix is load-bearing for three journeys:
--   * the Open/Closed status toggle only renders when the menu holds both kinds
--     (showStatusToggle in lib/bet-filters.ts),
--   * reveal-at-close needs an open bet that hides other people's wagers AND a
--     closed one that shows them,
--   * bet 1 is the pick-ordering fixture: in sheet order Alex Leslie (+900) sits
--     before Devin Arand (+700), but favourites-first has to swap them. A menu
--     that re-sorted by sheet_pick_id would get this wrong — that was #105.
--
-- Idempotent: re-run it as often as you like. @ozark.test accounts only.

BEGIN;

-- ---------------------------------------------------------------------------
-- The tournament clock. Deadlines are set RELATIVE to now() so the fixture
-- can't rot the way a hardcoded 2026 date would, and 'active' lights the
-- dashboard's Betting Open badge.
-- ---------------------------------------------------------------------------
UPDATE public.tournaments
SET status          = 'active',
    phase1_closes_at = now() + interval '30 days',
    phase2_closes_at = now() + interval '32 days',
    show_countdown   = true
WHERE year = 2026;

-- ---------------------------------------------------------------------------
-- Open the four Phase 1 bets the journeys place on, and clear their results —
-- the importer refuses a result on a bet that isn't closed (lib/import.ts), so
-- an open bet with a verdict is a state the app would never produce.
-- ---------------------------------------------------------------------------
UPDATE public.bets b
SET status = 'open'
FROM public.tournaments t
WHERE b.tournament_id = t.id AND t.year = 2026 AND b.sheet_bet_id IN (1, 3, 7, 8);

UPDATE public.bet_picks p
SET result = 'pending'
FROM public.bets b, public.tournaments t
WHERE p.bet_id = b.id AND b.tournament_id = t.id AND t.year = 2026
  AND b.sheet_bet_id IN (1, 3, 7, 8);

-- Everything else stays closed and settled. Stated explicitly so a re-run after
-- a spec closed something still lands on the same fixture.
UPDATE public.bets b
SET status = 'closed'
FROM public.tournaments t
WHERE b.tournament_id = t.id AND t.year = 2026 AND b.sheet_bet_id NOT IN (1, 3, 7, 8);

-- ---------------------------------------------------------------------------
-- One wager from a member the journeys do NOT sign in as, so "can I see other
-- people's picks?" has something to be wrong about. nonplayer@ ($20, non-player)
-- backs a favourite on the OPEN bet 1 and one on the CLOSED bet 5.
--
-- Same shape the app writes: odds snapshotted at placement (never read live),
-- placed_by_user_id NULL because the member placed it themselves.
-- ---------------------------------------------------------------------------
DELETE FROM public.bet_placements
WHERE user_id = (SELECT id FROM public.users WHERE email = 'nonplayer@ozark.test');

INSERT INTO public.bet_placements (user_id, pick_id, amount, odds_at_placement)
SELECT u.id, p.id, v.amount, p.american_odds
FROM (VALUES
  (1, 1, 6),   -- open bet 1, Dan Mercer     — must stay hidden from other members
  (5, 39, 5)   -- closed bet 5, Devin Arand  — must be visible to everyone (a 'hit')
) AS v (sheet_bet_id, sheet_pick_id, amount)
JOIN public.bets b ON b.sheet_bet_id = v.sheet_bet_id
JOIN public.tournaments t ON t.id = b.tournament_id AND t.year = 2026
JOIN public.bet_picks p ON p.bet_id = b.id AND p.sheet_pick_id = v.sheet_pick_id
CROSS JOIN (SELECT id FROM public.users WHERE email = 'nonplayer@ozark.test') u;

-- Wipe any wagers left behind by a previous run of the placement journeys, so
-- every run starts from the same budget. Leaves nonplayer@'s two rows above.
DELETE FROM public.bet_placements
WHERE user_id IN (
  SELECT id FROM public.users
  WHERE email IN ('approved@ozark.test', 'admin@ozark.test', 'newbie@ozark.test', 'pending@ozark.test')
);

-- newbie@ is the un-onboarded account the onboarding journey drives. Reset it
-- so the journey can be run twice in a row.
UPDATE public.users
SET onboarded_at = NULL,
    display_name = email,
    nickname     = NULL
WHERE email = 'newbie@ozark.test';

DELETE FROM public.tournament_participants
WHERE user_id IN (SELECT id FROM public.users WHERE email IN ('newbie@ozark.test', 'pending@ozark.test'));

COMMIT;

-- Sanity: 4 open / 9 closed, and two wagers parked on nonplayer@.
SELECT
  count(*) FILTER (WHERE b.status = 'open')   AS open_bets,
  count(*) FILTER (WHERE b.status = 'closed') AS closed_bets,
  (SELECT count(*) FROM public.bet_placements) AS placements
FROM public.bets b
JOIN public.tournaments t ON t.id = b.tournament_id AND t.year = 2026;
