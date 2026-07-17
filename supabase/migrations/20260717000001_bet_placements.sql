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
