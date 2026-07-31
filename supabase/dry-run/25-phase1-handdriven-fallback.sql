-- ═══════════════════════════════════════════════════════════════════════════
-- Dry run · FALLBACK — the hand-driven bettors' Phase 1 slates
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️  DO NOT RUN THIS IF THE SESSION IS GOING TO PLAN. ⚠️
--
-- These five slates are meant to be placed BY HAND in the browser during
-- Act 4. That is the only part of the evening that exercises
-- /api/placements, and therefore the only part that tests the §7 rules
-- engine, the two-tap confirm, the error toasts, edit/remove/revive, and the
-- odds receipt. Running this file instead skips all of it.
--
-- Run it only if:
--   · Act 4 has eaten its time box and you need to reach the payout test, or
--   · you are rehearsing the whole lifecycle solo before the session
--     (scripts/dry-run-verify.sh does exactly that).
--
-- It also performs, in SQL, the two identity changes Acts 1 and 2 make by
-- hand — the newbie account onboarding as "Mike Yenzer", and Pat moving from
-- a $20 to a $30 entry — because the wagers below depend on both.
--
-- Run AFTER 20-phase1-placements.sql.

BEGIN;

-- ── Stand in for Act 1 (onboarding) and Act 2 (approval) ───────────────────
-- The newbie picks the display name "Mike Yenzer". That name matches two pick
-- labels in the menu — "Mike Yenzer (-10)" in Group Match - Round 1 and
-- "Mike Yenzer (E)" in Match - Round 3 — so the NEXT import links them. In
-- the live session that link appears in front of Pat, which is the clearest
-- possible demonstration of how pick→player matching works.
UPDATE public.users
   SET display_name = 'Mike Yenzer', onboarded_at = COALESCE(onboarded_at, now())
 WHERE email = 'newbie@dryrun.ozark.test';

INSERT INTO public.tournament_participants (user_id, tournament_id, entry_fee, is_player)
SELECT u.id, t.id, 20, true
  FROM public.users u
 CROSS JOIN (SELECT id FROM public.tournaments WHERE year = 2026) t
 WHERE u.email = 'newbie@dryrun.ozark.test'
    ON CONFLICT (user_id, tournament_id) DO UPDATE SET entry_fee = 20, is_player = true;

-- Act 2 raises Pat from the $20 he was seeded with to $30.
UPDATE public.tournament_participants tp SET entry_fee = 30
  FROM public.users u
 WHERE tp.user_id = u.id AND u.email = 'pleicht17@gmail.com';

-- Re-link the picks now that Mike Yenzer exists, mirroring what the Act 3
-- import does. Only fills NULLs — a hand-set link is never clobbered.
UPDATE public.bet_picks pk SET player_user_id = u.id
  FROM public.users u
 WHERE pk.player_user_id IS NULL
   AND lower(regexp_replace(pk.label, '\s*\((?:E|[+-]?\d+)\)\s*$', '')) = lower(u.display_name);

-- ── The five slates ────────────────────────────────────────────────────────

WITH bettor AS (
  SELECT u.id AS user_id, u.email FROM public.users u
),
slate (email, sheet_pick_id, amount) AS (
  VALUES
    -- Dan Mercer · $40 · max single $20 · self cap $10 (he is the favourite,
    -- so his self-picks are the ones that hit the cap first)
    ('dan.mercer@dryrun.ozark.test',      1, 6),   -- self · Win Tournament
    ('dan.mercer@dryrun.ozark.test',     23, 4),   -- self · Medalist R1 → $10, at the cap
    ('dan.mercer@dryrun.ozark.test',     13, 5),
    ('dan.mercer@dryrun.ozark.test',     39, 3),
    ('dan.mercer@dryrun.ozark.test',     49, 4),
    ('dan.mercer@dryrun.ozark.test',     56, 3),   -- $25 of $40

    -- Jake Kohne · $25 · max single $12 (the FLOOR case) · self cap $6
    ('jake.kohne@dryrun.ozark.test',     10, 2),   -- self · Win Tournament
    ('jake.kohne@dryrun.ozark.test',     43, 4),   -- self via "Jake Kohne (E)" → $6, at the cap
    ('jake.kohne@dryrun.ozark.test',      1, 3),
    ('jake.kohne@dryrun.ozark.test',     24, 3),
    ('jake.kohne@dryrun.ozark.test',     49, 3),   -- $15 of $25

    -- Casey Sideline · $50 NON-PLAYER · max single $20 (the CAP case) ·
    -- exempt from the self-bet rule, and subject to no stricter limit today
    -- (OUTSTANDING_DECISIONS #2 — this slate is the one that raises it)
    ('casey.sideline@dryrun.ozark.test',  1, 10),
    ('casey.sideline@dryrun.ozark.test', 24, 8),
    ('casey.sideline@dryrun.ozark.test', 36, 5),
    ('casey.sideline@dryrun.ozark.test', 39, 5),
    ('casey.sideline@dryrun.ozark.test', 49, 2),   -- $30 of $50

    -- Pat Leicht · $30 · max single $15 · self cap $7
    ('pleicht17@gmail.com',               6, 3),   -- self · Win Tournament
    ('pleicht17@gmail.com',              40, 4),   -- self · his own Group Match pick → $7, at the cap
    ('pleicht17@gmail.com',               1, 5),
    ('pleicht17@gmail.com',              24, 4),
    ('pleicht17@gmail.com',              49, 2),   -- $18 of $30

    -- Mike Yenzer · $20 · the account that onboarded during Act 1
    ('newbie@dryrun.ozark.test',         45, 3),   -- self via "Mike Yenzer (-10)"
    ('newbie@dryrun.ozark.test',          1, 3),
    ('newbie@dryrun.ozark.test',         24, 3),
    ('newbie@dryrun.ozark.test',         13, 2),
    ('newbie@dryrun.ozark.test',         49, 2)    -- $13 of $20
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
  WHERE p.pick_id = pk.id AND pk.bet_id = bt.id AND bt.phase = 1
    AND p.user_id IN (SELECT user_id FROM resolved)
  RETURNING 1
)
INSERT INTO public.bet_placements (user_id, pick_id, amount, odds_at_placement, requires_admin_review)
SELECT user_id, pick_id, amount, odds_at_placement, requires_admin_review FROM resolved;

COMMIT;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Every self-pick should carry requires_admin_review, which is what lights up
-- the flag column on /admin/view.
SELECT u.display_name, count(*) AS picks, sum(p.amount) AS wagered,
       count(*) FILTER (WHERE p.requires_admin_review) AS self_picks
  FROM public.bet_placements p
  JOIN public.users u ON u.id = p.user_id
  JOIN public.bet_picks pk ON pk.id = p.pick_id
  JOIN public.bets b ON b.id = pk.bet_id AND b.phase = 1
 WHERE p.deleted_at IS NULL
 GROUP BY u.display_name ORDER BY u.display_name;
