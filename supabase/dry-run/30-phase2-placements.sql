-- ═══════════════════════════════════════════════════════════════════════════
-- Dry run · step 3 — Phase 2 wagers for the bulk-seeded bettors
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Run this DURING Act 8, immediately after Pat uploads the Phase 2 sheet that
-- flips those bets from hidden to open. Same reasoning as 20-: the odds
-- snapshot has to come from the repriced Phase 2 menu, not the Phase 1 one.
--
-- ── WHAT THIS IS TESTING BY CONSTRUCTION ───────────────────────────────────
--
-- Since Sprint 30 (ADR 0002) Phase 2 is its own entry and its own pot: what a
-- bettor did or didn't spend in Phase 1 has nothing to do with it. Every
-- slate below is sized to the bettor's PHASE 2 entry, so after this runs the
-- Phase 2 chase list in Act 9 should show a clean board...
--
-- ...with two deliberate exceptions:
--
--   · Devin Arand lands on $18 of his $20 Phase 2 entry, 5 picks. The first
--     $20 of an entry is committed either way, so $2 forfeits to the pot.
--     If the chase list doesn't name him, something is wrong with the list.
--   · Mike Vemmer is PAT'S OWN WORKED EXAMPLE: a $50 Phase 2 entry, $20
--     wagered, $12 of it on himself. $12 is inside his placement-time cap (a
--     quarter of $50, floored), but at close the line is a quarter of what he
--     actually wagered — $5 — so $7 of his self-bets stays in the pot earning
--     nothing, and $30 of his entry comes back.
--
-- Steve Esswein has no Phase 2 entry, so he isn't in this pot at all; the
-- Phase 2 close counts him as the one approved member not entered.
--
-- Idempotent: only deletes each bettor's PHASE 2 rows, so the Phase 1 wagers
-- (and the odds they snapshotted) survive a re-run untouched. The delete is
-- its own statement (Sprint 21 / #95) — as a CTE beside the INSERT it was
-- invisible to the insert's snapshot, so a re-run collided on
-- bet_placements_user_id_pick_id_key.
--
-- The slate is a TEMP TABLE rather than a CTE for the same reason as 20-: the
-- cleanup used to match `u.email LIKE '%@dryrun.ozark.test'`, which also
-- caught the four hand-driven accounts (Mike Yenzer among them) and silently
-- deleted wagers a human had just placed in Act 8. Materialising it first
-- means the DELETE and the INSERT read the same list and cannot drift apart
-- again (#189).

BEGIN;

-- Step 0: the slate, materialised — the single source of truth for both the
-- DELETE and the INSERT below.
-- (email, sheet_pick_id, amount) — sized to each bettor's Phase 2 entry.
-- Phase 2 picks are sheet_pick_id 58–87. Every amount is within the flat $10
-- max single bet.
CREATE TEMP TABLE slate (email text, sheet_pick_id int, amount int) ON COMMIT DROP;

INSERT INTO slate (email, sheet_pick_id, amount) VALUES
    -- Garrett Klenke · Phase 2 $20 · self cap $5 (pick 60 is him)
    ('garrett.klenke@dryrun.ozark.test',  60, 1),   -- self
    ('garrett.klenke@dryrun.ozark.test',  63, 5),
    ('garrett.klenke@dryrun.ozark.test',  70, 5),
    ('garrett.klenke@dryrun.ozark.test',  82, 4),
    ('garrett.klenke@dryrun.ozark.test',  86, 5),   -- $20 of $20 ✓

    -- Ethan Kipping · Phase 2 $20 · no self-picks
    ('ethan.kipping@dryrun.ozark.test',   58, 4),
    ('ethan.kipping@dryrun.ozark.test',   63, 4),
    ('ethan.kipping@dryrun.ozark.test',   71, 4),
    ('ethan.kipping@dryrun.ozark.test',   82, 4),
    ('ethan.kipping@dryrun.ozark.test',   86, 4),   -- $20 of $20 ✓

    -- Alex Leslie · Phase 2 $20 · no self-picks (pick 64 is him — avoided)
    ('alex.leslie@dryrun.ozark.test',     58, 4),
    ('alex.leslie@dryrun.ozark.test',     63, 4),
    ('alex.leslie@dryrun.ozark.test',     71, 4),
    ('alex.leslie@dryrun.ozark.test',     76, 2),
    ('alex.leslie@dryrun.ozark.test',     84, 3),
    ('alex.leslie@dryrun.ozark.test',     86, 3),   -- $20 of $20 ✓

    -- Devin Arand · Phase 2 $20 · places $18 → $2 FORFEITS (deliberate)
    ('devin.arand@dryrun.ozark.test',     58, 5),
    ('devin.arand@dryrun.ozark.test',     63, 4),
    ('devin.arand@dryrun.ozark.test',     70, 4),
    ('devin.arand@dryrun.ozark.test',     84, 3),
    ('devin.arand@dryrun.ozark.test',     86, 2),   -- $18 of $20 ✗ (deliberate)

    -- Dustin Scheller · Phase 2 $20 · no self-picks (65 and 76 are him)
    ('dustin.scheller@dryrun.ozark.test', 58, 4),
    ('dustin.scheller@dryrun.ozark.test', 63, 4),
    ('dustin.scheller@dryrun.ozark.test', 71, 4),
    ('dustin.scheller@dryrun.ozark.test', 82, 4),
    ('dustin.scheller@dryrun.ozark.test', 86, 4),   -- $20 of $20 ✓

    -- Mike Vemmer · Phase 2 $50 · PAT'S EXAMPLE: $20 wagered, $12 on himself
    ('mike.vemmer@dryrun.ozark.test',     68, 7),   -- self · Top 6 Finish
    ('mike.vemmer@dryrun.ozark.test',     77, 5),   -- self · Medalist R3 → $12, at the placement cap
    ('mike.vemmer@dryrun.ozark.test',     58, 3),
    ('mike.vemmer@dryrun.ozark.test',     71, 3),
    ('mike.vemmer@dryrun.ozark.test',     86, 2),   -- $20 of $50 ✗ → $30 back, $5 of $12 on self counts

    -- Rob Vemmer · Phase 2 $20 · no self-picks (63 and 78 are him)
    ('rob.vemmer@dryrun.ozark.test',      58, 4),
    ('rob.vemmer@dryrun.ozark.test',      64, 4),
    ('rob.vemmer@dryrun.ozark.test',      71, 4),
    ('rob.vemmer@dryrun.ozark.test',      82, 4),
    ('rob.vemmer@dryrun.ozark.test',      86, 4),   -- $20 of $20 ✓

    -- Andrew Long · Phase 2 $20 · no player link, so no self-picks possible
    ('andrewelong18@gmail.com',           58, 4),
    ('andrewelong18@gmail.com',           63, 4),
    ('andrewelong18@gmail.com',           71, 4),
    ('andrewelong18@gmail.com',           82, 4),
    ('andrewelong18@gmail.com',           86, 4);   -- $20 of $20 ✓

-- Step 1: clear Phase 2, as its own statement so the INSERT below sees it,
-- and scoped to exactly the bettors in the slate — never the hand-driven four.
DELETE FROM public.bet_placements p
 USING public.bet_picks pk, public.bets bt, public.users u
 WHERE p.pick_id = pk.id
   AND pk.bet_id = bt.id
   AND bt.phase = 2
   AND u.id = p.user_id
   AND u.email IN (SELECT email FROM slate);

-- Step 2: seed.
WITH bettor AS (
  SELECT u.id AS user_id, u.email
  FROM public.users u
  WHERE u.email IN (SELECT email FROM slate)
),
resolved AS (
  SELECT
    b.user_id,
    pk.id AS pick_id,
    s.amount,
    pk.american_odds AS odds_at_placement,
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
-- Phase 2 only. Expect every bulk bettor at exactly their Phase 2 entry
-- EXCEPT Devin Arand at $18 of $20 and Mike Vemmer at $20 of $50. Picks 5–6
-- each.
SELECT
  u.display_name,
  tp.phase2_entry_fee                                   AS entry,
  count(*)                                              AS picks,
  sum(p.amount)                                         AS wagered,
  sum(p.amount) FILTER (WHERE p.requires_admin_review)  AS on_self,
  CASE WHEN sum(p.amount) = tp.phase2_entry_fee THEN 'exact' ELSE 'OFF' END AS phase_2
FROM public.bet_placements p
JOIN public.bet_picks pk ON pk.id = p.pick_id
JOIN public.bets bt      ON bt.id = pk.bet_id AND bt.phase = 2
JOIN public.users u      ON u.id = p.user_id
JOIN public.tournament_participants tp ON tp.user_id = u.id AND tp.tournament_id = bt.tournament_id
WHERE p.deleted_at IS NULL
GROUP BY u.display_name, tp.phase2_entry_fee
ORDER BY u.display_name;
