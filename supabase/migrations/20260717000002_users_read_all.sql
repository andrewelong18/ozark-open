-- Sprint 6: closed-bet views show who placed each wager (PRD §12 Q12),
-- and the payout/leaderboard sprints need everyone's names too. The
-- original own-row-only policy left other bettors' display_name
-- unreadable to non-admins, so the closed-bet placement list would
-- render nameless. This is a private ~32-person pool behind login;
-- letting authenticated members read the users table is the intended
-- visibility (docs/DATA_MODEL.md §5).
CREATE POLICY "Authenticated users can read all users"
  ON public.users FOR SELECT
  TO authenticated
  USING (true);
