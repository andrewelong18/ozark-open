-- Sprint 23 / #124: admin-created members. Two changes to public.users, both
-- prerequisites for POST /api/admin/members.
--
--   1. An admin UPDATE policy. There wasn't one.
--   2. created_by_user_id — the account-level audit trail.
--
-- ---------------------------------------------------------------------------
-- 1. "Admins can update any user"
--
-- Until now the ONLY UPDATE policy on public.users was "Users can update own
-- row" (20260719000000_user_profiles.sql), USING (auth.uid() = id). That makes
-- the Sprint 23 / #99 display-name edit a SILENT NO-OP for anyone but the
-- acting admin: RLS filters the row out, the UPDATE matches nothing, PostgREST
-- returns success with no error, and app/api/admin/participants/route.ts
-- answers 200 while the console reports "saved".
--
-- The bug hid because the two things that permit the write are at different
-- layers and only one of them was ever added:
--
--     RLS policy   — decides whether the row is visible to the UPDATE at all
--     guard_users_self_update — a TRIGGER that pins columns a member may not
--                              change, and exempts admins (Sprint 16)
--
-- RLS is evaluated FIRST. The trigger's admin exemption was written expecting a
-- row to reach it; without a policy, none ever did. The route's comment credits
-- the trigger for a write that was never landing.
--
-- Every local harness (local-db-verify.sh, dry-run-verify.sh, the roundtrips)
-- runs SQL as the database superuser, where RLS is bypassed entirely — so a
-- green local run could never have caught this. That gap is filed separately.
--
-- This is NOT a loosening: #99 (admin corrects a typo'd display_name) and #124
-- (admin names the account it just created) are both admin-only operations the
-- app already believes it performs, and display_name is load-bearing —
-- lib/import.ts links picks to people by matching it, so a name the admin
-- cannot fix silently disables that member's self-bet cap, self-pick flag and
-- opponent block (ADR 0001 §11, PRD §12 A10).
--
-- guard_users_self_update still runs after this and still pins id/email/
-- is_admin/created_at for non-admin sessions, so a member's own UPDATE is no
-- more powerful than it was.
CREATE POLICY "Admins can update any user"
  ON public.users FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. created_by_user_id
--
-- Who created this account, when it wasn't the member themselves. Mirrors
-- bet_placements.placed_by_user_id (Sprint 23 / #101, ADR 0001 §13): the
-- column records the ACTOR and never changes whose account it is.
--
-- NULL = self-registered through the magic link, which is the truth for every
-- row written before this migration. NO BACKFILL, for the same reason as
-- placed_by_user_id — there is no retroactive claim being made about history.
--
-- Nullable and un-indexed on purpose: ~32 rows, read only on the admin people
-- console, never joined in the money path.
ALTER TABLE public.users
  ADD COLUMN created_by_user_id uuid REFERENCES public.users(id);

COMMENT ON COLUMN public.users.created_by_user_id IS
  'Sprint 23 / #124 — the admin who created this account via POST /api/admin/members. NULL means the member registered themselves through the magic link.';
