-- Sprint 16: first-run onboarding + admin bettor-approval.
--
-- Two things change here, both on public.users:
--   1. A new onboarded_at stamp. NULL = the member logged in but hasn't done
--      the required first-run step yet (set their display name). The middleware
--      forces /onboarding while it's NULL.
--   2. The self-update guard is relaxed to allow ONE self-set of display_name
--      (and the onboarded_at stamp) — but only while onboarded_at IS NULL. Once
--      onboarding is done the name is admin-owned again, because the importer's
--      name-matching (ADR 0001 §11) depends on it. This reopens A11 in a
--      controlled way: the admin verifies/corrects the name at approval time.
--
-- Betting eligibility is unchanged (PRD §12 A11 decision "approval creates the
-- row"): a tournament_participants row existing = approved. No betting_enabled
-- column — that deferred proposal is superseded by the /admin/participants
-- approval page, which is the automated replacement for the manual Studio add.

ALTER TABLE public.users
  ADD COLUMN onboarded_at timestamptz;

-- Existing members already have identities (admin-set names, live placements) —
-- don't yank them into the new flow. Treat everyone pre-migration as onboarded;
-- only logins created after this migration get the required first-run step.
UPDATE public.users
  SET onboarded_at = created_at
  WHERE onboarded_at IS NULL;

-- Relaxed guard: for a logged-in non-admin, always pin id/email/is_admin/
-- created_at. display_name + onboarded_at are pinned too ONCE onboarding is
-- complete (OLD.onboarded_at IS NOT NULL); while it's still NULL the member may
-- set them exactly once (their onboarding write). Admins (import name-matching
-- runs under an admin session) and Studio/service writes (auth.uid() IS NULL)
-- keep full control, as before.
CREATE OR REPLACE FUNCTION public.guard_users_self_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    NEW.id         := OLD.id;
    NEW.email      := OLD.email;
    NEW.is_admin   := OLD.is_admin;
    NEW.created_at := OLD.created_at;
    IF OLD.onboarded_at IS NOT NULL THEN
      -- Onboarding done: display_name is admin-owned again; the stamp is final.
      NEW.display_name := OLD.display_name;
      NEW.onboarded_at := OLD.onboarded_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
