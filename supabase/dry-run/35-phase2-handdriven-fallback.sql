-- ═══════════════════════════════════════════════════════════════════════════
-- Dry run · FALLBACK — the hand-driven bettors' Phase 2 slates
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️  Same caveat as 25-: place these by hand in Act 8 if there is time. Doing
--     it by hand is what proves the budget carries across phases correctly —
--     each of these bettors should see exactly their leftover Phase 1 money
--     as their remaining balance, and the running-total rule should stop them
--     one dollar past it.
--
-- Every slate below closes the bettor out at EXACTLY their entry fee, which
-- is rule 6's final condition. Run AFTER 30-phase2-placements.sql.

BEGIN;

WITH bettor AS (
  SELECT u.id AS user_id, u.email FROM public.users u
),
slate (email, sheet_pick_id, amount) AS (
  VALUES
    -- Dan Mercer · $15 left · already at his $10 self cap, so picks 58 and 70
    -- (both him) are off the table — worth watching him try one in the UI
    ('dan.mercer@dryrun.ozark.test',     63, 4),
    ('dan.mercer@dryrun.ozark.test',     71, 4),
    ('dan.mercer@dryrun.ozark.test',     76, 3),
    ('dan.mercer@dryrun.ozark.test',     82, 2),
    ('dan.mercer@dryrun.ozark.test',     86, 2),   -- $40 of $40 ✓

    -- Jake Kohne · $10 left · at his $6 self cap (pick 79 is him)
    ('jake.kohne@dryrun.ozark.test',     58, 3),
    ('jake.kohne@dryrun.ozark.test',     63, 2),
    ('jake.kohne@dryrun.ozark.test',     71, 2),
    ('jake.kohne@dryrun.ozark.test',     82, 2),
    ('jake.kohne@dryrun.ozark.test',     86, 1),   -- $25 of $25 ✓

    -- Casey Sideline · $20 left · non-player, no self-picks possible
    ('casey.sideline@dryrun.ozark.test', 58, 6),
    ('casey.sideline@dryrun.ozark.test', 63, 4),
    ('casey.sideline@dryrun.ozark.test', 71, 4),
    ('casey.sideline@dryrun.ozark.test', 82, 3),
    ('casey.sideline@dryrun.ozark.test', 86, 3),   -- $50 of $50 ✓

    -- Pat Leicht · $12 left · at his $7 self cap (picks 67 and 75 are him)
    ('pleicht17@gmail.com',              58, 3),
    ('pleicht17@gmail.com',              63, 3),
    ('pleicht17@gmail.com',              71, 3),
    ('pleicht17@gmail.com',              82, 2),
    ('pleicht17@gmail.com',              86, 1),   -- $30 of $30 ✓

    -- Mike Yenzer · $7 left · pick 84 is "Mike Yenzer (E)", and $2 there
    -- takes him to his $5 self cap exactly
    ('newbie@dryrun.ozark.test',         84, 2),   -- self
    ('newbie@dryrun.ozark.test',         58, 2),
    ('newbie@dryrun.ozark.test',         63, 1),
    ('newbie@dryrun.ozark.test',         71, 1),
    ('newbie@dryrun.ozark.test',         86, 1)    -- $20 of $20 ✓
),
resolved AS (
  SELECT b.user_id, pk.id AS pick_id, s.amount, pk.american_odds AS odds_at_placement,
         (pk.player_user_id IS NOT NULL AND pk.player_user_id = b.user_id) AS requires_admin_review
    FROM slate s
    JOIN bettor b            ON b.email = s.email
    JOIN public.bet_picks pk ON pk.sheet_pick_id = s.sheet_pick_id
    JOIN public.bets bt      ON bt.id = pk.bet_id
    JOIN public.tournaments t ON t.id = bt.tournament_id AND t.year = 2026
),
wiped AS (
  DELETE FROM public.bet_placements p
  USING public.bet_picks pk, public.bets bt
  WHERE p.pick_id = pk.id AND pk.bet_id = bt.id AND bt.phase = 2
    AND p.user_id IN (SELECT user_id FROM resolved)
  RETURNING 1
)
INSERT INTO public.bet_placements (user_id, pick_id, amount, odds_at_placement, requires_admin_review)
SELECT user_id, pick_id, amount, odds_at_placement, requires_admin_review FROM resolved;

COMMIT;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Every hand-driven bettor should now read 'exact'. Devin Arand is the only
-- name in the whole pool that may read 'OFF'.
SELECT u.display_name, tp.entry_fee, sum(p.amount) AS wagered,
       CASE WHEN sum(p.amount) = tp.entry_fee THEN 'exact' ELSE 'OFF' END AS rule_6
  FROM public.bet_placements p
  JOIN public.users u ON u.id = p.user_id
  JOIN public.tournament_participants tp ON tp.user_id = u.id
 WHERE p.deleted_at IS NULL
 GROUP BY u.display_name, tp.entry_fee ORDER BY u.display_name;
