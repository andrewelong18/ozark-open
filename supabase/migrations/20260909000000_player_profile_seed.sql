-- Sprint 26: the real player profiles, and a seed that applies itself.
--
-- Sprint 18 (20260723000000_player_profiles.sql) shipped the profile modal
-- against placeholder copy — every member read "Springfield, MO" and a fake
-- 4-year series derived from their user id. Andrew has now written the real
-- thing for all 27 players: hometown, first Ozark Open, a one-line strength
-- and weakness, a bio, and their FINISHING PLACE for 2022–2025.
--
-- Two shape changes ride along:
--
--   past_performance is now [{ "year": int, "place": text }] — a PLACE, not a
--   score. Ties keep the sheet's own string ("T15"), lower is better, and a
--   year the member didn't play is simply absent (the modal suppresses it,
--   and suppresses the whole section for a member with no places at all).
--
--   The copy lives in player_profile_seed, keyed by lower(display_name), and
--   a trigger copies it onto the users row whenever a matching display_name
--   is set. Only 7 of the 27 players had accounts when this was written; the
--   other 20 register between now and the tournament, and their profile has
--   to arrive with them rather than in a script someone remembers to re-run.

CREATE TABLE public.player_profile_seed (
  name_key         text PRIMARY KEY,   -- lower(trim(display_name))
  hometown         text,
  member_since     smallint,
  strength         text,
  weakness         text,
  bio              text,
  past_performance jsonb
);

COMMENT ON TABLE public.player_profile_seed IS
  'Admin-owned profile copy keyed by lower(trim(display_name)). Applied to '
  'public.users by the users_seed_player_profile trigger. Edit here (or in '
  'Studio) to change what a not-yet-registered player''s profile will say.';

-- Nothing in the app reads this table — the trigger is SECURITY DEFINER and
-- the app only ever sees the copied values on the users row. RLS on with no
-- policy for `authenticated` is therefore the whole access story.
ALTER TABLE public.player_profile_seed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage the profile seed"
  ON public.player_profile_seed FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- The roster, as written. Corrections applied on the way in, agreed with
-- Andrew: the place columns are authoritative, so a member_since or a bio
-- that contradicted them was fixed (Chase Rowland's first year, and the years
-- named in the Evan Shippee / Garrett Klenke / Hayden Schiller / Jake Kohne
-- bios). Everything else is verbatim from the sheet.
-- ---------------------------------------------------------------------------

INSERT INTO public.player_profile_seed
  (name_key, hometown, member_since, strength, weakness, bio, past_performance)
VALUES
  ('alex leslie', 'Union, MO', 2022, 'Vapes', 'Bonfires',
   'Union, MO native and back-to-back Ozark Open champion (2022, 2023) with strong early finishes.',
   '[{"year": 2022, "place": "1"}, {"year": 2023, "place": "1"}, {"year": 2024, "place": "2"}, {"year": 2025, "place": "6"}]'),
  ('andrew long', 'Austin, TX', 2022, 'Video editing', 'Talking to women',
   'Austin, TX resident and Ozark Open competitor since 2022, consistently placing in the back of the field.',
   '[{"year": 2022, "place": "18"}, {"year": 2023, "place": "18"}, {"year": 2024, "place": "T15"}, {"year": 2025, "place": "15"}]'),
  ('austin davis', 'SOCO, MO', 2022, 'Retard energy', 'Vocabulary words',
   'SOCO, MO resident and Ozark Open competitor since 2022, seeing lower finishes in recent years.',
   '[{"year": 2022, "place": "T9"}, {"year": 2023, "place": "T15"}, {"year": 2024, "place": "19"}, {"year": 2025, "place": "21"}]'),
  ('ben perdue', 'Your Mom''s House', 2023, 'Hitting the ball in the water', 'Drag shows',
   'Ozark Open competitor since 2023, finishing 10th in his debut year.',
   '[{"year": 2023, "place": "10"}]'),
  ('brendan nulsen', 'Gulf of America', 2022, 'Swimming', 'Boiling pot of water on the stove',
   'Gulf of America resident and Ozark Open competitor since 2022, consistently placing in the back of the field after a top-10 debut.',
   '[{"year": 2022, "place": "T9"}, {"year": 2023, "place": "20"}, {"year": 2024, "place": "18"}, {"year": 2025, "place": "19"}]'),
  ('chase rowland', 'The Jungle', 2022, 'Swinging from trees', 'Shoes',
   'The Jungle resident and Ozark Open competitor since 2022.',
   '[{"year": 2022, "place": "T7"}, {"year": 2023, "place": "14"}, {"year": 2024, "place": "12"}]'),
  ('dale price', 'Union, MO', 2026, 'Slicing into incoming traffic', 'Big booty black bitches',
   'Union, MO native set to make his Ozark Open debut in 2026.',
   NULL),
  ('dan mercer', 'Union, MO', 2024, 'Organizing side bets', 'Cock',
   'Union, MO native and 2025 Ozark Open champion who joined in 2024.',
   '[{"year": 2024, "place": "T8"}, {"year": 2025, "place": "1"}]'),
  ('derek mercer', 'Union, MO', 2026, '1ft putts', 'Black cock',
   'Union, MO native set to make his Ozark Open debut in 2026.',
   NULL),
  ('devin arand', 'Union, MO', 2023, 'Taking a lot of dick', 'Gay Pride Parades',
   'Union, MO native and consistent top-10 finisher in the Ozark Open since joining in 2023.',
   '[{"year": 2023, "place": "2"}, {"year": 2024, "place": "T6"}, {"year": 2025, "place": "4"}]'),
  ('don harris', 'Up Your Ass', 2026, 'Chunking tee shots', 'Drinking three Mike''s Hard lemonades',
   'New member set to make his Ozark Open debut in 2026.',
   NULL),
  ('dustin scheller', 'Flavortown, USA', 2023, 'BBQ', 'Leftovers',
   'Flavortown, USA native and Ozark Open member since 2023 with a strength in BBQ and consistent top-10 finishes.',
   '[{"year": 2023, "place": "8"}, {"year": 2024, "place": "4"}, {"year": 2025, "place": "7"}]'),
  ('ethan kipping', 'Waterloo, IL', 2022, 'Large ass cheeks', 'Having smaller muscles than Pat',
   'Waterloo, IL native and 2024 Ozark Open champion with consistent top-4 finishes since joining in 2022.',
   '[{"year": 2022, "place": "T3"}, {"year": 2023, "place": "4"}, {"year": 2024, "place": "1"}, {"year": 2025, "place": "3"}]'),
  ('evan shippee', 'Olathe, KS', 2025, 'Golf prophet dark arts', 'Ripsticks',
   'Olathe, KS native who joined in 2025, known for golf prophet dark arts and a 13th-place finish in 2025.',
   '[{"year": 2025, "place": "13"}]'),
  ('garrett klenke', 'Union, MO', 2024, 'Exploring his sexuality', 'Coming in almost first place',
   'Union, MO native and member since 2024 with impressive top-3 finishes in 2024 and 2025.',
   '[{"year": 2024, "place": "3"}, {"year": 2025, "place": "2"}]'),
  ('hayden schiller', 'Union, MO', 2024, 'Comprehensive dildo collection', 'Midget porn',
   'Union, MO native who joined in 2024 and competed in the 2024 and 2025 Ozark Open tournaments.',
   '[{"year": 2024, "place": "T15"}, {"year": 2025, "place": "18"}]'),
  ('jake kohne', 'SOCO, MO', 2022, 'Committee oversight', 'Gambling',
   'SOCO, MO native and member since 2022 providing committee oversight, with a top-10 finish every year since.',
   '[{"year": 2022, "place": "6"}, {"year": 2023, "place": "3"}, {"year": 2024, "place": "10"}, {"year": 2025, "place": "10"}]'),
  ('joey suntrup', 'The Porta Potty', 2022, 'Having a peaceful spirit', 'Banging his sister in the matrix',
   'Member since 2022 with consistent tournament appearances across every Ozark Open from 2022 to 2025.',
   '[{"year": 2022, "place": "16"}, {"year": 2023, "place": "17"}, {"year": 2024, "place": "14"}, {"year": 2025, "place": "16"}]'),
  ('justin hendrix', 'Playing Guitar at Woodstock', 2026, 'Perfomring the National Anthem', 'Drugs and alcohol',
   'New member joining in 2026, known as Jimi Hendrix''s long lost brother playing guitar at Woodstock.',
   NULL),
  ('kyle getman', 'Fucking Your Bitch', 2023, 'Peptides', 'Salty nuts in his mouth',
   'Member since 2023 with solid back-to-back performances including 6th place in 2023 and tied for 6th in 2024.',
   '[{"year": 2023, "place": "6"}, {"year": 2024, "place": "T6"}]'),
  ('matt jackson', 'Bozeman, MT', 2026, 'Carrying kegs on his back', 'Call of Duty lobbies',
   'Bozeman, MT native and new member joining the Ozark Open in 2026.',
   NULL),
  ('mike cimo', 'SOCO, MO', 2023, 'Being the president', 'Being taller than his son',
   'SOCO, MO native and member since 2023 with consistent appearances in the Ozark Open.',
   '[{"year": 2023, "place": "9"}, {"year": 2024, "place": "11"}, {"year": 2025, "place": "12"}]'),
  ('mike yenzer', 'Washington, MO', 2024, 'Litigation', 'A nice crispy beer',
   'Washington, MO native who joined in 2024 and competed in the 2024 and 2025 Ozark Open tournaments.',
   '[{"year": 2024, "place": "13"}, {"year": 2025, "place": "17"}]'),
  ('pat leicht', 'St. Louis, MO', 2022, 'Cash flow', 'Quad banger repairs',
   'St. Louis, MO native and member since 2022 with strong results including a runner-up finish in 2022 and three straight 5th-place finishes.',
   '[{"year": 2022, "place": "2"}, {"year": 2023, "place": "5"}, {"year": 2024, "place": "5"}, {"year": 2025, "place": "5"}]'),
  ('steve esswein', 'St. Louis, MO', 2025, 'Hacking the mainframe', 'Hosting Christmas parties',
   'St. Louis, MO native who joined in 2025 and recorded a 20th-place finish in his Ozark Open debut.',
   '[{"year": 2025, "place": "20"}]'),
  ('steve jones', 'San Diego, CA', 2022, 'Tickling buttholes', 'Matt Eshelman''s cock',
   'San Diego, CA native and member since 2022, featuring a tied-3rd finish in 2022 and strong top-10 performance in 2023.',
   '[{"year": 2022, "place": "T3"}, {"year": 2023, "place": "7"}, {"year": 2025, "place": "11"}]'),
  ('tj johnson', 'St. Louis, MO', 2026, 'S&T Miner pride', 'Fat bitches in Rolla',
   'St. Louis, MO native and new member joining the Ozark Open in 2026.',
   NULL);

-- ---------------------------------------------------------------------------
-- Apply the seed whenever a display_name lands on a users row
-- ---------------------------------------------------------------------------
--
-- Fires on INSERT and on any UPDATE that touches display_name, which covers
-- every path a real name arrives by: onboarding (the member types it), an
-- admin renaming someone on /admin/people, and POST /api/admin/members.
-- Signup itself inserts display_name = email, which matches nothing.
--
-- Writes NEW rather than issuing a second UPDATE, so there's no recursion.
--
-- TRIGGER NAME IS LOAD-BEARING. Postgres fires BEFORE triggers in name order,
-- and users_guard_self_update (Sprint 18) pins all six of these columns to OLD
-- for a non-admin self-update. "users_s…" sorts after "users_g…", so this runs
-- second and wins. That ordering is the point: onboarding IS a non-admin
-- self-update, and it's the moment most members' names first arrive. The guard
-- still does its job — the values written here come from an admin-owned table,
-- never from anything the member typed.
CREATE OR REPLACE FUNCTION public.apply_player_profile_seed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  seed public.player_profile_seed%ROWTYPE;
BEGIN
  SELECT * INTO seed
  FROM public.player_profile_seed
  WHERE name_key = lower(trim(NEW.display_name));

  IF FOUND THEN
    NEW.hometown         := seed.hometown;
    NEW.member_since     := seed.member_since;
    NEW.strength         := seed.strength;
    NEW.weakness         := seed.weakness;
    NEW.bio              := seed.bio;
    NEW.past_performance := seed.past_performance;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER users_seed_player_profile
  BEFORE INSERT OR UPDATE OF display_name ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.apply_player_profile_seed();

-- ---------------------------------------------------------------------------
-- Backfill: the accounts that already exist
-- ---------------------------------------------------------------------------

UPDATE public.users u
SET
  hometown         = s.hometown,
  member_since     = s.member_since,
  strength         = s.strength,
  weakness         = s.weakness,
  bio              = s.bio,
  past_performance = s.past_performance
FROM public.player_profile_seed s
WHERE lower(trim(u.display_name)) = s.name_key;

-- Everyone the seed doesn't cover keeps Sprint 18's placeholder copy and its
-- fake {year, value} series, which the modal can no longer read anyway. Clear
-- it: an empty profile is honest, a made-up one isn't. Scoped to the exact
-- seeded strings so a real profile entered by hand in Studio survives.
UPDATE public.users u
SET
  bio        = CASE WHEN u.bio LIKE 'Placeholder bio —%' THEN NULL ELSE u.bio END,
  strength   = CASE WHEN u.strength LIKE 'Placeholder strength —%' THEN NULL ELSE u.strength END,
  weakness   = CASE WHEN u.weakness LIKE 'Placeholder weakness —%' THEN NULL ELSE u.weakness END,
  hometown   = CASE WHEN u.hometown = 'Springfield, MO' THEN NULL ELSE u.hometown END,
  member_since = NULL,
  past_performance = NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.player_profile_seed s
  WHERE s.name_key = lower(trim(u.display_name))
)
-- Only rows still carrying the Sprint 18 seed. A member whose profile was
-- written by hand has none of these markers and is left alone.
AND (
  u.bio LIKE 'Placeholder bio —%'
  OR u.strength LIKE 'Placeholder strength —%'
  OR u.weakness LIKE 'Placeholder weakness —%'
  OR u.hometown = 'Springfield, MO'
);
