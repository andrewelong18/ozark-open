-- Sprint 21 (#91): revoking betting access must not destroy the entry fee.
--
-- Revoke used to be a hard DELETE of the tournament_participants row. But the
-- row carries entry_fee, and entry_fee is a POOL INPUT (lib/payouts.ts
-- poolTotal = Σ entry fees − Σ refunded voided stakes). Placements are
-- soft-deleted and survive a revoke, so a revoked bettor kept wagers in the
-- pool while their fee stopped funding it: every other bettor's payout shifted
-- and nothing on screen looked wrong. Found in the Jul 31 dry run, Act 2.5.
--
-- The fix mirrors bet_placements.deleted_at (20260717000001): the row stays,
-- one nullable timestamp marks it revoked. "Approved to bet" is no longer
-- "a row exists" (PRD §12 A11/A12) but "a row exists AND revoked_at IS NULL" —
-- a refinement recorded in PRD §12 and DATA_MODEL.md.
--
-- A revoked bettor leaves BOTH sides of the arithmetic together: their fee
-- stops funding the pool and their placements stop counting toward the payout
-- denominator (lib/payouts.ts buildResultsTable). No placement row is touched,
-- so re-approving restores the member, their fee and their wagers exactly.
--
-- No new RLS policy is needed: "Admins can write participants"
-- (20260507000001) is FOR ALL, so an admin can already stamp this column, and
-- no policy anywhere reads tournament_participants — the betting gate is
-- application-level.

ALTER TABLE public.tournament_participants
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

COMMENT ON COLUMN public.tournament_participants.revoked_at IS
  'Non-null = betting access revoked. The row and its entry_fee are kept so the fee, the history and the bettor''s wagers all come back on re-approval. Eligibility = row exists AND revoked_at IS NULL.';
