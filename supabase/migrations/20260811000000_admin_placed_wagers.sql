-- Admin-placed wagers (Sprint 23 / #101, ADR 0001 §13): let an admin enter a
-- wager on a member's behalf, without ever loosening the member's own policy
-- and without losing track of who actually typed it.
--
-- Two halves: the audit column, and an admin-scoped policy pair.

-- ---------------------------------------------------------------------------
-- Who entered the wager
-- ---------------------------------------------------------------------------

-- The BETTOR stays user_id — that is what the pool math, placement_payouts_view
-- and every compliance read already mean by "whose wager is this", and it must
-- not acquire a second meaning. This records the ACTOR instead.
--
-- NULL = the bettor entered it themselves. That is already the truth for every
-- existing row (no other path existed), so there is nothing to backfill and no
-- retroactive claim being made about history.
--
-- Nullable and additive on purpose: between this migration and the deploy that
-- uses it, the currently-running app inserts without the column and keeps
-- working.
ALTER TABLE public.bet_placements
  ADD COLUMN placed_by_user_id uuid REFERENCES public.users(id);

COMMENT ON COLUMN public.bet_placements.placed_by_user_id IS
  'Admin who last wrote this row on the bettor''s behalf (Sprint 23 / #101). NULL = the bettor placed it themselves. The bettor is always user_id.';

-- Every read that asks "who entered this" filters on non-null, so an index is
-- pointless at 32 participants; the money pages scan the whole tournament
-- anyway.

-- ---------------------------------------------------------------------------
-- RLS: an admin-scoped pair, alongside the member policies
-- ---------------------------------------------------------------------------

-- The member policies from 20260717000001_bet_placements.sql are NOT touched.
-- "Users can place on picks of open bets" still says user_id = auth.uid(), and
-- these new policies do not weaken it — policies are OR'd, and each of these
-- requires public.is_admin() on its own.
--
-- The WITH CHECK clause is the point: placed_by_user_id = auth.uid() means the
-- DATABASE refuses a forged attribution. An admin cannot write a row that
-- claims someone else entered it, so the audit trail does not depend on the
-- route being honest — which is the property a September dispute needs.
--
-- The parent-bet-open EXISTS is copied verbatim from the member policies: an
-- admin gate is permission to act FOR someone, not permission to bet on a bet
-- that isn't open.

CREATE POLICY "Admins can place on behalf of a bettor"
  ON public.bet_placements FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    AND placed_by_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.bet_picks pk
      JOIN public.bets b ON b.id = pk.bet_id
      WHERE pk.id = pick_id AND b.status = 'open'
    )
  );

-- Covers edit, revive AND the admin soft delete — removal is an UPDATE that
-- stamps deleted_at, exactly as it is for members. No deleted_at filter in
-- USING, for the same reason the member policy has none: the soft delete and
-- the revive lookup both have to see the row.
CREATE POLICY "Admins can edit placements they entered on behalf"
  ON public.bet_placements FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    AND EXISTS (
      SELECT 1 FROM public.bet_picks pk
      JOIN public.bets b ON b.id = pk.bet_id
      WHERE pk.id = pick_id AND b.status = 'open'
    )
  )
  WITH CHECK (
    public.is_admin()
    AND placed_by_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.bet_picks pk
      JOIN public.bets b ON b.id = pk.bet_id
      WHERE pk.id = pick_id AND b.status = 'open'
    )
  );

-- Still no DELETE policy anywhere on this table: hard deletes stay blocked for
-- everyone, admins included. Money rows keep their history.
