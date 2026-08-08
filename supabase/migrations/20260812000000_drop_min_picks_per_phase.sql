-- Sprint 22 follow-up (#118): drop the deprecated per-phase pick minimum.
--
-- 20260808000000 replaced this column with min_picks_per_tournament and
-- deliberately left it in place, because Vercel auto-deploys main and the
-- then-current build still selected it. That window is closed: Sprint 22 is
-- merged and live, and nothing in the codebase reads the column any more.
--
-- ORDERING, WHICH IS THE WHOLE HAZARD ON THIS PROJECT. The additive migration
-- had to run BEFORE its code merged; this one is the mirror image and must run
-- AFTER. A deployed build that still selected min_picks_per_phase would start
-- failing the moment this ran — and failing SILENTLY, because the call sites
-- destructure { data } and drop the error, which is exactly how Sprint 21's
-- version of this mistake went unnoticed. So: apply only once the Sprint 22
-- code is live in production. It is (merged Aug 8, 2026; migration #117
-- applied and verified the same day).
--
-- Verified unread before writing this:
--   grep -rn "min_picks_per_phase" --include=*.ts --include=*.tsx .
-- returns nothing but lib/rules.ts's comment saying it is deliberately absent.
-- The only SQL hits are this file and immutable migration history
-- (20260717000000's rename, 20260808000000's copy + deprecation comment),
-- which stay as written — history is not rewritten to match the present.
--
-- NOT A DATA LOSS. 20260808000000 already copied the value into
-- min_picks_per_tournament (SET min_picks_per_tournament = min_picks_per_phase),
-- so the number this column held survives under the new name.

ALTER TABLE public.tournaments
  DROP COLUMN IF EXISTS min_picks_per_phase;
