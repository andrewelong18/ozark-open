-- Sprint 25 (#106, #107): the tournament's clock moves into the app.
--
-- Until now a phase closed when an admin flipped every one of its bets to
-- `closed` in the spreadsheet and re-uploaded — at a tee box, on a phone,
-- minutes before Round 1. The Jul 31 dry run found the two costs: it has to be
-- done by hand at the worst possible moment, and nothing else in the app knows
-- when a phase ends, so the dashboard badge and the countdown both guess (the
-- badge read "Betting Open" over an empty menu — #107).
--
-- WHAT THIS IS NOT. It is not a scheduler. There is no cron, no job runner, no
-- background process, and nothing here ever writes bets.status — the
-- spreadsheet upload remains that column's only writer (ADR 0001 §5a). A phase
-- "closes itself" because every read compares now() to a stored timestamp:
--
--   wagering allowed  <=>  bet.status = 'open' AND its phase's deadline hasn't passed
--
-- Three properties fall out of that, and they are the reason for this shape:
--   * A sheet that says `open` after the deadline cannot reopen betting. The
--     upload only ever opens a bet; the clock only ever closes a phase. They
--     are different fields, so they can't fight — and the admin's upload isn't
--     silently reverted either.
--   * The blast radius is one row instead of thirteen, so the countdown and the
--     dashboard read the same source of truth rather than each re-deriving
--     "is betting open" from every bet row and disagreeing.
--   * A close is reversible, because it's a timestamp and not a mutation. Push
--     the deadline out or clear it and the phase reopens with no bet row to
--     reconstruct. Closing early is the same operation with the deadline set
--     to now.
--
-- NULL means "no deadline" — the phase never closes on the clock, which is the
-- pre-Sprint-25 behaviour and the safe default for any tournament row that
-- isn't 2026.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS phase1_closes_at timestamptz,
  ADD COLUMN IF NOT EXISTS phase2_closes_at timestamptz,
  ADD COLUMN IF NOT EXISTS show_countdown boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.tournaments.phase1_closes_at IS
  'Phase 1 wagering deadline. Betting needs bets.status = open AND now() < this. NULL = no deadline (never closes on the clock). Admin-editable; closing early = setting it to now(), reopening = pushing it out.';

COMMENT ON COLUMN public.tournaments.phase2_closes_at IS
  'Phase 2 wagering deadline. Same semantics as phase1_closes_at.';

COMMENT ON COLUMN public.tournaments.show_countdown IS
  'Whether members see the countdown to the next phase deadline. Admin toggle (#106) — the countdown is the only warning a phase is about to close, since notifications are out of scope.';

-- The 2026 deadlines: Round 1 and Round 3 tee-off, 11:00 America/Chicago.
-- Sept 24 2026 is a Thursday and Sept 26 a Saturday (verified against the
-- calendar). Written with the zone name rather than a fixed offset so the
-- stored instant is correct regardless of how DST is reckoned that week.
UPDATE public.tournaments
   SET phase1_closes_at = timestamptz '2026-09-24 11:00:00 America/Chicago',
       phase2_closes_at = timestamptz '2026-09-26 11:00:00 America/Chicago'
 WHERE year = 2026;
