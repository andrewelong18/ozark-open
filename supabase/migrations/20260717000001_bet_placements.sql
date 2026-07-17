-- bet_placements (Sprint 3, DATA_MODEL §3.7): one row per (user, pick) pair
-- where money was placed. Odds are snapshotted at write time (PRD §7.1) and
-- rows are soft-deleted — money data keeps its history.

CREATE TABLE public.bet_placements (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- No ON DELETE CASCADE on either FK: money rows must never vanish as a
  -- side effect. The importer never deletes picks; a cascading bet delete
  -- stops here, which is the right failure mode for money data.
  user_id                uuid NOT NULL REFERENCES public.users(id),
  pick_id                uuid NOT NULL REFERENCES public.bet_picks(id),
  -- Whole dollars, $1 minimum (PRD §7 rule 3); upper bounds are contextual
  -- and live in lib/validation.ts
  amount                 int NOT NULL CHECK (amount > 0),
  -- Snapshot of the pick's american_odds at write time. Payouts compute from
  -- this, never from the live pick row — a reprice only affects future
  -- placements (PRD §7.1).
  odds_at_placement      int NOT NULL,
  -- Self-pick flag: set on write when the pick's player_user_id is the bettor
  requires_admin_review  boolean NOT NULL DEFAULT false,
  -- Soft delete. Re-placing revives the row (clears deleted_at, updates
  -- amount, re-snapshots odds) so the UNIQUE below holds.
  deleted_at             timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, pick_id)
);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER bet_placements_touch_updated_at
  BEFORE UPDATE ON public.bet_placements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS (DATA_MODEL §5): own rows readable/writable while the parent bet is
-- open; everyone's placements become visible once the bet closes (PRD §12
-- Q11/Q12); admins read everything. Participant-facing reads filter
-- deleted_at IS NULL; the admin read deliberately does not — soft-deleted
-- money rows exist for dispute resolution (§3.7), which is admin work.
ALTER TABLE public.bet_placements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own placements"
  ON public.bet_placements FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND deleted_at IS NULL);

CREATE POLICY "Placements are visible to all once the bet closes"
  ON public.bet_placements FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.bet_picks pk
      JOIN public.bets b ON b.id = pk.bet_id
      WHERE pk.id = pick_id AND b.status = 'closed'
    )
  );

CREATE POLICY "Admins can read all placements"
  ON public.bet_placements FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Users can place on picks of open bets"
  ON public.bet_placements FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.bet_picks pk
      JOIN public.bets b ON b.id = pk.bet_id
      WHERE pk.id = pick_id AND b.status = 'open'
    )
  );

-- One UPDATE policy covers edit, soft delete, and revive: no deleted_at
-- filter in USING, so re-placing can clear deleted_at on an existing row
-- while the bet is still open.
CREATE POLICY "Users can edit own placements while the bet is open"
  ON public.bet_placements FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.bet_picks pk
      JOIN public.bets b ON b.id = pk.bet_id
      WHERE pk.id = pick_id AND b.status = 'open'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.bet_picks pk
      JOIN public.bets b ON b.id = pk.bet_id
      WHERE pk.id = pick_id AND b.status = 'open'
    )
  );

-- No DELETE policy: hard deletes are blocked for everyone — removal is the
-- soft delete above.
