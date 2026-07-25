-- Sprint 10: admin roster & registration status. Two read-only additions in
-- service of /admin/roster.
--
--   1. public.tournament_invites — the EXPECTED roster, typed by an admin in
--      Studio before anyone signs in. Deliberately NOT a nullable-user_id
--      tournament_participants row: PRD §12 A11 / 20260720000000 make "a
--      tournament_participants row exists" mean "approved to bet", and that is
--      what /dashboard, /results and /admin/view compute the pool from. An
--      invite must never reach pool math, so it lives in its own table and
--      links to a member by EMAIL — the whole point is that the users row may
--      not exist yet.
--
--   2. public.admin_auth_activity() — last_sign_in_at out of the auth schema,
--      which is not client-readable. SECURITY DEFINER, self-gated on
--      public.is_admin(), so a non-admin session gets zero rows instead of auth
--      data. No service-role key, no new env var: the anon cookie-backed
--      lib/supabase/server.ts client calls it via .rpc().

CREATE TABLE public.tournament_invites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  email         text NOT NULL CHECK (position('@' IN email) > 1),
  invited_name  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One invite per person per tournament, case-insensitively — these are typed by
-- hand in Studio, so "Dan@X.com" and "dan@x.com" must collide rather than make
-- two roster rows. lib/roster.ts lowercases both sides to agree with this index.
CREATE UNIQUE INDEX tournament_invites_tournament_email_key
  ON public.tournament_invites (tournament_id, lower(email));

-- RLS: admin-only read AND write. Unlike public.users (authenticated read-all
-- since 20260717000002, for names on closed bets), these are addresses of
-- people not in the app yet; the admin chase page is the only consumer.
ALTER TABLE public.tournament_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage invites"
  ON public.tournament_invites FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Returning zero rows rather than raising keeps the failure mode boring: every
-- row just reads "Never". NOTE the `au.` prefixes — in a LANGUAGE sql function
-- the RETURNS TABLE output names behave like parameters, so a bare
-- last_sign_in_at would be ambiguous against auth.users.last_sign_in_at.
CREATE OR REPLACE FUNCTION public.admin_auth_activity()
RETURNS TABLE (user_id uuid, last_sign_in_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT au.id, au.last_sign_in_at
  FROM auth.users au
  WHERE public.is_admin();
$$;

REVOKE ALL ON FUNCTION public.admin_auth_activity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_auth_activity() TO authenticated;
