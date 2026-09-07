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
--   * the menu holds open AND closed bets in the SAME phase, which is the state
--     the phase-first menu has to stay legible in (Sprint 26 / #193) — and the
--     state the old fixtures could not express, because phase and status used to
--     be perfectly correlated everywhere,
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
WHERE b.tournament_id = t.id AND t.year = 2026
  AND b.phase = 1
  AND b.sheet_bet_id NOT IN (1, 3, 7, 8);

-- ---------------------------------------------------------------------------
-- Phase 2, still HIDDEN (Sprint 26 / #193).
--
-- seed-sample-phase1.sql is Phase 1 only, so until now there was no Phase 2
-- anywhere in E2E and a Phase 2 tab would have had nothing behind it in every
-- run. These two bets reproduce what production actually looks like for most of
-- the week: Phase 2 exists in the database and is `hidden`, so /bets filters it
-- out of the query entirely and the tab correctly reads "Phase 2 isn't open
-- yet".
--
-- A spec that wants the OTHER state opens them the way the app does — a
-- re-upload through /admin/import via buildMenuSheet — rather than by reaching
-- into the database, which is the same move e2e/results-and-reveal.spec.ts
-- already makes to close a bet.
--
-- sheet_bet_id 20/21 and pick ids 200+ sit clear of the sample menu (1-13,
-- 1-57) and of e2e/fixtures/rules.ts's throwaway bet 900.
-- ---------------------------------------------------------------------------
INSERT INTO public.bets
  (tournament_id, category_id, sheet_bet_id, title, phase, round, status, total_probability)
SELECT t.id, c.id, v.sheet_bet_id, v.title, v.phase, v.round, v.status, v.total_probability
FROM (
  VALUES
    (20, 'Win Tournament', 2, 'tournament', 'hidden', 1.5, 'Top Finisher'),
    (21, 'Medalist - Round 3', 2, 'round_3', 'hidden', 1.5, 'Top Finisher')
) AS v (sheet_bet_id, title, phase, round, status, total_probability, category_name)
CROSS JOIN (SELECT id FROM public.tournaments WHERE year = 2026) t
JOIN public.bet_categories c ON c.name = v.category_name
ON CONFLICT (tournament_id, sheet_bet_id) DO UPDATE SET
  category_id       = EXCLUDED.category_id,
  title             = EXCLUDED.title,
  phase             = EXCLUDED.phase,
  round             = EXCLUDED.round,
  status            = EXCLUDED.status,
  total_probability = EXCLUDED.total_probability;

INSERT INTO public.bet_picks
  (bet_id, sheet_pick_id, label, american_odds, fractional_odds, probability, result)
SELECT b.id, v.sheet_pick_id, v.label, v.american_odds, v.fractional_odds, v.probability, v.result
FROM (
  VALUES
    (20, 200, 'Dan Mercer', 110, '11/10', 0.4761904761904762, 'pending'),
    (20, 201, 'Garrett Klenke', 200, '2/1', 0.3333333333333333, 'pending'),
    (21, 202, 'Jake Kohne', 150, '3/2', 0.4, 'pending'),
    (21, 203, 'Steve Jones', 250, '5/2', 0.2857142857142857, 'pending')
) AS v (sheet_bet_id, sheet_pick_id, label, american_odds, fractional_odds, probability, result)
JOIN public.bets b ON b.sheet_bet_id = v.sheet_bet_id
JOIN public.tournaments t ON t.id = b.tournament_id AND t.year = 2026
ON CONFLICT (bet_id, sheet_pick_id) DO UPDATE SET
  label           = EXCLUDED.label,
  american_odds   = EXCLUDED.american_odds,
  fractional_odds = EXCLUDED.fractional_odds,
  probability     = EXCLUDED.probability,
  result          = EXCLUDED.result;

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

-- Sanity: Phase 1 is 4 open / 9 closed, Phase 2 is 2 hidden, and two wagers are
-- parked on nonplayer@. The hidden pair is what makes the Phase 2 tab read
-- "isn't open yet" rather than having nothing to render at all.
SELECT
  count(*) FILTER (WHERE b.phase = 1 AND b.status = 'open')   AS p1_open,
  count(*) FILTER (WHERE b.phase = 1 AND b.status = 'closed') AS p1_closed,
  count(*) FILTER (WHERE b.phase = 2 AND b.status = 'hidden') AS p2_hidden,
  (SELECT count(*) FROM public.bet_placements) AS placements
FROM public.bets b
JOIN public.tournaments t ON t.id = b.tournament_id AND t.year = 2026;
