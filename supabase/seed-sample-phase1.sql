-- Sample Phase 1 bet menu, hand-generated from docs/import/bets-sample.xlsx
-- (Sprint 1). 13 bets / 57 picks, values verbatim from the sheet — odds
-- display strings and probabilities are sheet-calculated, never recomputed.
--
-- Apply by pasting into the Supabase SQL editor AFTER the bet/pick rework
-- migration. Safe to re-run: bets and picks upsert by their sheet IDs, and
-- the player-link UPDATE at the bottom only fills in missing links — re-run
-- it whenever users.display_name rows get fixed up in Studio. The Sprint 2
-- importer supersedes this file by upserting on the same keys.

WITH t AS (
  SELECT id FROM public.tournaments WHERE year = 2026
)
INSERT INTO public.bets
  (tournament_id, category_id, sheet_bet_id, title, phase, round, status, total_probability)
SELECT t.id, c.id, v.sheet_bet_id, v.title, v.phase, v.round, v.status, v.total_probability
FROM (
  VALUES
    (1, 'Win Tournament', 1, 'tournament', 'open', 1.548063562820406, 'Top Finisher'),
    (2, 'Top 4 Finish', 1, 'tournament', 'open', 3.631730769230769, 'Top X Finisher'),
    (3, 'Medalist - Round 1', 1, 'round_1', 'open', 1.6087778485346915, 'Top Finisher'),
    (4, 'Match - Round 1', 1, 'round_1', 'open', 1, 'Match'),
    (5, 'Group Match - Round 1', 1, 'round_1', 'open', 1.2523809523809526, 'Group Match'),
    (6, 'Match - Round 1', 1, 'round_1', 'open', 1, 'Match'),
    (7, 'Group Match - Round 1', 1, 'round_1', 'open', 1.2000000000000002, 'Group Match'),
    (8, 'Match - Round 1', 1, 'round_1', 'open', 1, 'Match'),
    (9, 'Lowest 18 hole score will be lower than highest 9 hole score', 1, 'round_1', 'open', 1, 'Prop Bet'),
    (10, 'Jake Kohne, Steve Jones, and Mike Yenzer best ball is under 80.5', 1, 'round_1', 'open', 1, 'Prop Bet'),
    (11, 'Alex Leslie, Devin Arand, Ethan Kipping, and Pat Leicht''s best ball will beat Dan Mercer and Garrett Klenke''s best ball', 1, 'round_1', 'open', 1, 'Prop Bet'),
    (12, 'Worst score to par to win a hole in match play is triple bogey or worse.', 1, 'round_1', 'open', 1, 'Prop Bet'),
    (13, 'More Even or Odd hole scores', 1, 'round_1', 'open', 1, 'Prop Bet')
) AS v (sheet_bet_id, title, phase, round, status, total_probability, category_name)
CROSS JOIN t
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
    (1, 1, 'Dan Mercer', 110, '11/10', 0.47619047619047616, 'hit'),
    (1, 2, 'Garrett Klenke', 200, '2/1', 0.33333333333333331, 'miss'),
    (1, 3, 'Ethan Kipping', 400, '4/1', 0.2, 'miss'),
    (1, 4, 'Alex Leslie', 900, '9/1', 0.1, 'miss'),
    (1, 5, 'Devin Arand', 700, '7/1', 0.125, 'miss'),
    (1, 6, 'Pat Leicht', 1200, '12/1', 7.6923076923076927E-2, 'miss'),
    (1, 7, 'Dustin Scheller', 1500, '15/1', 6.25E-2, 'miss'),
    (1, 8, 'Mike Vemmer', 1500, '15/1', 6.25E-2, 'miss'),
    (1, 9, 'Rob Vemmer', 1500, '15/1', 6.25E-2, 'miss'),
    (1, 10, 'Jake Kohne', 5000, '50/1', 1.9607843137254902E-2, 'miss'),
    (1, 11, 'Steve Jones', 5000, '50/1', 1.9607843137254902E-2, 'miss'),
    (1, 12, 'Field', 10000, '100/1', 9.9009900990099011E-3, 'miss'),
    (2, 13, 'Ethan Kipping', -500, '5/6', 0.83333333333333337, 'hit'),
    (2, 14, 'Alex Leslie', 100, '1/1', 0.5, 'miss'),
    (2, 15, 'Devin Arand', 150, '3/2', 0.4, 'hit'),
    (2, 16, 'Pat Leicht', 150, '3/2', 0.4, 'miss'),
    (2, 17, 'Mike Vemmer', 160, '8/5', 0.38461538461538464, 'miss'),
    (2, 18, 'Rob Vemmer', 160, '8/5', 0.38461538461538464, 'miss'),
    (2, 19, 'Dustin Scheller', 200, '2/1', 0.33333333333333331, 'miss'),
    (2, 20, 'Jake Kohne', 500, '5/1', 0.16666666666666666, 'miss'),
    (2, 21, 'Steve Jones', 500, '5/1', 0.16666666666666666, 'miss'),
    (2, 22, 'Field', 1500, '15/1', 6.25E-2, 'miss'),
    (3, 23, 'Dan Mercer', 110, '11/10', 0.47619047619047616, 'miss'),
    (3, 24, 'Garrett Klenke', 200, '2/1', 0.33333333333333331, 'hit'),
    (3, 25, 'Ethan Kipping', 400, '4/1', 0.2, 'miss'),
    (3, 26, 'Alex Leslie', 600, '6/1', 0.14285714285714285, 'miss'),
    (3, 27, 'Devin Arand', 600, '6/1', 0.14285714285714285, 'miss'),
    (3, 28, 'Pat Leicht', 1200, '12/1', 7.6923076923076927E-2, 'miss'),
    (3, 29, 'Dustin Scheller', 1500, '15/1', 6.25E-2, 'miss'),
    (3, 30, 'Mike Vemmer', 1500, '15/1', 6.25E-2, 'miss'),
    (3, 31, 'Rob Vemmer', 1500, '15/1', 6.25E-2, 'miss'),
    (3, 32, 'Jake Kohne', 5000, '50/1', 1.9607843137254902E-2, 'miss'),
    (3, 33, 'Steve Jones', 5000, '50/1', 1.9607843137254902E-2, 'miss'),
    (3, 34, 'Field', 10000, '100/1', 9.9009900990099011E-3, 'miss'),
    (4, 35, 'Dan Mercer', -130, '13/23', 0.56521739130434778, 'miss'),
    (4, 36, 'Garrett Klenke', 130, '13/10', 0.43478260869565216, 'hit'),
    (5, 37, 'Ethan Kipping', 150, '3/2', 0.4, 'miss'),
    (5, 38, 'Alex Leslie', 250, '5/2', 0.2857142857142857, 'miss'),
    (5, 39, 'Devin Arand', 150, '3/2', 0.4, 'hit'),
    (5, 40, 'Pat Leicht', 500, '5/1', 0.16666666666666666, 'miss'),
    (6, 41, 'Mike Vemmer', 100, '1/1', 0.5, 'push'),
    (6, 42, 'Rob Vemmer', 100, '1/1', 0.5, 'push'),
    (7, 43, 'Jake Kohne (E)', 150, '3/2', 0.4, 'hit'),
    (7, 44, 'Steve Jones (-5)', 150, '3/2', 0.4, 'miss'),
    (7, 45, 'Mike Yenzer (-10)', 150, '3/2', 0.4, 'hit'),
    (8, 46, 'Brendan Nulsen (E)', 100, '1/1', 0.5, 'hit'),
    (8, 47, 'Austin Davis (-10)', 100, '1/1', 0.5, 'miss'),
    (9, 48, 'Yes', 200, '2/1', 0.33333333333333331, 'miss'),
    (9, 49, 'No', -200, '2/3', 0.66666666666666663, 'hit'),
    (10, 50, 'Yes', 150, '3/2', 0.4, 'hit'),
    (10, 51, 'No', -150, '3/5', 0.6, 'miss'),
    (11, 52, 'Yes', -130, '13/23', 0.56521739130434778, 'push'),
    (11, 53, 'No', 130, '13/10', 0.43478260869565216, 'push'),
    (12, 54, 'Yes', -110, '11/21', 0.52380952380952384, 'miss'),
    (12, 55, 'No', 110, '11/10', 0.47619047619047616, 'hit'),
    (13, 56, 'Even', -120, '6/11', 0.54545454545454541, 'hit'),
    (13, 57, 'Odd', 120, '6/5', 0.45454545454545453, 'miss')
) AS v (sheet_bet_id, sheet_pick_id, label, american_odds, fractional_odds, probability, result)
JOIN public.bets b
  ON b.sheet_bet_id = v.sheet_bet_id
 AND b.tournament_id = (SELECT id FROM public.tournaments WHERE year = 2026)
ON CONFLICT (bet_id, sheet_pick_id) DO UPDATE SET
  label           = EXCLUDED.label,
  american_odds   = EXCLUDED.american_odds,
  fractional_odds = EXCLUDED.fractional_odds,
  probability     = EXCLUDED.probability,
  result          = EXCLUDED.result;

-- Pick → player links (ADR 0001 §11): strip stroke suffixes ("(E)", "(-5)")
-- and match against users.display_name. Links whoever exists at run time;
-- unmatched picks ("Field", "Yes"/"No", players who haven't logged in) stay
-- NULL. Re-run after display names are entered in Studio.
UPDATE public.bet_picks pk
SET player_user_id = u.id
FROM public.users u
WHERE pk.player_user_id IS NULL
  AND regexp_replace(pk.label, '\s*\((E|[+-]?[0-9]+)\)$', '') = u.display_name;
