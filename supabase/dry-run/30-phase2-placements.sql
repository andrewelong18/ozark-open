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
-- Rule 6 says the total wagered across BOTH phases must equal the entry fee
-- exactly by Phase 2 close — and the split between phases is the
-- participant's choice (Q2). Every slate below is sized to the exact dollar
-- each bettor has left over from Phase 1, so after this runs the compliance
-- sweep in Act 9 should show a clean board...
--
-- ...with one deliberate exception: Devin Arand lands on $18 of his $20. He
-- was already the Phase 1 straggler; now he is also the off-exact-total case.
-- Act 9's job is to catch him. If the compliance query shows a green board,
-- something is wrong with the query, not with Devin.
--
-- Steve Esswein still has nothing. He stays the "paid, never wagered"
-- control all the way to /results.
--
-- Idempotent: only deletes each bettor's PHASE 2 rows, so the Phase 1 wagers
-- (and the odds they snapshotted) survive a re-run untouched.

BEGIN;

WITH bettor AS (
  SELECT u.id AS user_id, u.email
  FROM public.users u
  WHERE u.email LIKE '%@dryrun.ozark.test' OR u.email = 'andrewelong18@gmail.com'
),
-- (email, sheet_pick_id, amount) — sized to each bettor's exact remaining
-- budget. Phase 2 picks are sheet_pick_id 58–87.
slate (email, sheet_pick_id, amount) AS (
  VALUES
    -- Garrett Klenke · $8 left · self cap $5, $4 already used → $1 headroom
    ('garrett.klenke@dryrun.ozark.test',  60, 1),   -- self (takes him to the cap)
    ('garrett.klenke@dryrun.ozark.test',  63, 2),
    ('garrett.klenke@dryrun.ozark.test',  70, 2),
    ('garrett.klenke@dryrun.ozark.test',  82, 2),
    ('garrett.klenke@dryrun.ozark.test',  86, 1),   -- $20 of $20 ✓

    -- Ethan Kipping · $12 left · already at his $7 self cap, so no self-picks
    ('ethan.kipping@dryrun.ozark.test',   58, 3),
    ('ethan.kipping@dryrun.ozark.test',   63, 2),
    ('ethan.kipping@dryrun.ozark.test',   71, 3),
    ('ethan.kipping@dryrun.ozark.test',   82, 2),
    ('ethan.kipping@dryrun.ozark.test',   86, 2),   -- $30 of $30 ✓

    -- Alex Leslie · $16 left · at his $10 self cap (pick 64 is him — avoided)
    ('alex.leslie@dryrun.ozark.test',     58, 4),
    ('alex.leslie@dryrun.ozark.test',     63, 3),
    ('alex.leslie@dryrun.ozark.test',     71, 3),
    ('alex.leslie@dryrun.ozark.test',     76, 2),
    ('alex.leslie@dryrun.ozark.test',     84, 2),
    ('alex.leslie@dryrun.ozark.test',     86, 2),   -- $40 of $40 ✓

    -- Devin Arand · $12 left, places only $10 → THE OFF-EXACT-TOTAL CASE
    ('devin.arand@dryrun.ozark.test',     58, 3),
    ('devin.arand@dryrun.ozark.test',     63, 2),
    ('devin.arand@dryrun.ozark.test',     70, 2),
    ('devin.arand@dryrun.ozark.test',     84, 2),
    ('devin.arand@dryrun.ozark.test',     86, 1),   -- $18 of $20 ✗ (deliberate)

    -- Dustin Scheller · $14 left · at his $8 self cap
    ('dustin.scheller@dryrun.ozark.test', 58, 3),
    ('dustin.scheller@dryrun.ozark.test', 63, 3),
    ('dustin.scheller@dryrun.ozark.test', 71, 3),
    ('dustin.scheller@dryrun.ozark.test', 82, 3),
    ('dustin.scheller@dryrun.ozark.test', 86, 2),   -- $35 of $35 ✓

    -- Mike Vemmer · $20 left · at his $10 self cap (68 and 77 are him)
    ('mike.vemmer@dryrun.ozark.test',     58, 5),
    ('mike.vemmer@dryrun.ozark.test',     64, 4),
    ('mike.vemmer@dryrun.ozark.test',     71, 4),
    ('mike.vemmer@dryrun.ozark.test',     76, 3),
    ('mike.vemmer@dryrun.ozark.test',     82, 2),
    ('mike.vemmer@dryrun.ozark.test',     86, 2),   -- $50 of $50 ✓

    -- Rob Vemmer · $10 left · at his $6 self cap (63 and 78 are him)
    ('rob.vemmer@dryrun.ozark.test',      58, 3),
    ('rob.vemmer@dryrun.ozark.test',      64, 2),
    ('rob.vemmer@dryrun.ozark.test',      71, 2),
    ('rob.vemmer@dryrun.ozark.test',      82, 2),
    ('rob.vemmer@dryrun.ozark.test',      86, 1),   -- $25 of $25 ✓

    -- Andrew Long · $6 left · no player link, so no self-picks possible
    ('andrewelong18@gmail.com',           58, 2),
    ('andrewelong18@gmail.com',           63, 1),
    ('andrewelong18@gmail.com',           71, 1),
    ('andrewelong18@gmail.com',           82, 1),
    ('andrewelong18@gmail.com',           86, 1)    -- $20 of $20 ✓
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
),
wiped AS (
  -- Phase 2 rows only — Phase 1 wagers and their odds snapshots stay put.
  DELETE FROM public.bet_placements p
  USING public.bet_picks pk, public.bets bt
  WHERE p.pick_id = pk.id
    AND pk.bet_id = bt.id
    AND bt.phase = 2
    AND p.user_id IN (SELECT user_id FROM bettor)
  RETURNING 1
)
INSERT INTO public.bet_placements (user_id, pick_id, amount, odds_at_placement, requires_admin_review)
SELECT user_id, pick_id, amount, odds_at_placement, requires_admin_review FROM resolved;

COMMIT;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect every bulk bettor at exactly their entry fee EXCEPT Devin Arand at
-- $18 of $20. Phase counts 5–6 each; Devin's phase 1 count stays at 3.
SELECT
  u.display_name,
  tp.entry_fee,
  count(*) FILTER (WHERE bt.phase = 1) AS p1_picks,
  count(*) FILTER (WHERE bt.phase = 2) AS p2_picks,
  sum(p.amount)                        AS total_wagered,
  tp.entry_fee - sum(p.amount)         AS remaining,
  CASE WHEN sum(p.amount) = tp.entry_fee THEN 'exact' ELSE 'OFF' END AS rule_6
FROM public.bet_placements p
JOIN public.bet_picks pk ON pk.id = p.pick_id
JOIN public.bets bt      ON bt.id = pk.bet_id
JOIN public.users u      ON u.id = p.user_id
JOIN public.tournament_participants tp ON tp.user_id = u.id
WHERE p.deleted_at IS NULL
GROUP BY u.display_name, tp.entry_fee
ORDER BY u.display_name;
