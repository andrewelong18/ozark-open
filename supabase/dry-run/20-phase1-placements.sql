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
-- like a real Thursday morning. Since Sprint 30 (ADR 0002) each phase is its
-- own entry and its own pot, so every bulk bettor below lands on EXACTLY
-- their Phase 1 entry with at least 5 picks — complete for Phase 1 — with
-- two deliberate exceptions:
--
--   · Devin Arand has only THREE Phase 1 picks and $8 of a $20 Phase 1 entry
--     — he is the straggler Act 6's chase list must catch. At the close $12
--     of his entry forfeits to the pot (he wagered something, so the first $20
--     is committed), and only $2 of his $5 on himself counts: the self-bet
--     line at close is a quarter of what he actually wagered.
--   · Steve Esswein gets NO placements at all — the "paid the entry, never
--     wagered" control, entered for $50 in Phase 1 only. Since A28 nothing
--     forfeits and the whole $50 comes back, so he finishes Phase 1 dead even.
--     He is on the Phase 1 chase line too, by design: the money is safe, the
--     five picks he owes the group are not.
--
-- Idempotent: clears these bettors' PHASE 1 rows first, in its own statement.
-- (Sprint 21 / #95 — it used to do that in a CTE alongside the INSERT, where
-- the delete is invisible to the insert's snapshot, so a re-run collided on
-- bet_placements_user_id_pick_id_key. Phase 2 wagers are never touched.)
--
-- ── WHY THE SLATE IS A TEMP TABLE AND NOT A CTE (#189) ─────────────────────
--
-- The cleanup used to match `u.email LIKE '%@dryrun.ozark.test'`, which is far
-- wider than the eight bettors this file inserts: it also caught the four
-- HAND-DRIVEN accounts, including newbie@dryrun.ozark.test — Mike Yenzer. So
-- running this after Act 4 silently deleted wagers a human had just placed
-- through the UI. No error, no row count anyone reads, and the verify query at
-- the bottom just shows a smaller number than expected. It bit the Sept 4 dry
-- run for real.
--
-- It was invisible in July because newbie@ had no participant row at Act 3.6
-- and so could not hold a wager. The Sept 4 runbook onboards it as Mike
-- Yenzer, and 25-phase1-handdriven-fallback.sql already assumes that — so the
-- two files disagreed about whether the account is bulk-seeded or hand-driven.
--
-- Materialising the slate first means the DELETE and the INSERT read the SAME
-- list of bettors and cannot drift apart again. It stays its own statement,
-- which is what #95 was about. ON COMMIT DROP keeps re-runs clean.
--
-- scripts/dry-run-verify.sh structurally cannot catch a regression here: it
-- runs against a fresh database with no hand-placed wagers, which is precisely
-- the case where an over-wide predicate is harmless.

BEGIN;

-- Step 0: the slate, materialised — the single source of truth for both the
-- DELETE and the INSERT below.
-- (email, sheet_pick_id, amount). Cross-checked against lib/validation.ts:
-- whole dollars ≥ $1 · amount ≤ the flat $10 max single bet · running Phase 1
-- total ≤ the Phase 1 entry · self-pick total in Phase 1 ≤ a quarter of the
-- Phase 1 entry, floored · one pick per Match/Group Match · never on an
-- opponent. At least 5 picks in the phase, due by its close.
CREATE TEMP TABLE slate (email text, sheet_pick_id int, amount int) ON COMMIT DROP;

INSERT INTO slate (email, sheet_pick_id, amount) VALUES
    -- Garrett Klenke · Phase 1 $20 · self cap $5
    ('garrett.klenke@dryrun.ozark.test',  13, 5),
    ('garrett.klenke@dryrun.ozark.test',  24, 2),   -- self
    ('garrett.klenke@dryrun.ozark.test',  36, 3),   -- self, and his own Match 4 pick
    ('garrett.klenke@dryrun.ozark.test',  39, 4),
    ('garrett.klenke@dryrun.ozark.test',  49, 6),   -- $20 of $20 ✓, self $5/$5 (at cap)

    -- Ethan Kipping · Phase 1 $30 · self cap $7
    ('ethan.kipping@dryrun.ozark.test',   13, 4),   -- self
    ('ethan.kipping@dryrun.ozark.test',   37, 3),   -- self, his own Group Match 5 pick
    ('ethan.kipping@dryrun.ozark.test',    1, 7),
    ('ethan.kipping@dryrun.ozark.test',   24, 6),
    ('ethan.kipping@dryrun.ozark.test',   41, 5),
    ('ethan.kipping@dryrun.ozark.test',   46, 5),   -- $30 of $30 ✓, self $7/$7 (at cap)

    -- Alex Leslie · Phase 1 $40 · self cap $10
    ('alex.leslie@dryrun.ozark.test',     14, 6),   -- self
    ('alex.leslie@dryrun.ozark.test',     38, 4),   -- self, his own Group Match 5 pick
    ('alex.leslie@dryrun.ozark.test',      1, 8),
    ('alex.leslie@dryrun.ozark.test',     36, 7),
    ('alex.leslie@dryrun.ozark.test',     43, 8),
    ('alex.leslie@dryrun.ozark.test',     49, 7),   -- $40 of $40 ✓, self $10/$10 (at cap)

    -- Devin Arand · Phase 1 $20 · THE STRAGGLER: 3 picks, $8 of $20
    ('devin.arand@dryrun.ozark.test',     15, 4),   -- self
    ('devin.arand@dryrun.ozark.test',     39, 1),   -- self, his own Group Match 5 pick
    ('devin.arand@dryrun.ozark.test',     26, 3),

    -- Dustin Scheller · Phase 1 $35 · self cap $8
    ('dustin.scheller@dryrun.ozark.test', 19, 5),   -- self
    ('dustin.scheller@dryrun.ozark.test', 29, 3),   -- self
    ('dustin.scheller@dryrun.ozark.test',  2, 8),
    ('dustin.scheller@dryrun.ozark.test', 35, 7),
    ('dustin.scheller@dryrun.ozark.test', 42, 6),
    ('dustin.scheller@dryrun.ozark.test', 47, 6),   -- $35 of $35 ✓, self $8/$8 (at cap)

    -- Mike Vemmer · Phase 1 $50 · self cap $12 (no hard cap any more)
    ('mike.vemmer@dryrun.ozark.test',     17, 5),   -- self
    ('mike.vemmer@dryrun.ozark.test',     41, 5),   -- self, his own Match 6 pick
    ('mike.vemmer@dryrun.ozark.test',      1, 10),  -- the flat $10 max, exactly
    ('mike.vemmer@dryrun.ozark.test',     24, 10),
    ('mike.vemmer@dryrun.ozark.test',     46, 10),
    ('mike.vemmer@dryrun.ozark.test',     52, 10),  -- $50 of $50 ✓, self $10/$12

    -- Rob Vemmer · Phase 1 $25 · self cap $6 (floor of 6.25)
    ('rob.vemmer@dryrun.ozark.test',      18, 4),   -- self
    ('rob.vemmer@dryrun.ozark.test',      42, 2),   -- self, his own Match 6 pick
    ('rob.vemmer@dryrun.ozark.test',       1, 7),
    ('rob.vemmer@dryrun.ozark.test',      36, 6),
    ('rob.vemmer@dryrun.ozark.test',      44, 6),   -- $25 of $25 ✓, self $6/$6 (at cap)

    -- Andrew Long · Phase 1 $20 · no player link, so no self-picks possible
    ('andrewelong18@gmail.com',            1, 5),
    ('andrewelong18@gmail.com',           24, 4),
    ('andrewelong18@gmail.com',           39, 4),
    ('andrewelong18@gmail.com',           46, 3),
    ('andrewelong18@gmail.com',           49, 4);   -- $20 of $20 ✓

-- Step 1: clear, as its own statement so the INSERT below can see it happen,
-- and scoped to exactly the bettors in the slate — never the hand-driven four.
DELETE FROM public.bet_placements p
 USING public.bet_picks pk, public.bets bt, public.users u
 WHERE p.pick_id = pk.id
   AND pk.bet_id = bt.id
   AND bt.phase = 1
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
-- Expect 8 bettors / 42 placements. Devin Arand must show 3 picks and $8 of
-- $20; everyone else 5–6 picks at exactly their Phase 1 entry. over_single,
-- over_self and over_entry must all be 0 everywhere.
SELECT
  u.display_name,
  tp.phase1_entry_fee                                         AS entry,
  count(*)                                                    AS picks,
  sum(p.amount)                                               AS wagered,
  tp.phase1_entry_fee - sum(p.amount)                         AS short,
  sum(p.amount) FILTER (WHERE p.requires_admin_review)        AS on_self,
  floor(tp.phase1_entry_fee * t.max_self_bet_pct)::int        AS self_cap,
  count(*) FILTER (WHERE p.amount > t.max_single_bet)         AS over_single,
  (coalesce(sum(p.amount) FILTER (WHERE p.requires_admin_review), 0)
     > floor(tp.phase1_entry_fee * t.max_self_bet_pct))::int  AS over_self,
  (sum(p.amount) > tp.phase1_entry_fee)::int                  AS over_entry
FROM public.bet_placements p
JOIN public.bet_picks pk ON pk.id = p.pick_id
JOIN public.bets b       ON b.id = pk.bet_id AND b.phase = 1
JOIN public.tournaments t ON t.id = b.tournament_id
JOIN public.users u      ON u.id = p.user_id
JOIN public.tournament_participants tp ON tp.user_id = u.id AND tp.tournament_id = t.id
WHERE p.deleted_at IS NULL
GROUP BY u.display_name, tp.phase1_entry_fee, t.max_self_bet_pct, t.max_single_bet
ORDER BY u.display_name;
