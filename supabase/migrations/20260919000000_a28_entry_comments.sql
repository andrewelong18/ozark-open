-- A28 (Sept 19, 2026): wagering nothing in a phase is never having entered it.
--
-- Comment-only. The rule lives entirely in TypeScript — phaseStanding() in
-- lib/validation.ts — because nothing in the database computes `committed`:
-- enforce_placement_total() (OZ001) and enforce_participant_entry() (OZ002)
-- compare wager totals against the phase entry, and placement_payouts_view is
-- per placement and never sees an entry at all. No policy, grant or function
-- body changes here, so the manifests in supabase/expected-*.txt are untouched.
--
-- What DOES change is what an admin reads in Studio. Two column comments still
-- print the pre-A28 formula verbatim, and migrations are immutable, so the only
-- way to correct them is a new file.

COMMENT ON COLUMN public.tournaments.entry_fee_min IS
  'Lower bound on EACH PHASE''s entry (Sprint 30 / A25). Also the forfeit floor, as amended by A28 (Sept 19, 2026): once a bettor has wagered ANYTHING in the phase, this much of their entry is committed to the pot whether or not it was wagered. A bettor who wagered nothing is treated as never having entered — committed = 0 and the whole entry comes back.';

COMMENT ON COLUMN public.tournament_participants.phase1_entry_fee IS
  'Phase 1 entry in whole dollars, or NULL = not entered in Phase 1. A pool input: C = (W = 0 ? 0 : min(E, max(W, entry_fee_min))) funds the Phase 1 pot (ADR 0002 §2 as amended by PRD §12 A28). Bounds live on tournaments.entry_fee_min/_max and are enforced in app code; the CHECK keeps only what is always true.';

COMMENT ON COLUMN public.tournament_participants.phase2_entry_fee IS
  'Phase 2 entry in whole dollars, or NULL = not entered in Phase 2 — recorded by an admin when the money arrives, never assumed. A pool input: C = (W = 0 ? 0 : min(E, max(W, entry_fee_min))) funds the Phase 2 pot (ADR 0002 §2 as amended by PRD §12 A28).';
