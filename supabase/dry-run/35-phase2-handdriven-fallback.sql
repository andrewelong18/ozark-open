-- ═══════════════════════════════════════════════════════════════════════════
-- Dry run · FALLBACK — the hand-driven bettors' Phase 2 slates
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️  Same caveat as 25-: place these by hand in Act 8 if there is time. Doing
--     it by hand is what proves Phase 2 is its own budget (Sprint 30 / ADR
--     0002): each of these bettors should see their PHASE 2 entry as the whole
--     of their remaining balance, whatever they did in Phase 1, and the
--     running-total rule should stop them one dollar past it.
--
-- Every slate below closes the bettor out at EXACTLY their Phase 2 entry.
-- Run AFTER 30-phase2-placements.sql.

BEGIN;

-- Clear whatever Act 8 placed by hand, as its OWN statement — as a CTE beside
-- the INSERT the delete was invisible to the insert's snapshot, so the file
-- failed exactly when it was needed (Sprint 21 / #95). Phase 2 only.
DELETE FROM public.bet_placements p
 USING public.bet_picks pk, public.bets bt, public.users u
 WHERE p.pick_id = pk.id
   AND pk.bet_id = bt.id
   AND bt.phase = 2
   AND u.id = p.user_id
   AND u.email IN (
     'dan.mercer@dryrun.ozark.test',
     'jake.kohne@dryrun.ozark.test',
     'casey.sideline@dryrun.ozark.test',
     'pleicht17@gmail.com',
     'newbie@dryrun.ozark.test'
   );

WITH bettor AS (
  SELECT u.id AS user_id, u.email FROM public.users u
),
slate (email, sheet_pick_id, amount) AS (
  VALUES
    -- Dan Mercer · Phase 2 $30 · self cap $7 — picks 58 and 70 are him, and
    -- he leaves them alone: worth watching him try one past the cap in the UI
    ('dan.mercer@dryrun.ozark.test',     63, 6),
    ('dan.mercer@dryrun.ozark.test',     71, 6),
    ('dan.mercer@dryrun.ozark.test',     76, 6),
    ('dan.mercer@dryrun.ozark.test',     82, 6),
    ('dan.mercer@dryrun.ozark.test',     86, 6),   -- $30 of $30 ✓

    -- Jake Kohne · Phase 2 $20 · no self-picks (pick 79 is him)
    ('jake.kohne@dryrun.ozark.test',     58, 4),
    ('jake.kohne@dryrun.ozark.test',     63, 4),
    ('jake.kohne@dryrun.ozark.test',     71, 4),
    ('jake.kohne@dryrun.ozark.test',     82, 4),
    ('jake.kohne@dryrun.ozark.test',     86, 4),   -- $20 of $20 ✓

    -- Casey Sideline · Phase 2 $20 · non-player, no self-picks possible
    ('casey.sideline@dryrun.ozark.test', 58, 6),
    ('casey.sideline@dryrun.ozark.test', 63, 4),
    ('casey.sideline@dryrun.ozark.test', 71, 4),
    ('casey.sideline@dryrun.ozark.test', 82, 3),
    ('casey.sideline@dryrun.ozark.test', 86, 3),   -- $20 of $20 ✓

    -- Pat Leicht · Phase 2 $20 · no self-picks (picks 67 and 75 are him)
    ('pleicht17@gmail.com',              58, 4),
    ('pleicht17@gmail.com',              63, 4),
    ('pleicht17@gmail.com',              71, 4),
    ('pleicht17@gmail.com',              82, 4),
    ('pleicht17@gmail.com',              86, 4),   -- $20 of $20 ✓

    -- Mike Yenzer · Phase 2 $20 · pick 84 is "Mike Yenzer (E)", and $5 there
    -- is his self cap exactly
    ('newbie@dryrun.ozark.test',         84, 5),   -- self
    ('newbie@dryrun.ozark.test',         58, 4),
    ('newbie@dryrun.ozark.test',         63, 4),
    ('newbie@dryrun.ozark.test',         71, 4),
    ('newbie@dryrun.ozark.test',         86, 3)    -- $20 of $20 ✓
),
resolved AS (
  SELECT b.user_id, pk.id AS pick_id, s.amount, pk.american_odds AS odds_at_placement,
         (pk.player_user_id IS NOT NULL AND pk.player_user_id = b.user_id) AS requires_admin_review
    FROM slate s
    JOIN bettor b            ON b.email = s.email
    JOIN public.bet_picks pk ON pk.sheet_pick_id = s.sheet_pick_id
    JOIN public.bets bt      ON bt.id = pk.bet_id
    JOIN public.tournaments t ON t.id = bt.tournament_id AND t.year = 2026
)
INSERT INTO public.bet_placements (user_id, pick_id, amount, odds_at_placement, requires_admin_review)
SELECT user_id, pick_id, amount, odds_at_placement, requires_admin_review FROM resolved;

COMMIT;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Phase 2 only. Every hand-driven bettor should now read 'exact'. Devin Arand
-- and Mike Vemmer are the only names in the whole Phase 2 pot that may read
-- 'OFF'.
SELECT u.display_name, tp.phase2_entry_fee AS entry, sum(p.amount) AS wagered,
       CASE WHEN sum(p.amount) = tp.phase2_entry_fee THEN 'exact' ELSE 'OFF' END AS phase_2
  FROM public.bet_placements p
  JOIN public.bet_picks pk ON pk.id = p.pick_id
  JOIN public.bets bt ON bt.id = pk.bet_id AND bt.phase = 2
  JOIN public.users u ON u.id = p.user_id
  JOIN public.tournament_participants tp ON tp.user_id = u.id AND tp.tournament_id = bt.tournament_id
 WHERE p.deleted_at IS NULL
 GROUP BY u.display_name, tp.phase2_entry_fee ORDER BY u.display_name;
