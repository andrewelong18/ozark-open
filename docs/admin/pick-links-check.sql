-- Pick → golfer link check (Sept 24, 2026) — READ-ONLY, safe to paste anytime.
--
-- Every pick carries bet_picks.player_user_id: "this pick IS this golfer".
-- That one column drives the opponent block (PRD §7 rule 8), the self-bet cap
-- (rule 5), the self-pick flag, and which profile opens when someone taps the
-- name on a pick. When it is wrong nothing errors — the bet just stops being
-- policed, or polices the wrong person.
--
-- The importer sets it by matching the pick label (stroke suffix stripped —
-- the same regex as lib/pick-label.ts) against users.display_name, and ONLY
-- at upload time. So two things break it:
--
--   * WRONG   — the label names one golfer and the link points at another.
--               How Sept 23 happened: a re-upload put the real field into
--               pick_ids the placeholder sheet had used for the early
--               accounts, and the importer kept the old link because the new
--               name had no account yet (fixed in lib/import.ts the same day).
--   * MISSING — the golfer has an account now, but signed up after the last
--               upload, so their picks link to nobody.
--
-- Run this before every upload that opens a phase, and after any late
-- sign-ups. Both lists should be empty; "Field", "Yes"/"No" and golfers with
-- no account are expected to be unlinked and are not listed.
--
-- To fix what it finds: re-uploading the same sheet relinks every name that
-- now has an account. docs/admin/pick-links-repair.sql does the same in SQL
-- when an upload isn't practical. A golfer whose display name differs from
-- the sheet ("DonH" vs "Don Harris") is fixed on /admin/people, not here.

WITH picks AS (
  SELECT pk.id, pk.sheet_pick_id, pk.label, pk.player_user_id,
         b.phase, b.sheet_bet_id, b.title, b.status,
         lower(trim(regexp_replace(pk.label, '\s*\((E|[+-]?\d+)\)\s*$', '', 'i'))) AS name_key
  FROM public.bet_picks pk
  JOIN public.bets b ON b.id = pk.bet_id
),
judged AS (
  SELECT p.*,
         named.id            AS named_user_id,
         linked.display_name AS linked_to,
         CASE
           WHEN p.player_user_id IS NOT NULL
                AND p.player_user_id IS DISTINCT FROM named.id
                AND lower(trim(linked.display_name)) <> p.name_key THEN 'WRONG'
           WHEN p.player_user_id IS NULL AND named.id IS NOT NULL   THEN 'MISSING'
         END AS problem
  FROM picks p
  LEFT JOIN public.users named  ON lower(trim(named.display_name)) = p.name_key
  LEFT JOIN public.users linked ON linked.id = p.player_user_id
)
SELECT j.problem, j.phase, j.sheet_bet_id, j.title, j.status,
       j.sheet_pick_id, j.label, j.linked_to,
       (SELECT count(*) FROM public.bet_placements bp
         WHERE bp.pick_id = j.id AND bp.deleted_at IS NULL) AS live_wagers
FROM judged j
WHERE j.problem IS NOT NULL
ORDER BY j.problem, j.phase, j.sheet_bet_id, j.sheet_pick_id;

-- The one-line answer. Both zeros = every pick that names a golfer with an
-- account points at that golfer.
WITH picks AS (
  SELECT pk.player_user_id,
         lower(trim(regexp_replace(pk.label, '\s*\((E|[+-]?\d+)\)\s*$', '', 'i'))) AS name_key
  FROM public.bet_picks pk
)
SELECT
  count(*) FILTER (WHERE p.player_user_id IS NOT NULL
                     AND p.player_user_id IS DISTINCT FROM named.id
                     AND lower(trim(linked.display_name)) <> p.name_key) AS wrong_links,
  count(*) FILTER (WHERE p.player_user_id IS NULL AND named.id IS NOT NULL) AS missing_links
FROM picks p
LEFT JOIN public.users named  ON lower(trim(named.display_name)) = p.name_key
LEFT JOIN public.users linked ON linked.id = p.player_user_id;
