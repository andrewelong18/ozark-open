-- Sprint 30 (ADR 0002, PRD §12 A25): entries and pots are per phase.
--
-- Pat, after the Sept 4 user test: "Phases 1 and 2 are now more separated.
-- $20 minimum and $50 maximum for each phase. 5 bet minimum for each phase, no
-- maximum. Phase 1 and Phase 2 will now become separate pots. […] Simplify
-- maximum single bet to $10. Simplify maximum total bet on yourself to a
-- quarter of your total phase entry."
--
-- Until now one entry_fee funded both phases, and most testers spent all of it
-- in Phase 1 — legal, and it left them nothing for Phase 2 and no way to reach
-- the pick minimum. This migration is the ADDITIVE half of the change (expand →
-- migrate → contract, per 20260812000000_drop_min_picks_per_phase.sql):
--
--   * two nullable per-phase entries on tournament_participants, Phase 1
--     backfilled from entry_fee, Phase 2 NULL — nobody owes Phase 2 money until
--     an admin records it;
--   * min_picks_per_phase and a flat max_single_bet on tournaments;
--   * two trailing columns on placement_payouts_view (phase, is_self_pick);
--   * enforce_placement_total() re-summing PER PHASE;
--   * a new enforce_participant_entry() that refuses to lower an entry below
--     what is already wagered in that phase.
--
-- APPLY THIS BEFORE THE SPRINT 30 CODE DEPLOYS. The old code keeps working on
-- top of it (it reads entry_fee, which stays — nullable — until
-- 20260914000002 drops it after the deploy). The new code reads only the new
-- columns, so a deploy that outruns this migration fails /api/health by name.
--
-- NULL means "not entered in that phase". Eligibility to wager in a phase is a
-- live participant row (revoked_at IS NULL) AND a non-null entry for that
-- phase; the app refuses the rest with a sentence, the trigger below only
-- enforces the cap.

-- ---------------------------------------------------------------------------
-- 1. tournament_participants: one entry per phase
-- ---------------------------------------------------------------------------

ALTER TABLE public.tournament_participants
  ADD COLUMN IF NOT EXISTS phase1_entry_fee int CHECK (phase1_entry_fee > 0),
  ADD COLUMN IF NOT EXISTS phase2_entry_fee int CHECK (phase2_entry_fee > 0);

-- Backfill: the old single entry becomes the Phase 1 entry. Idempotent, and a
-- no-op on a row the Sprint 30 rollout has already reset.
UPDATE public.tournament_participants
   SET phase1_entry_fee = entry_fee
 WHERE phase1_entry_fee IS NULL
   AND entry_fee IS NOT NULL;

-- The old column stays until the code that reads it is gone (20260914000002).
-- Nullable from here on so the new code, which never writes it, can still
-- insert a participant row.
ALTER TABLE public.tournament_participants
  ALTER COLUMN entry_fee DROP NOT NULL;

COMMENT ON COLUMN public.tournament_participants.phase1_entry_fee IS
  'Phase 1 entry in whole dollars, or NULL = not entered in Phase 1. A pool input (C = min(E, max(W, entry_fee_min)) funds the Phase 1 pot — ADR 0002). Bounds live on tournaments.entry_fee_min/_max and are enforced in app code; the CHECK keeps only what is always true.';
COMMENT ON COLUMN public.tournament_participants.phase2_entry_fee IS
  'Phase 2 entry in whole dollars, or NULL = not entered in Phase 2. Same semantics as phase1_entry_fee; recorded by an admin when the money arrives, never assumed.';
COMMENT ON COLUMN public.tournament_participants.entry_fee IS
  'RETIRED (Sprint 30). The pre-per-phase single entry; kept nullable until 20260914000002 drops it. Nothing in the app reads it after Sprint 30.';

-- ---------------------------------------------------------------------------
-- 2. tournaments: the rule parameters that changed shape
-- ---------------------------------------------------------------------------

-- min_picks_per_phase: an older column of this name was dropped by
-- 20260812000000 (#118) when the minimum moved to the tournament. It moves
-- back — Pat's rules are per phase now — so IF NOT EXISTS is load-bearing on a
-- database that never took that drop.
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS min_picks_per_phase int NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_single_bet int NOT NULL DEFAULT 10;

-- Carry the configured minimum across; the tournament-wide column is dropped
-- by 20260914000002.
UPDATE public.tournaments
   SET min_picks_per_phase = min_picks_per_tournament;

COMMENT ON COLUMN public.tournaments.min_picks_per_phase IS
  'Fewest wagered picks IN EACH PHASE a bettor is entered in (PRD §7 rule 2, Sprint 30 / A25). Never blocking — the chase list and the warnings read it. No maximum any more.';
COMMENT ON COLUMN public.tournaments.max_single_bet IS
  'The flat per-placement cap in whole dollars (PRD §7 rule 4, Sprint 30 / A25) — "simplify maximum single bet to $10". Replaces max_single_bet_pct/_cap, which 20260914000002 drops.';
COMMENT ON COLUMN public.tournaments.entry_fee_min IS
  'Lower bound on EACH PHASE''s entry (Sprint 30 / A25). Also the forfeit floor: wagered money under it is still committed to the pot.';
COMMENT ON COLUMN public.tournaments.entry_fee_max IS
  'Upper bound on EACH PHASE''s entry (Sprint 30 / A25).';
COMMENT ON COLUMN public.tournaments.max_self_bet_pct IS
  'Share of the PHASE entry a bettor may have on themselves at placement time, floored, with no hard cap (Sprint 30 / A25). At close only pct × what was actually wagered is recognised — lib/payouts.ts.';

-- ---------------------------------------------------------------------------
-- 3. placement_payouts_view: which pot, and whether it is a self pick
-- ---------------------------------------------------------------------------

-- CREATE OR REPLACE may only APPEND columns to a view, so the two new ones go
-- last. Everything above them is byte-for-byte 20260718000000.
CREATE OR REPLACE VIEW public.placement_payouts_view
WITH (security_invoker = on) AS
SELECT
    p.id                 AS placement_id,
    p.user_id,
    pk.id                AS pick_id,
    pk.bet_id,
    p.amount,
    pk.result,
    p.odds_at_placement,
    b.tournament_id,
    CASE
        WHEN pk.result = 'hit' AND p.odds_at_placement > 0
            THEN p.amount + (p.amount * p.odds_at_placement / 100.0)
        WHEN pk.result = 'hit' AND p.odds_at_placement < 0
            THEN p.amount + (p.amount * 100.0 / ABS(p.odds_at_placement))
        WHEN pk.result = 'push'
            THEN p.amount
        WHEN pk.result IN ('miss', 'void')
            THEN 0
        WHEN pk.result = 'pending'
            THEN NULL  -- not yet resolved
    END AS theoretical_payout,
    CASE
        WHEN pk.result = 'void' THEN p.amount
        ELSE 0
    END AS refunded_stake,
    -- Sprint 30: the pot this wager belongs to, and whether the bettor is the
    -- pick's own player (the self-bet recognition at close, ADR 0002). A
    -- non-player never matches — no pick carries their name (PRD §12 A15).
    b.phase              AS phase,
    (pk.player_user_id IS NOT NULL AND pk.player_user_id = p.user_id)
                         AS is_self_pick
FROM public.bet_placements p
JOIN public.bet_picks pk ON pk.id = p.pick_id
JOIN public.bets b       ON b.id  = pk.bet_id
WHERE p.deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4. enforce_placement_total(): the cap, per phase
-- ---------------------------------------------------------------------------
--
-- Same shape as 20260902000001 — the lock is still the whole point, and it is
-- still the bettor's participant row, which both phases share. What changes is
-- which entry is read and which wagers are summed: the bet's phase decides
-- both. Two concurrent placements in DIFFERENT phases both lock the row,
-- serialise, and each re-sums only its own phase.

CREATE OR REPLACE FUNCTION public.enforce_placement_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tournament uuid;
  v_phase      int;
  v_entry      int;
  v_other      int;
BEGIN
  -- The undo button's escape hatch (scripts/restore-snapshot.ts and
  -- public.restore_snapshot()): a restore reproduces a state that already
  -- existed, and this guard does not re-litigate it.
  IF coalesce(current_setting('ozark.restoring', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  -- A soft delete only ever reduces the total.
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT b.tournament_id, b.phase INTO v_tournament, v_phase
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
  SELECT CASE v_phase WHEN 1 THEN tp.phase1_entry_fee ELSE tp.phase2_entry_fee END
    INTO v_entry
    FROM public.tournament_participants tp
   WHERE tp.user_id = NEW.user_id
     AND tp.tournament_id = v_tournament
     AND tp.revoked_at IS NULL
   FOR UPDATE;

  -- No live participant row, or not entered in this phase. ELIGIBILITY IS NOT
  -- THIS GUARD'S JOB — the app refuses an unregistered, revoked or un-entered
  -- bettor with a sentence they can act on (lib/placement-write.ts), and a
  -- trigger that also refused here would turn that into a raw database error.
  -- This is only the cap.
  IF v_entry IS NULL THEN
    RETURN NEW;
  END IF;

  -- Every OTHER live wager of theirs in this tournament AND THIS PHASE.
  -- `pl.id <> NEW.id` is what makes one function serve insert and update
  -- alike: column defaults are applied before BEFORE-ROW triggers fire, so
  -- NEW.id is populated either way — on an insert it matches nothing, on an
  -- edit it excludes the row's own old amount.
  SELECT coalesce(sum(pl.amount), 0) INTO v_other
    FROM public.bet_placements pl
    JOIN public.bet_picks p2 ON p2.id = pl.pick_id
    JOIN public.bets      b2 ON b2.id = p2.bet_id
   WHERE pl.user_id = NEW.user_id
     AND pl.deleted_at IS NULL
     AND b2.tournament_id = v_tournament
     AND b2.phase = v_phase
     AND pl.id <> NEW.id;

  IF v_other + NEW.amount > v_entry THEN
    -- Word for word validateRunningTotal()'s message (lib/validation.ts), so
    -- the loser of a race reads what the second-slowest tap would have read.
    -- SQLSTATE OZ001 is how lib/placement-write.ts tells this apart from a
    -- genuine 500.
    RAISE EXCEPTION 'Over your $% Phase % entry — that''s the most you can wager in Phase %.',
      v_entry, v_phase, v_phase
      USING ERRCODE = 'OZ001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_placement_total() IS
  'PRD §7 rule 6 as a database guarantee, PER PHASE since Sprint 30 (ADR 0002). Locks the bettor''s tournament_participants row FOR UPDATE, reads the entry for the bet''s phase, then re-sums their live placements in that tournament and phase — the lock, not the sum, is what stops two concurrent writes from both passing. NULL entry = not entered, and eligibility is the app''s job. Raises SQLSTATE OZ001 with validateRunningTotal()''s exact sentence. Bypassed while ozark.restoring = on.';

-- ---------------------------------------------------------------------------
-- 5. enforce_participant_entry(): an entry can't drop below what is wagered
-- ---------------------------------------------------------------------------
--
-- The other side of the same race. PATCH /api/admin/participants reads the
-- bettor's wagered total, decides, and writes the new entry — with no lock,
-- which is exactly the read-decide-write A18 warned about. A $10 placement can
-- commit between the read and the write, and the row ends up at $20 wagered
-- against a $10 entry. Under one pot that was rare; under two, entries are
-- edited mid-tournament (Phase 2 money arrives Friday night), so it is not.
--
-- The UPDATE already holds the row lock, and enforce_placement_total() takes
-- the same row FOR UPDATE, so the two serialise in both orders: placement
-- first, and this re-sum sees it after the commit; entry first, and the
-- placement re-reads the lowered entry. No lock ordering hazard — both take
-- the participant row first and only READ bet_placements.

CREATE OR REPLACE FUNCTION public.enforce_participant_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_phase   int;
  v_new     int;
  v_old     int;
  v_wagered int;
BEGIN
  IF coalesce(current_setting('ozark.restoring', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  FOREACH v_phase IN ARRAY ARRAY[1, 2] LOOP
    v_new := CASE v_phase WHEN 1 THEN NEW.phase1_entry_fee ELSE NEW.phase2_entry_fee END;

    -- Only a CHANGE to a phase's entry is judged. A row already over its entry
    -- (a Studio edit, a restore) must stay editable in every other column, or
    -- an admin could not even record a payment against it.
    IF TG_OP = 'UPDATE' THEN
      v_old := CASE v_phase WHEN 1 THEN OLD.phase1_entry_fee ELSE OLD.phase2_entry_fee END;
      IF v_new IS NOT DISTINCT FROM v_old THEN
        CONTINUE;
      END IF;
    END IF;

    SELECT coalesce(sum(pl.amount), 0) INTO v_wagered
      FROM public.bet_placements pl
      JOIN public.bet_picks p ON p.id = pl.pick_id
      JOIN public.bets      b ON b.id = p.bet_id
     WHERE pl.user_id = NEW.user_id
       AND pl.deleted_at IS NULL
       AND b.tournament_id = NEW.tournament_id
       AND b.phase = v_phase;

    IF v_wagered > coalesce(v_new, 0) THEN
      -- app/api/admin/participants/route.ts maps SQLSTATE OZ002 to a 400 with
      -- this sentence, so a raced edit reads like a validated one.
      RAISE EXCEPTION 'Can''t set the Phase % entry to % — they already have $% wagered in Phase %. Remove those wagers first.',
        v_phase,
        CASE WHEN v_new IS NULL THEN 'nothing' ELSE '$' || v_new END,
        v_wagered,
        v_phase
        USING ERRCODE = 'OZ002';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_participant_entry() IS
  'Sprint 30 (ADR 0002): a phase entry may not be set below the bettor''s live wagers in that phase. Judged only on a CHANGED entry column, so a row already over its entry stays editable elsewhere. The UPDATE''s own row lock serialises against enforce_placement_total()''s FOR UPDATE. Raises SQLSTATE OZ002. Bypassed while ozark.restoring = on.';

DROP TRIGGER IF EXISTS enforce_participant_entry ON public.tournament_participants;
CREATE TRIGGER enforce_participant_entry
  BEFORE INSERT OR UPDATE OF phase1_entry_fee, phase2_entry_fee
  ON public.tournament_participants
  FOR EACH ROW EXECUTE FUNCTION public.enforce_participant_entry();
