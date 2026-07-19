-- Sprint 15: self-serve profile fields. Adds a user-settable cosmetic
-- nickname and avatar URL to public.users. display_name stays admin-only
-- (it feeds the importer's name-matching — ADR 0001 §11), so users get a
-- SEPARATE nickname instead of editing their display name.

ALTER TABLE public.users
  ADD COLUMN nickname   text,
  ADD COLUMN avatar_url text;

-- Self-serve UPDATE: a user may update their own row. Column-level protection
-- is the guard trigger below (RLS can't compare OLD vs NEW), so this policy
-- only scopes WHICH row, not which columns.
CREATE POLICY "Users can update own row"
  ON public.users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- A logged-in non-admin (the /profile flow) may change only nickname +
-- avatar_url. Pin everything else so a self-serve update can never rename for
-- import name-matching or self-escalate to admin. Admins (import name-matching
-- runs under an admin session) and Studio/service writes (auth.uid() IS NULL)
-- are unaffected and keep full control.
CREATE OR REPLACE FUNCTION public.guard_users_self_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    NEW.id           := OLD.id;
    NEW.email        := OLD.email;
    NEW.display_name := OLD.display_name;
    NEW.is_admin     := OLD.is_admin;
    NEW.created_at   := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_guard_self_update
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_users_self_update();
