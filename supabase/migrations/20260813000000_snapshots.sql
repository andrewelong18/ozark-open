-- Sprint 11: bet-state snapshots & rollback.
--
-- The free Supabase tier has no automated backups, no point-in-time recovery
-- and no support ticket that gets the data back. Sprint 9 answered that with
-- scripts/db-export.sh — a thing a human runs at two named moments. This is the
-- automated layer above it, and it is a different tool for a different failure:
--
--   db-export.sh  the building burned down. Rebuild from a folder on disk.
--   snapshots     someone mis-typed one cell, or uploaded last week's sheet.
--                 Roll back five minutes and carry on.
--
-- The second failure is the likely one during a tournament weekend, and until
-- now it had no answer but reconstructing state by hand from memory.
--
-- KEEP IT BORING (the sprint's own words): a snapshot is a JSON dump of whole
-- tables; restore is a script an admin runs. No restore UI, no diffing, no
-- partial rollback, no undo stack.

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------

CREATE TABLE public.snapshots (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Why this snapshot exists. 'pre-import' is the one that will matter in
  -- September: it is taken automatically before every upload applies.
  trigger    text NOT NULL CHECK (trigger IN ('cron', 'manual', 'pre-import')),
  payload    jsonb NOT NULL
);

COMMENT ON TABLE public.snapshots IS
  'Point-in-time dumps of the money tables (Sprint 11). payload is a jsonb object keyed by table name, each an array of whole rows including soft-deleted ones. Restore with scripts/restore-snapshot.ts.';

COMMENT ON COLUMN public.snapshots.payload IS
  'jsonb object: tournaments, tournament_participants, bets, bet_picks, bet_placements — each a full array of to_jsonb(row). Written by public.take_snapshot(); read by scripts/restore-snapshot.ts via jsonb_populate_recordset.';

-- Newest-first is the only way this table is ever read — "what can I roll back
-- to?" and the retention prune both want the same order.
CREATE INDEX snapshots_created_at_idx ON public.snapshots (created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS: admin-only, every operation
-- ---------------------------------------------------------------------------

-- A snapshot payload contains every participant's entry fee and every wager in
-- the tournament, including wagers on bets that are still open — which the
-- bet_placements policies deliberately hide from other members until close
-- (PRD §12 Q11/Q12). So this table is strictly admin-only: a member-readable
-- snapshot would be a side door around the reveal.
ALTER TABLE public.snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage snapshots"
  ON public.snapshots FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- Taking one
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER for one reason: a snapshot has to capture the WHOLE table,
-- and an admin's own session is still subject to RLS. In practice admins can
-- read everything anyway, but leaning on that would make the completeness of a
-- backup depend on the exact shape of a dozen SELECT policies — including any
-- added later. Definer rights make "the payload is every row" true by
-- construction. Same pattern, and the same self-gate, as
-- public.admin_auth_activity() in 20260725000000_tournament_invites.sql.
--
-- The gate is INSIDE the function because SECURITY DEFINER bypasses the RLS
-- policy above; without it, any authenticated session could write a snapshot
-- and then read the response. RAISE rather than return null, so a non-admin
-- caller gets an error instead of a silent no-op it might mistake for success.
--
-- WHY THE GATE IS "auth.uid() IS NOT NULL AND NOT is_admin()" rather than a
-- bare "NOT is_admin()". A caller with a JWT must be an admin — that is the web
-- surface, and it is the one that needs guarding. A caller with NO JWT is a
-- direct database connection: pg_cron, Studio, psql, a migration. Those are
-- already trusted with far more than this, and is_admin() is false for them
-- because auth.uid() is null, so a bare check would lock out the scheduled
-- snapshot this sprint exists to take. This is the same line the self-update
-- guard trigger already draws (DATA_MODEL §3.1: "Studio/service writes
-- (auth.uid() is null) are unaffected").
--
-- An anonymous WEB caller also has a null auth.uid(), and is not let in by
-- this: the REVOKE below means the `anon` role cannot execute the function at
-- all, so it never reaches the gate. EXECUTE is granted only to
-- `authenticated`, and every authenticated request carries a sub.
--
-- to_jsonb(t) rather than a column list: a future migration that adds a column
-- is captured automatically, instead of silently producing snapshots that
-- restore to a subtly older shape. That failure mode is the whole reason
-- db-export.sh has its information_schema guard.
CREATE OR REPLACE FUNCTION public.take_snapshot(
  p_trigger text DEFAULT 'manual',
  p_keep    int  DEFAULT 50
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admins only.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.snapshots (trigger, payload)
  VALUES (
    p_trigger,
    jsonb_build_object(
      'tournaments',
        (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.tournaments t),
      'tournament_participants',
        (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.tournament_participants t),
      'bets',
        (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.bets t),
      'bet_picks',
        (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.bet_picks t),
      -- No deleted_at filter, deliberately. A removed wager is part of the
      -- state being saved; restoring without it would resurrect money the
      -- bettor had taken off the table.
      'bet_placements',
        (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.bet_placements t)
    )
  )
  RETURNING id INTO v_id;

  -- Retention, inline: one delete at snapshot time, as the sprint asks. jsonb
  -- dumps of a 32-person pool are a few hundred KB, so the default is generous
  -- and the caller can raise it. A guard against p_keep <= 0 wiping everything
  -- including the row just written — a typo in an env var should not be able to
  -- destroy the history.
  IF p_keep IS NOT NULL AND p_keep > 0 THEN
    DELETE FROM public.snapshots
    WHERE id IN (
      SELECT id FROM public.snapshots
      ORDER BY created_at DESC, id DESC
      OFFSET p_keep
    );
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.take_snapshot(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.take_snapshot(text, int) TO authenticated;

COMMENT ON FUNCTION public.take_snapshot(text, int) IS
  'Write one snapshot of the five money tables and prune to the newest p_keep. Admin-gated internally (SECURITY DEFINER). Returns the new snapshot id.';

-- ---------------------------------------------------------------------------
-- Scheduling — NOT applied by this migration
-- ---------------------------------------------------------------------------
--
-- Scheduled snapshots run on Supabase's pg_cron, not Vercel Cron (Andrew,
-- Aug 9, 2026). The Vercel route would have had to authenticate a request with
-- no user session, which means a CRON_SECRET plus a SUPABASE_SERVICE_ROLE_KEY
-- in the app's environment — the first service-role key this project has ever
-- held, added for a nightly backup. pg_cron runs inside the database, where the
-- job is already trusted, so the app keeps exactly the credentials it has
-- today. The manual button and the pre-import hook still go through the
-- admin-gated route; only the clock moved.
--
-- Enabling the extension is a dashboard action, so it is NOT in this file —
-- running it here would fail on a local stack that has no pg_cron. Do this once
-- in the Supabase dashboard (Database → Extensions → enable `pg_cron`, then
-- Integrations → Cron, or the SQL editor):
--
--   SELECT cron.schedule(
--     'ozark-snapshot',
--     '0 */6 * * *',                                    -- every 6 hours, UTC
--     $job$ SELECT public.take_snapshot('cron', 50) $job$
--   );
--
-- No wrapper function and no service role is needed: a pg_cron job runs as the
-- role that scheduled it, over a direct connection with no JWT, so auth.uid()
-- is null and the gate above lets it through by design.
--
-- Check it took, and that snapshots are actually accruing:
--
--   SELECT jobid, schedule, active FROM cron.job WHERE jobname = 'ozark-snapshot';
--   SELECT id, created_at, trigger FROM public.snapshots ORDER BY created_at DESC LIMIT 5;
--
-- Changing the interval later is one SQL statement or dashboard edit, never a
-- deploy — which was the point of putting the schedule in config:
--
--   SELECT cron.alter_job(<jobid>, schedule => '0 * * * *');   -- hourly
--
-- During the tournament weekend, hourly is the interval to want; the rest of
-- the year it barely matters, because the pre-import snapshot covers the only
-- moment anything changes.
