-- Phase-compliance chase list (Sprint 5, rewritten Sprint 22 / #98, and again
-- for per-phase entries in Sprint 30 / ADR 0002) — the admin compliance view.
--
-- Paste the WHOLE file into the Supabase SQL editor (Dashboard → SQL Editor)
-- before closing each phase to see who to chase. The SQL editor runs as
-- postgres, so RLS doesn't hide other users' rows here. /admin/close shows the
-- same list as a page (lib/chase.ts); this file is the fallback for when the
-- app itself is what's broken, and what a second admin can run without deploy
-- access. If the two ever disagree, THIS file is the one to fix.
--
-- It ends with a one-line "text these people" answer, because that is what
-- gets read on a phone minutes before tee-off. The detail table is the
-- statement above it — if the editor only shows you the last result, select
-- that statement on its own and run it.
--
-- EACH CLOSE IS ITS OWN RECKONING (Sprint 30). Every phase has its own entry
-- and its own pot, so the list covers exactly the people with an entry for the
-- CLOSING phase, and anyone whose standing in it isn't complete needs a text:
--
--   * picks      — fewer than tournaments.min_picks_per_phase in the phase
--   * money      — wagered in the phase isn't exactly the phase entry
--   * self-bets  — money on yourself over floor(max_self_bet_pct × wagered)
--
-- and the reason says what it COSTS if nothing changes, with the same
-- arithmetic as lib/validation.ts phaseStanding():
--
--   committed C = W = 0 ? 0 : min(E, max(W, entry_fee_min))
--                              wagering nothing is never having entered, so
--                              the floor needs a wager behind it (A28)
--   forfeits    = C − W        (the pot keeps it, no wager behind it)
--   comes back  = E − C        (refunded out of band)
--   self counts = min(S, floor(pct × W))   — non-players have no self-bets
--
-- A member with no entry for the closing phase is not chased (they sat it
-- out); the detail table's last statement counts them, because "paid for both
-- phases and only Phase 1 got typed in" is the gap an admin actually hits.
--
-- Compliance is never blocking (Q3): chase stragglers before the close;
-- after that, whatever stands, stands. Only live placements count
-- (deleted_at IS NULL), revoked members are out of both pots, and every
-- threshold reads from the tournaments row.

-- The close itself: the live tournament, its thresholds, and which phase is
-- closing — read off the menu, so there is nothing to edit at 7am on a phone.
-- Phase 2 ships hidden and is revealed only once Phase 1 has closed, so any
-- non-hidden Phase 2 bet means we are at or past that point. To force it by
-- hand, replace the CASE with 1 or 2.
CREATE OR REPLACE TEMP VIEW closing AS
WITH t AS (
  SELECT id, entry_fee_min, min_picks_per_phase, max_self_bet_pct
  FROM public.tournaments
  WHERE status IN ('upcoming', 'active')
  ORDER BY year DESC
  LIMIT 1
)
SELECT
  t.id AS tournament_id,
  t.entry_fee_min,
  t.min_picks_per_phase,
  t.max_self_bet_pct,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.bets b
      WHERE b.tournament_id = t.id AND b.phase = 2 AND b.status <> 'hidden'
    ) THEN 2 ELSE 1
  END AS phase
FROM t;

-- One definition of the standing, read twice below, so the phone line can
-- never disagree with the table.
CREATE OR REPLACE TEMP VIEW compliance_standing AS
WITH entered AS (
  SELECT
    tp.user_id,
    tp.is_player,
    u.display_name,
    CASE c.phase WHEN 1 THEN tp.phase1_entry_fee ELSE tp.phase2_entry_fee END AS entry
  FROM public.tournament_participants tp
  JOIN closing c      ON c.tournament_id = tp.tournament_id
  JOIN public.users u ON u.id = tp.user_id
  -- Revoked bettors aren't chased: they're out of the pots (Sprint 21 / #91).
  WHERE tp.revoked_at IS NULL
),
live AS (
  SELECT
    pl.user_id,
    pl.amount,
    (pk.player_user_id IS NOT NULL AND pk.player_user_id = pl.user_id) AS is_self
  FROM public.bet_placements pl
  JOIN public.bet_picks pk ON pk.id = pl.pick_id
  JOIN public.bets b       ON b.id = pk.bet_id
  JOIN closing c           ON c.tournament_id = b.tournament_id AND c.phase = b.phase
  WHERE pl.deleted_at IS NULL
),
totals AS (
  SELECT
    e.user_id,
    e.display_name,
    e.is_player,
    e.entry,
    COUNT(l.user_id)                                                   AS picks,
    COALESCE(SUM(l.amount), 0)                                         AS wagered,
    -- A non-player has no self-bets to count (Q14 / A15), even hand-linked.
    CASE WHEN e.is_player
         THEN COALESCE(SUM(l.amount) FILTER (WHERE l.is_self), 0)
         ELSE 0 END                                                    AS self_total
  FROM entered e
  LEFT JOIN live l ON l.user_id = e.user_id
  WHERE e.entry IS NOT NULL
  GROUP BY e.user_id, e.display_name, e.is_player, e.entry
),
standing AS (
  SELECT
    totals.*,
    c.phase                                                            AS closing_phase,
    c.min_picks_per_phase                                              AS min_picks,
    CASE WHEN totals.wagered = 0 THEN 0
         ELSE LEAST(totals.entry, GREATEST(totals.wagered, c.entry_fee_min))
    END                                                                AS committed,
    LEAST(totals.self_total, floor(c.max_self_bet_pct * totals.wagered)::int) AS self_recognized
  FROM totals CROSS JOIN closing c
)
SELECT
  s.display_name,
  s.entry,
  s.picks,
  s.min_picks,
  s.wagered,
  s.committed,
  GREATEST(0, s.committed - s.wagered)                                 AS forfeits,
  GREATEST(0, s.entry - s.committed)                                   AS comes_back,
  s.self_total,
  s.self_recognized,
  s.wagered > s.entry                                                  AS over_entry,
  NOT (s.picks >= s.min_picks
       AND s.wagered = s.entry
       AND s.self_total = s.self_recognized)                           AS needs_a_text,
  s.closing_phase
FROM standing s;

-- The detail: everyone entered in the closing phase, people who need a text on
-- top, the ones whose shortfall costs money first.
SELECT
  needs_a_text,
  display_name,
  entry,
  picks,
  wagered,
  forfeits,
  comes_back,
  self_total,
  self_recognized,
  over_entry,
  closing_phase
FROM compliance_standing
ORDER BY needs_a_text DESC, (forfeits > 0 OR wagered = 0) DESC, display_name;

-- Approved members with NO entry for the closing phase — not chased, counted.
SELECT count(*) AS approved_but_not_entered_in_closing_phase
FROM public.tournament_participants tp
JOIN closing c ON c.tournament_id = tp.tournament_id
WHERE tp.revoked_at IS NULL
  AND CASE c.phase WHEN 1 THEN tp.phase1_entry_fee ELSE tp.phase2_entry_fee END IS NULL;

-- The phone line — word for word what /admin/close shows (lib/chase.ts).
SELECT
  'Closing Phase ' ||
  COALESCE(MAX(closing_phase)::text, '?') ||
  COALESCE(
    ' — text these people: ' ||
    string_agg(
      display_name || ' (' ||
        CONCAT_WS(
          ', ',
          CASE WHEN wagered <> entry THEN '$' || wagered || ' of $' || entry END,
          CASE WHEN picks < min_picks THEN picks || ' of ' || min_picks || ' picks' END
        ) ||
        COALESCE(
          ' → ' || NULLIF(
            CONCAT_WS(
              ', ',
              CASE WHEN forfeits > 0 THEN '$' || forfeits || ' forfeits' END,
              CASE WHEN comes_back > 0 THEN '$' || comes_back || ' comes back' END,
              CASE WHEN self_total > self_recognized
                   THEN 'only $' || self_recognized || ' of $' || self_total || ' on themselves counts' END,
              CASE WHEN over_entry THEN 'over their entry' END
            ),
            ''
          ),
          ''
        ) ||
      ')',
      ', ' ORDER BY (forfeits > 0 OR wagered = 0) DESC, display_name
    ) FILTER (WHERE needs_a_text),
    ' — nobody to chase, everyone entered is complete.'
  ) AS chase_list
FROM compliance_standing;
