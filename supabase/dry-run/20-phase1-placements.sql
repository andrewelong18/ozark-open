-- ═══════════════════════════════════════════════════════════════════════════
-- Dry run · step 2 — Phase 1 wagers for the bulk-seeded bettors
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Run this DURING Act 3, immediately after Pat uploads the Phase 1 sheet.
--
-- ── WHY AFTER THE UPLOAD, NOT BEFORE ───────────────────────────────────────
--
-- Every placement snapshots the pick's odds into odds_at_placement at write
-- time, and payouts compute from that snapshot forever after (PRD §7.1). If
-- this ran before the import the snapshot would come from stale odds, and
-- Act 5's reprice test — the whole point of which is proving the snapshot
-- does not move — would be testing against the wrong baseline.
--
-- The import also has to have run so pick→player links exist, which is what
-- makes requires_admin_review meaningful below.
--
-- ── WHY SEED THESE AT ALL ──────────────────────────────────────────────────
--
-- Two people cannot hand-place ~100 wagers in an evening. These eight bettors
-- give the pari-mutuel pool enough mass that the proportional split in Act 10
-- is a real test rather than arithmetic on two rows. The four HAND-DRIVEN
-- bettors (Dan Mercer, Jake Kohne, Casey Sideline, Pat) place through the
-- real UI in Act 4 — that is what exercises /api/placements and every §7
-- rule. This file deliberately bypasses the API; it is pool ballast, not a
-- test of the rules engine.
--
-- Every row below is nonetheless rule-valid, so the compliance views read
-- like a real Thursday morning. Two deliberate exceptions:
--
--   · Devin Arand has only THREE Phase 1 picks and $8 of a $20 entry — he is
--     the straggler Act 6's chase list must catch.
--   · Steve Esswein gets NO placements at all — the "paid the entry, never
--     wagered" control. He should surface on /results with $0 theoretical and
--     a full-entry loss, which is worth showing Pat.
--
-- Idempotent: clears these bettors' PHASE 1 rows first, in its own statement.
-- (Sprint 21 / #95 — it used to do that in a CTE alongside the INSERT, where
-- the delete is invisible to the insert's snapshot, so a re-run collided on
-- bet_placements_user_id_pick_id_key. Phase 2 wagers are never touched.)

BEGIN;

-- Step 1: clear, as its own statement so the INSERT below can see it happen.
DELETE FROM public.bet_placements p
 USING public.bet_picks pk, public.bets bt, public.users u
 WHERE p.pick_id = pk.id
   AND pk.bet_id = bt.id
   AND bt.phase = 1
   AND u.id = p.user_id
   AND (u.email LIKE '%@dryrun.ozark.test' OR u.email = 'andrewelong18@gmail.com');

-- Step 2: seed.
WITH bettor AS (
  SELECT u.id AS user_id, u.email
  FROM public.users u
  WHERE u.email LIKE '%@dryrun.ozark.test' OR u.email = 'andrewelong18@gmail.com'
),
-- (email, sheet_pick_id, amount). Cross-checked against lib/validation.ts:
-- whole dollars ≥ $1 · amount ≤ maxSingleBet(entry) · 5–10 picks per phase
-- (Devin excepted) · self-pick total ≤ maxSelfBet(entry) · running total ≤
-- entry fee · one pick per Match/Group Match · never on an opponent.
slate (email, sheet_pick_id, amount) AS (
  VALUES
    -- Garrett Klenke · $20 entry · max single $10 · self cap $5
    ('garrett.klenke@dryrun.ozark.test',  13, 3),
    ('garrett.klenke@dryrun.ozark.test',  24, 2),   -- self
    ('garrett.klenke@dryrun.ozark.test',  36, 2),   -- self, and his own Match 4 pick
    ('garrett.klenke@dryrun.ozark.test',  39, 2),
    ('garrett.klenke@dryrun.ozark.test',  49, 3),   -- $12 of $20, self $4/$5

    -- Ethan Kipping · $30 entry · max single $15 · self cap $7
    ('ethan.kipping@dryrun.ozark.test',   13, 4),   -- self
    ('ethan.kipping@dryrun.ozark.test',   37, 3),   -- self, his own Group Match 5 pick
    ('ethan.kipping@dryrun.ozark.test',    1, 4),
    ('ethan.kipping@dryrun.ozark.test',   24, 3),
    ('ethan.kipping@dryrun.ozark.test',   41, 2),
    ('ethan.kipping@dryrun.ozark.test',   46, 2),   -- $18 of $30, self $7/$7 (at cap)

    -- Alex Leslie · $40 entry · max single $20 · self cap $10
    ('alex.leslie@dryrun.ozark.test',     14, 6),   -- self
    ('alex.leslie@dryrun.ozark.test',     38, 4),   -- self, his own Group Match 5 pick
    ('alex.leslie@dryrun.ozark.test',      1, 5),
    ('alex.leslie@dryrun.ozark.test',     36, 4),
    ('alex.leslie@dryrun.ozark.test',     43, 3),
    ('alex.leslie@dryrun.ozark.test',     49, 2),   -- $24 of $40, self $10/$10 (at cap)

    -- Devin Arand · $20 entry · THE STRAGGLER: 3 picks, $8 of $20
    ('devin.arand@dryrun.ozark.test',     15, 4),   -- self
    ('devin.arand@dryrun.ozark.test',     39, 1),   -- self, his own Group Match 5 pick
    ('devin.arand@dryrun.ozark.test',     26, 3),

    -- Dustin Scheller · $35 entry · max single $17 · self cap $8
    ('dustin.scheller@dryrun.ozark.test', 19, 5),   -- self
    ('dustin.scheller@dryrun.ozark.test', 29, 3),   -- self
    ('dustin.scheller@dryrun.ozark.test',  2, 4),
    ('dustin.scheller@dryrun.ozark.test', 35, 3),
    ('dustin.scheller@dryrun.ozark.test', 42, 3),
    ('dustin.scheller@dryrun.ozark.test', 47, 3),   -- $21 of $35, self $8/$8 (at cap)

    -- Mike Vemmer · $50 entry · max single $20 (the CAP binds, not the pct)
    ('mike.vemmer@dryrun.ozark.test',     17, 5),   -- self
    ('mike.vemmer@dryrun.ozark.test',     41, 5),   -- self, his own Match 6 pick
    ('mike.vemmer@dryrun.ozark.test',      1, 6),
    ('mike.vemmer@dryrun.ozark.test',     24, 5),
    ('mike.vemmer@dryrun.ozark.test',     46, 4),
    ('mike.vemmer@dryrun.ozark.test',     52, 5),   -- $30 of $50, self $10/$10 (at cap)

    -- Rob Vemmer · $25 entry · max single $12 (floor of 12.5) · self cap $6
    ('rob.vemmer@dryrun.ozark.test',      18, 4),   -- self
    ('rob.vemmer@dryrun.ozark.test',      42, 2),   -- self, his own Match 6 pick
    ('rob.vemmer@dryrun.ozark.test',       1, 3),
    ('rob.vemmer@dryrun.ozark.test',      36, 3),
    ('rob.vemmer@dryrun.ozark.test',      44, 3),   -- $15 of $25, self $6/$6 (at cap)

    -- Andrew Long · $20 entry · no player link, so no self-picks possible
    ('andrewelong18@gmail.com',            1, 4),
    ('andrewelong18@gmail.com',           24, 3),
    ('andrewelong18@gmail.com',           39, 3),
    ('andrewelong18@gmail.com',           46, 2),
    ('andrewelong18@gmail.com',           49, 2)    -- $14 of $20
),
resolved AS (
  SELECT
    b.user_id,
    pk.id AS pick_id,
    s.amount,
    -- Snapshot the pick's odds AS THEY STAND RIGHT NOW. This is the exact
    -- behaviour of planWrite() in lib/placements.ts.
    pk.american_odds AS odds_at_placement,
    -- Self-pick → flagged for admin review, in every category (ADR 0001 A9).
    (pk.player_user_id IS NOT NULL AND pk.player_user_id = b.user_id) AS requires_admin_review
  FROM slate s
  JOIN bettor b        ON b.email = s.email
  JOIN public.bet_picks pk ON pk.sheet_pick_id = s.sheet_pick_id
  JOIN public.bets bt  ON bt.id = pk.bet_id
  JOIN public.tournaments t ON t.id = bt.tournament_id AND t.year = 2026
)
INSERT INTO public.bet_placements (user_id, pick_id, amount, odds_at_placement, requires_admin_review)
SELECT user_id, pick_id, amount, odds_at_placement, requires_admin_review FROM resolved;

COMMIT;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect 8 bettors / 42 placements. Devin Arand must show 3 picks and $8;
-- everyone else 5–6 picks and under their entry fee with room left for
-- Phase 2. over_cap and over_entry must both be 0 everywhere.
SELECT
  u.display_name,
  tp.entry_fee,
  count(*)                                          AS picks,
  sum(p.amount)                                     AS wagered,
  tp.entry_fee - sum(p.amount)                      AS left_for_phase_2,
  sum(p.amount) FILTER (WHERE p.requires_admin_review) AS on_self,
  LEAST(tp.entry_fee / 4, 10)                       AS self_cap,
  count(*) FILTER (WHERE p.amount > LEAST(tp.entry_fee / 2, 20)) AS over_cap,
  (sum(p.amount) > tp.entry_fee)::int               AS over_entry
FROM public.bet_placements p
JOIN public.users u  ON u.id = p.user_id
JOIN public.tournament_participants tp ON tp.user_id = u.id
WHERE p.deleted_at IS NULL
GROUP BY u.display_name, tp.entry_fee
ORDER BY u.display_name;
