-- Phase-compliance chase list (Sprint 5) — the admin compliance view.
--
-- Paste into the Supabase SQL editor (Dashboard → SQL Editor) before closing
-- each phase to see who to chase, exactly as Pat does today by text. The SQL
-- editor runs as postgres, so RLS doesn't hide other users' rows here.
--
-- Semantics mirror lib/validation.ts (§8.1 phase-close checks):
--   * under_phase_minimum — fewer than tournaments.min_picks_per_phase picks
--     in a phase the participant bet in. Phases with zero placements are
--     fine (PRD §12 Q2) and don't flag.
--   * off_exact_total — total wagered across both phases isn't exactly the
--     entry fee. Legitimate while betting is still open; it must be exact by
--     Phase 2 close (PRD §7 rule 6).
--
-- Compliance is never blocking (Q3): chase stragglers before the close;
-- after that, whatever stands, stands. Only live placements count
-- (deleted_at IS NULL), and every threshold reads from the tournaments row.

WITH t AS (
  SELECT id, min_picks_per_phase
  FROM public.tournaments
  WHERE status IN ('upcoming', 'active')
  ORDER BY year DESC
  LIMIT 1
),
live AS (
  SELECT pl.user_id, pl.amount, b.phase
  FROM public.bet_placements pl
  JOIN public.bet_picks pk ON pk.id = pl.pick_id
  JOIN public.bets b       ON b.id = pk.bet_id
  JOIN t                   ON t.id = b.tournament_id
  WHERE pl.deleted_at IS NULL
)
SELECT
  u.display_name,
  tp.entry_fee,
  COUNT(live.user_id) FILTER (WHERE live.phase = 1)      AS phase1_picks,
  COUNT(live.user_id) FILTER (WHERE live.phase = 2)      AS phase2_picks,
  COALESCE(SUM(live.amount), 0)                          AS total_wagered,
  tp.entry_fee - COALESCE(SUM(live.amount), 0)           AS remaining,
  (COUNT(live.user_id) FILTER (WHERE live.phase = 1)
     BETWEEN 1 AND t.min_picks_per_phase - 1)
  OR
  (COUNT(live.user_id) FILTER (WHERE live.phase = 2)
     BETWEEN 1 AND t.min_picks_per_phase - 1)            AS under_phase_minimum,
  COALESCE(SUM(live.amount), 0) <> tp.entry_fee          AS off_exact_total
FROM public.tournament_participants tp
JOIN t ON t.id = tp.tournament_id
JOIN public.users u ON u.id = tp.user_id
LEFT JOIN live ON live.user_id = tp.user_id
GROUP BY u.display_name, tp.entry_fee, t.min_picks_per_phase
ORDER BY under_phase_minimum DESC, off_exact_total DESC, u.display_name;
