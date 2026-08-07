-- Sprint 22 (#96): the pick minimum spans the tournament, not each phase.
--
-- Pat settled this in the Jul 31 dry run, Act 4.17 (OUTSTANDING_DECISIONS, the
-- Jul 31 resolutions table): MINIMUM 5 PICKS ACROSS BOTH PHASES COMBINED,
-- maximum still 10 per phase, and the minimum is only evaluated before Phase 2
-- close. Enforcing the 5 per phase — which is what min_picks_per_phase meant —
-- silently demanded >= 10 picks from anyone who bet in both phases: 5 in Phase
-- 1 and 3 in Phase 2 read as non-compliant. That was never what "5-10 picks"
-- meant, and it contradicts Q2 (the split between phases is the bettor's).
--
-- The maximum keeps its per-phase name because it IS still per phase
-- (validatePhasePickCount is unchanged); only the lower bound moves. So this
-- adds a column rather than renaming one — the asymmetry is the rule.
--
-- WHY ADDITIVE, NOT A RENAME. Vercel auto-deploys main, and this migration is
-- applied to production BEFORE the Sprint 22 code merges (Sprint 21 landed the
-- merge first and prod served code reading a column that did not exist — it
-- failed silently, because the call sites destructure { data } and drop the
-- error). A rename would break the same way in the other direction: the
-- currently-deployed build selects min_picks_per_phase (lib/placements.ts,
-- app/onboarding/page.tsx) and would start failing the moment this ran. Adding
-- a column is safe in either order. min_picks_per_phase is left in place,
-- unread by Sprint 22 code, to be dropped once this sprint is live in prod.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS min_picks_per_tournament int NOT NULL DEFAULT 5;

-- Carry whatever the row actually holds rather than assuming the seeded 5 —
-- the rule parameters are editable data (CLAUDE.md: never hardcode them).
UPDATE public.tournaments
   SET min_picks_per_tournament = min_picks_per_phase;

COMMENT ON COLUMN public.tournaments.min_picks_per_tournament IS
  'PRD §7 rule 2 lower bound: fewest wagered picks across BOTH phases combined. Evaluated only at Phase 2 close, and never blocking (Q3) — admins chase, whatever stands stands.';

COMMENT ON COLUMN public.tournaments.min_picks_per_phase IS
  'DEPRECATED (Sprint 22 / #96) — superseded by min_picks_per_tournament. Kept only so the pre-Sprint-22 deploy keeps reading a live column; drop once Sprint 22 is live in production.';
