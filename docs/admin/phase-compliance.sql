-- Phase-compliance chase list (Sprint 5, rewritten Sprint 22 / #98) — the
-- admin compliance view.
--
-- Paste the WHOLE file into the Supabase SQL editor (Dashboard → SQL Editor)
-- before closing each phase to see who to chase, exactly as Pat does today by
-- text. The SQL editor runs as postgres, so RLS doesn't hide other users'
-- rows here.
--
-- It ends with a one-line "TEXT THESE PEOPLE" answer, because that is what
-- gets read on a phone minutes before tee-off. The detail table is the
-- statement above it — if the editor only shows you the last result, select
-- that statement on its own and run it.
--
-- It is PHASE-AWARE, because the two §8.1 completeness rules come due at
-- different moments. At Phase 1 close this used to flag 13 of 14 people on
-- off_exact_total and bury the one real straggler — everyone is legitimately
-- short of their entry fee while Phase 2 hasn't opened yet.
--
--   Before closing PHASE 1 — chase: fewer picks than the minimum so far.
--     Nobody can have hit their exact total yet, so that column is shown for
--     information and is never a reason to text anyone.
--   Before closing PHASE 2 — chase: under the minimum OR off the exact total.
--     This is the last moment either can be fixed.
--
-- Semantics mirror lib/validation.ts:
--   * under_minimum — fewer than tournaments.min_picks_per_tournament wagered
--     picks ACROSS BOTH PHASES (Sprint 22 / #96 — the minimum spans the
--     tournament; only the maximum is per phase). Someone with zero
--     placements never flags here: putting everything in one phase is
--     explicitly allowed (PRD §12 Q2), and a bettor who never wagers is
--     caught by off_exact_total instead.
--   * off_exact_total — total wagered across both phases isn't exactly the
--     entry fee. Must be exact by Phase 2 close (PRD §7 rule 6).
--
-- Compliance is never blocking (Q3): chase stragglers before the close;
-- after that, whatever stands, stands. Only live placements count
-- (deleted_at IS NULL), and every threshold reads from the tournaments row.

-- One definition, read twice below, so the phone line can never disagree with
-- the table. TEMP = session-scoped and gone when the tab closes; this file
-- changes no schema and writes no data.
CREATE OR REPLACE TEMP VIEW compliance_standing AS
WITH t AS (
  SELECT id, min_picks_per_tournament
  FROM public.tournaments
  WHERE status IN ('upcoming', 'active')
  ORDER BY year DESC
  LIMIT 1
),
-- Which close this is, read off the menu itself so there is nothing to edit
-- at 7am on a phone. Phase 2 ships hidden and is revealed only once Phase 1
-- has closed, so any non-hidden Phase 2 bet means we are at or past that
-- point. To force it by hand, replace the CASE with `SELECT 1` or `SELECT 2`.
close_phase AS (
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.bets b JOIN t ON t.id = b.tournament_id
      WHERE b.phase = 2 AND b.status <> 'hidden'
    ) THEN 2 ELSE 1
  END AS phase
),
live AS (
  SELECT pl.user_id, pl.amount, b.phase
  FROM public.bet_placements pl
  JOIN public.bet_picks pk ON pk.id = pl.pick_id
  JOIN public.bets b       ON b.id = pk.bet_id
  JOIN t                   ON t.id = b.tournament_id
  WHERE pl.deleted_at IS NULL
),
standing AS (
  SELECT
    u.display_name,
    tp.entry_fee,
    t.min_picks_per_tournament                         AS min_picks,
    COUNT(live.user_id) FILTER (WHERE live.phase = 1)  AS phase1_picks,
    COUNT(live.user_id) FILTER (WHERE live.phase = 2)  AS phase2_picks,
    COUNT(live.user_id)                                AS total_picks,
    COALESCE(SUM(live.amount), 0)                      AS total_wagered,
    tp.entry_fee - COALESCE(SUM(live.amount), 0)       AS remaining,
    COUNT(live.user_id)
      BETWEEN 1 AND t.min_picks_per_tournament - 1     AS under_minimum,
    COALESCE(SUM(live.amount), 0) <> tp.entry_fee      AS off_exact_total
  FROM public.tournament_participants tp
  JOIN t ON t.id = tp.tournament_id
  -- Revoked bettors aren't chased: they're out of the pool (Sprint 21 / #91).
  AND tp.revoked_at IS NULL
  JOIN public.users u ON u.id = tp.user_id
  LEFT JOIN live ON live.user_id = tp.user_id
  GROUP BY u.display_name, tp.entry_fee, t.min_picks_per_tournament
)
SELECT
  standing.*,
  close_phase.phase AS closing_phase,
  standing.under_minimum
    OR (close_phase.phase = 2 AND standing.off_exact_total) AS needs_a_text
FROM standing CROSS JOIN close_phase;

-- The detail: everyone's standing, people who need a text on top.
SELECT
  needs_a_text,
  display_name,
  entry_fee,
  phase1_picks,
  phase2_picks,
  total_picks,
  total_wagered,
  remaining,
  under_minimum,
  off_exact_total,
  closing_phase
FROM compliance_standing
ORDER BY needs_a_text DESC, under_minimum DESC, off_exact_total DESC, display_name;

-- The phone line. "Nobody" is a valid and common answer at Phase 1 close.
SELECT
  'Closing Phase ' ||
  COALESCE(MAX(closing_phase)::text, '?') ||
  ' — TEXT THESE PEOPLE: ' ||
  COALESCE(
    string_agg(
      display_name || ' (' ||
        CONCAT_WS(
          ', ',
          CASE WHEN under_minimum
               THEN total_picks || ' of ' || min_picks || ' picks' END,
          CASE WHEN closing_phase = 2 AND off_exact_total
               THEN '$' || total_wagered || ' of $' || entry_fee END
        ) ||
      ')',
      ', ' ORDER BY display_name
    ) FILTER (WHERE needs_a_text),
    'nobody — everyone is compliant'
  ) AS chase_list
FROM compliance_standing;
