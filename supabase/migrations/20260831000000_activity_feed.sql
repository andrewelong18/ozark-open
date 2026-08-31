-- Dashboard activity feed: the two things the feed needs from the database.
--
-- The feed is a timeline of three event kinds — someone placed a bet, a phase
-- opened or closed, and a house quip. Only the first two touch the database,
-- and only one of them needs anything new stored.
--
-- WHAT THE FEED IS ALLOWED TO SAY, because it is the whole design constraint:
-- a member's NAME and the TIME they placed. Never the pick, the amount, the
-- odds, or the bet. PRD §8 gates (participant, pick, amount) together behind a
-- bet closing, and COMPETITIVE_ANALYSIS §2.4 scoped this feature as
-- "counts/anonymized before close, full detail after". Naming the bettor while
-- withholding the position is the agreed refinement of that line (PRD §12); the
-- position half is not negotiable and this migration is where it is enforced.

-- ---------------------------------------------------------------------------
-- 1. bets.opened_at — a timestamp for "Phase N is open"
-- ---------------------------------------------------------------------------

-- A phase-open event needs a moment to sit at in the timeline, and no column
-- carried one. created_at is the wrong answer for Phase 2: those bets ship
-- `hidden` in early uploads (PRD §8) and are upserted by sheet_bet_id, so the
-- row keeps the created_at it got weeks before it actually opened.
--
-- Written by the importer, and only on a transition into `open` (lib/import.ts
-- already diffs status when planning). An upload that leaves a bet open does
-- not re-stamp it, so the value is the FIRST time the bet was seen open — which
-- is what the phase's opening moment is derived from.
--
-- NULL means "never observed opening": bets that have only ever been hidden,
-- and any bet that closed before this migration shipped. The feed emits no
-- phase-open event rather than inventing one.
ALTER TABLE public.bets
  ADD COLUMN IF NOT EXISTS opened_at timestamptz;

COMMENT ON COLUMN public.bets.opened_at IS
  'First time this bet was seen with status = open, stamped by the importer on the transition only (never re-stamped). Source of the activity feed''s "Phase N is open" event. NULL = never observed opening.';

-- Backfill what can be known: a bet that is open right now opened at some point
-- at or after it was created, and created_at is the only evidence available.
-- For Phase 1 — created and opened in the same upload — that is exact.
UPDATE public.bets
   SET opened_at = created_at
 WHERE status = 'open'
   AND opened_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. activity_placements() — who placed, and when, and nothing else
-- ---------------------------------------------------------------------------

-- This function exists because RLS makes the feed impossible without it, which
-- is the system working as designed. bet_placements is readable three ways
-- (supabase/expected-policies.txt): your own rows, an admin's read-all, and
-- everyone's rows once the parent bet CLOSES. A plain query from a member's
-- session during an open phase therefore returns their own wagers and nothing
-- else — the feed would show you only yourself.
--
-- SECURITY DEFINER lifts that, so the column list below is the only thing
-- standing between this feature and the hidden-until-close model:
--
--   *** NEVER ADD pick_id, amount, odds_at_placement, placed_by_user_id, OR
--   *** ANY JOIN THAT REVEALS WHICH BET A ROW BELONGS TO. Adding a column here
--   *** is not a convenience — it publishes every member's position mid-phase
--   *** and biases the pool. If a caller needs more than this, the answer is
--   *** that it waits for the bet to close, where the existing policy already
--   *** serves the full row.
--
-- Shape, gate and grants follow public.admin_auth_activity()
-- (20260725000000_tournament_invites.sql): STABLE, definer-rights, an internal
-- gate rather than a trusted caller, EXECUTE revoked from anon.
--
-- display_name and avatar_url are joined rather than looked up separately
-- because public.users has been authenticated-read-all since
-- 20260717000002_users_read_all.sql (names on closed bets) — so the join
-- exposes nothing a second query wouldn't, and saves the round trip.
--
-- On-behalf wagers surface as the BETTOR (user_id), never the admin who typed
-- them (ADR 0001 §13). placed_by_user_id is an audit field, not feed content.
--
-- NOTE the p./u. prefixes: in a LANGUAGE sql function the RETURNS TABLE output
-- names behave like parameters, so a bare `id` or `created_at` would be
-- ambiguous against the columns being selected.
CREATE OR REPLACE FUNCTION public.activity_placements(
  p_tournament_id uuid,
  p_limit         int DEFAULT 40
)
RETURNS TABLE (
  id           uuid,
  user_id      uuid,
  display_name text,
  avatar_url   text,
  created_at   timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.user_id, u.display_name, u.avatar_url, p.created_at
    FROM public.bet_placements p
    JOIN public.bet_picks     pk ON pk.id = p.pick_id
    JOIN public.bets          b  ON b.id  = pk.bet_id
    JOIN public.users         u  ON u.id  = p.user_id
   WHERE b.tournament_id = p_tournament_id
     -- A removed wager leaves the feed with it. Soft-deleted rows are money
     -- history (§3.7), not activity, and "X removed a bet" is exactly the kind
     -- of position signal this feature does not carry.
     AND p.deleted_at IS NULL
     -- The gate, inside the function because definer rights bypass the policies
     -- above. `anon` cannot execute this at all (see the REVOKE), so this is the
     -- belt to that suspenders: a JWT-less caller is a direct database
     -- connection — Studio, psql, a migration — which is trusted with more than
     -- this already, but gets nothing here either.
     AND auth.uid() IS NOT NULL
   ORDER BY p.created_at DESC, p.id DESC
   -- Clamped rather than trusted: the limit arrives from a query string.
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 40), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.activity_placements(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activity_placements(uuid, int) TO authenticated;

COMMENT ON FUNCTION public.activity_placements(uuid, int) IS
  'Activity feed source: the bettor and the moment, for live (non-deleted) placements in one tournament. Returns NO pick, amount, odds or bet — the hidden-until-close model (PRD §8) depends on that column list staying exactly as it is.';
