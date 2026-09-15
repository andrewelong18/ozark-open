-- Sprint 30 (ADR 0002, PRD §12 A25): the CONTRACT half of per-phase entries.
--
-- 20260914000000 added phase1_entry_fee / phase2_entry_fee, min_picks_per_phase
-- and the flat max_single_bet beside the columns they replace, and left the old
-- ones in place because Vercel auto-deploys main and the build that was live
-- when it ran still selected them. This migration drops the old columns:
--
--   tournament_participants.entry_fee          → phase1_entry_fee + phase2_entry_fee
--   tournaments.min_picks_per_tournament       → min_picks_per_phase
--   tournaments.max_picks_per_phase            → (no maximum — Pat, Sept 2026)
--   tournaments.max_single_bet_pct             → max_single_bet (flat $10)
--   tournaments.max_single_bet_cap             → max_single_bet (flat $10)
--   tournaments.max_self_bet_cap               → (no hard cap — a quarter of the
--                                                 phase entry, max_self_bet_pct)
--
-- ORDERING, WHICH IS THE WHOLE HAZARD ON THIS PROJECT. The additive migration
-- had to run BEFORE its code merged; this one is the mirror image and must run
-- AFTER. Preconditions, all three:
--
--   1. The Sprint 30 build is live in production (it reads only the new
--      columns), and
--   2. /api/health is green on it — both participants_collection and
--      entry_requests_read, and
--   3. a fresh snapshot has been taken (Snapshot now, on /admin/snapshots).
--
-- Verified unread before writing this: `git grep` for the six names across
-- app/, components/, lib/ and scripts/ finds only derived TypeScript field
-- names (ResultsRow.entry_fee is E1 + E2, never the column), comments, and
-- this sprint's SQL readers, which are rewritten in the same commit. The
-- other migration-history hits are comments; the only function body that
-- read entry_fee, enforce_placement_total(), was replaced by 20260914000000.
--
-- NOT A DATA LOSS, with one caveat. 20260914000000 copied entry_fee into
-- phase1_entry_fee, and min_picks_per_tournament into min_picks_per_phase. The
-- UPDATE below repeats the entry copy for rows an OLD build approved in the
-- window between the two migrations (it wrote entry_fee only). In production
-- the Sprint 30 reset has already cleared every entry, so it matches nothing
-- there. The caveat is SNAPSHOTS: a save state taken before 20260914000000
-- carries entry_fee and no phase columns, and restoring it after this runs
-- brings the participants back with no entries (jsonb_populate_recordset drops
-- keys the table no longer has). docs/DATA_SAFETY.md says so.

-- NOT YET APPLIED TO PRODUCTION. Applied with the Supabase MCP after the Sprint
-- 30 deploy is green — see docs/sprints/sprint-30.md § Rollout.

-- ---------------------------------------------------------------------------
-- 1. Carry any entry an old build recorded after the expand migration
-- ---------------------------------------------------------------------------

UPDATE public.tournament_participants
   SET phase1_entry_fee = entry_fee
 WHERE phase1_entry_fee IS NULL
   AND entry_fee IS NOT NULL
   AND entry_fee > 0;

-- ---------------------------------------------------------------------------
-- 2. Drop the single-entry model
-- ---------------------------------------------------------------------------

ALTER TABLE public.tournament_participants
  DROP COLUMN IF EXISTS entry_fee;

ALTER TABLE public.tournaments
  DROP COLUMN IF EXISTS min_picks_per_tournament,
  DROP COLUMN IF EXISTS max_picks_per_phase,
  DROP COLUMN IF EXISTS max_single_bet_pct,
  DROP COLUMN IF EXISTS max_single_bet_cap,
  DROP COLUMN IF EXISTS max_self_bet_cap;

COMMENT ON COLUMN public.tournaments.max_self_bet_pct IS
  'Self-bet cap as a fraction of the PHASE entry, floored, with no hard cap (Sprint 30 / A25 — "a quarter of your total phase entry"). At close the cap that counts is floor(pct × wagered in the phase); excess self stake stays in the pot and earns nothing (ADR 0002).';
