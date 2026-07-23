-- Sprint 18: player profile modals.
--
-- Adds the descriptive/biographical fields that render in a member's profile
-- modal (opened by clicking their name on /bets and /results). These are
-- ADMIN-owned, exactly like display_name — the member never edits them from
-- /profile. Andrew fills real values in Studio later; this migration seeds
-- dummy copy so every profile renders immediately.
--
--   bio              short blurb / description
--   hometown         "where they're from"
--   member_since     first year in the Ozark Open (chart + header meta)
--   strength         one-line scouting strength
--   weakness         one-line scouting weakness
--   past_performance 4-year stats series for the modal chart, as a JSON array
--                    of { "year": int, "value": number } (most recent last).

ALTER TABLE public.users
  ADD COLUMN bio              text,
  ADD COLUMN hometown         text,
  ADD COLUMN member_since     smallint,
  ADD COLUMN strength         text,
  ADD COLUMN weakness         text,
  ADD COLUMN past_performance jsonb;

-- Seed dummy values for every existing member so the modal has content the
-- moment it ships (Andrew edits these in Studio later). Text is generic
-- placeholder; the 4-year series is derived deterministically from the id so
-- charts differ member-to-member instead of every profile looking identical.
-- The four years end at 2025 (the Ozark Open before the 2026 build).
UPDATE public.users u
SET
  bio = 'Placeholder bio — a few sentences about this member''s Ozark Open history, playing style, and legend. Andrew will replace this with the real thing.',
  hometown = 'Springfield, MO',
  member_since = 2019 + (h % 5),                     -- 2019–2023
  strength = 'Placeholder strength — deadly from inside 100 yards.',
  weakness = 'Placeholder weakness — allergic to the back nine on Sunday.',
  past_performance = jsonb_build_array(
    jsonb_build_object('year', 2022, 'value', 40 + (h % 55)),
    jsonb_build_object('year', 2023, 'value', 40 + ((h / 2) % 55)),
    jsonb_build_object('year', 2024, 'value', 40 + ((h / 3) % 55)),
    jsonb_build_object('year', 2025, 'value', 40 + ((h / 5) % 55))
  )
FROM (
  SELECT id, ('x' || substr(md5(id::text), 1, 4))::bit(16)::int AS h
  FROM public.users
) src
WHERE u.id = src.id
  AND u.bio IS NULL;

-- Keep the new columns admin-owned. Extend the self-update guard so a logged-in
-- non-admin (the /profile flow) can never write any of them — pinned to OLD for
-- every self-serve update, same as id/email/is_admin/created_at. Admins and
-- Studio/service writes (auth.uid() IS NULL) are unaffected. This preserves the
-- Sprint 16 display_name/onboarded_at one-time-set window verbatim.
CREATE OR REPLACE FUNCTION public.guard_users_self_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    NEW.id         := OLD.id;
    NEW.email      := OLD.email;
    NEW.is_admin   := OLD.is_admin;
    NEW.created_at := OLD.created_at;
    -- Sprint 18 profile fields are admin-owned, always.
    NEW.bio              := OLD.bio;
    NEW.hometown         := OLD.hometown;
    NEW.member_since     := OLD.member_since;
    NEW.strength         := OLD.strength;
    NEW.weakness         := OLD.weakness;
    NEW.past_performance := OLD.past_performance;
    IF OLD.onboarded_at IS NOT NULL THEN
      -- Onboarding done: display_name is admin-owned again; the stamp is final.
      NEW.display_name := OLD.display_name;
      NEW.onboarded_at := OLD.onboarded_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
