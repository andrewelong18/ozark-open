-- The entry-fee cap, in the database.
--
-- PRD §7 rule 6 says a bettor can never wager more than their entry across
-- both phases, and until now that promise was kept entirely in TypeScript:
-- lib/placement-write.ts reads the bettor's live placements, sums them in
-- lib/validation.ts (validateRunningTotal), and then writes. Read, decide,
-- write — with no lock and no transaction around the three.
--
-- So two concurrent placements on DIFFERENT picks each read a total that does
-- not include the other, each pass, and both land. Nothing in the schema could
-- catch it: the only constraints on bet_placements are CHECK (amount > 0) and
-- UNIQUE (user_id, pick_id), and neither aggregates. On a $20 entry, two $15
-- wagers submitted together leave $30 on the board.
--
-- It is not hypothetical for this tournament. The phase deadline is the moment
-- everyone bets at once, on the same phone, often double-tapping a slow form.
--
-- THE LOCK IS THE WHOLE POINT. Re-summing inside a trigger is NOT enough:
-- under READ COMMITTED neither concurrent transaction can see the other's
-- uncommitted row, so both sums come back short and both pass, exactly as they
-- do in TypeScript. `SELECT ... FOR UPDATE` on the BETTOR'S participant row is
-- what serialises them — the second transaction blocks there until the first
-- commits, then re-reads and sees the row it was missing.
-- scripts/placement-roundtrip.ts runs two genuinely overlapping transactions
-- and asserts exactly one survives.
--
-- The TypeScript check stays. It is the fast, friendly path that produces the
-- error a member actually reads; this is the truth underneath it, and it
-- raises the SAME SENTENCE so a raced write is indistinguishable from a
-- validated one.

CREATE OR REPLACE FUNCTION public.enforce_placement_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tournament uuid;
  v_entry      int;
  v_other      int;
BEGIN
  -- The undo button's escape hatch. scripts/restore-snapshot.ts reproduces a
  -- prior state exactly; it is not this guard's job to re-litigate whether that
  -- state was reachable. A snapshot taken before this migration could hold an
  -- over-cap row from the very race described above, and a guard that refused
  -- to restore it would have broken the one tool that fixes a bad edit.
  IF coalesce(current_setting('ozark.restoring', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  -- A soft delete only ever reduces the total.
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT b.tournament_id INTO v_tournament
    FROM public.bet_picks p
    JOIN public.bets b ON b.id = p.bet_id
   WHERE p.id = NEW.pick_id;

  -- No parent bet: the foreign key is the right thing to complain, not this.
  IF v_tournament IS NULL THEN
    RETURN NEW;
  END IF;

  -- THE LINE THAT MAKES THIS WORK. Also the reason it is SECURITY DEFINER:
  -- a member's RLS view of tournament_participants is not what the cap is
  -- computed from, and a lock that a policy can filter away locks nothing.
  SELECT tp.entry_fee INTO v_entry
    FROM public.tournament_participants tp
   WHERE tp.user_id = NEW.user_id
     AND tp.tournament_id = v_tournament
     AND tp.revoked_at IS NULL
   FOR UPDATE;

  -- No live participant row. ELIGIBILITY IS NOT THIS GUARD'S JOB — the app
  -- refuses an unregistered or revoked bettor with a sentence they can act on
  -- (lib/placement-write.ts), and a trigger that also refused here would turn
  -- that into a raw database error. This is only the cap.
  IF v_entry IS NULL THEN
    RETURN NEW;
  END IF;

  -- Every OTHER live wager of theirs in this tournament. `pl.id <> NEW.id` is
  -- what makes one function serve insert and update alike: column defaults are
  -- applied before BEFORE-ROW triggers fire, so NEW.id is populated either way
  -- — on an insert it simply matches nothing, and on an edit it excludes the
  -- row's own old amount, which would otherwise be double-counted.
  SELECT coalesce(sum(pl.amount), 0) INTO v_other
    FROM public.bet_placements pl
    JOIN public.bet_picks p2 ON p2.id = pl.pick_id
    JOIN public.bets      b2 ON b2.id = p2.bet_id
   WHERE pl.user_id = NEW.user_id
     AND pl.deleted_at IS NULL
     AND b2.tournament_id = v_tournament
     AND pl.id <> NEW.id;

  IF v_other + NEW.amount > v_entry THEN
    -- Word for word validateRunningTotal()'s message (lib/validation.ts), so
    -- the loser of a race reads what the second-slowest tap would have read.
    -- The custom SQLSTATE is how lib/placement-write.ts tells this apart from
    -- a genuine 500; see the mapping there.
    RAISE EXCEPTION 'Over your $% entry — that''s the most you can wager across both phases.', v_entry
      USING ERRCODE = 'OZ001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_placement_total() IS
  'PRD §7 rule 6 as a database guarantee. Locks the bettor''s tournament_participants row FOR UPDATE, then re-sums their live placements in that tournament — the lock, not the sum, is what stops two concurrent writes from both passing. Raises SQLSTATE OZ001 with validateRunningTotal()''s exact sentence. Bypassed while ozark.restoring = on (scripts/restore-snapshot.ts).';

DROP TRIGGER IF EXISTS enforce_placement_total ON public.bet_placements;
CREATE TRIGGER enforce_placement_total
  BEFORE INSERT OR UPDATE ON public.bet_placements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_placement_total();
