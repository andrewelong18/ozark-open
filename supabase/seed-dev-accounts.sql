-- Dev-only dummy accounts for exercising the Sprint 16 onboarding + approval
-- flow locally. See docs/DEV_TESTING.md for how to use these.
--
-- ⚠️  LOCAL SUPABASE ONLY. This writes rows into auth.users — never run it
--     against a production/hosted project. Apply AFTER the migrations (and
--     ideally after seed-sample-phase1.sql so there's an open bet menu to
--     place on). Idempotent: fixed UUIDs, delete-then-insert, so re-running
--     resets these accounts to their documented state.
--
-- How it works: inserting into auth.users fires the handle_new_user trigger,
-- which creates the matching public.users row (display_name = email,
-- onboarded_at NULL). We then set each account's state. In this seed context
-- auth.uid() is NULL, so guard_users_self_update is bypassed and we can set
-- display_name / onboarded_at / is_admin freely.
--
-- Log in via magic link caught by Inbucket (http://localhost:54324) — enter
-- the email on /login, then click the link in Inbucket. (encrypted_password is
-- also set, so email+password 'devpass' works too if you ever want it.)

DO $$
DECLARE
  -- (email, uuid, is_onboarded, display_name, nickname)
  accounts CONSTANT jsonb := '[
    {"email":"admin@ozark.test",     "id":"d0000000-0000-4000-8000-000000000001", "onboarded":true,  "name":"Admin Ozark",  "nick":"Boss"},
    {"email":"approved@ozark.test",  "id":"d0000000-0000-4000-8000-000000000002", "onboarded":true,  "name":"Avery Approved","nick":null},
    {"email":"nonplayer@ozark.test", "id":"d0000000-0000-4000-8000-000000000003", "onboarded":true,  "name":"Nina Nonplayer","nick":null},
    {"email":"pending@ozark.test",   "id":"d0000000-0000-4000-8000-000000000004", "onboarded":true,  "name":"Parker Pending","nick":"Newbie"},
    {"email":"newbie@ozark.test",    "id":"d0000000-0000-4000-8000-000000000005", "onboarded":false, "name":null,           "nick":null}
  ]'::jsonb;
  acct jsonb;
  uid uuid;
BEGIN
  FOR acct IN SELECT * FROM jsonb_array_elements(accounts) LOOP
    uid := (acct->>'id')::uuid;

    -- Clean slate (cascades to public.users + tournament_participants + identities).
    DELETE FROM auth.users WHERE id = uid;

    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', acct->>'email',
      crypt('devpass', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}',
      now(), now(),
      '', '', '', ''
    );

    -- Email identity so signInWithOtp resolves the account by email.
    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), uid, uid::text,
      jsonb_build_object('sub', uid::text, 'email', acct->>'email', 'email_verified', true),
      'email', now(), now(), now()
    );

    -- handle_new_user created public.users with display_name=email, onboarded_at NULL.
    -- Set the onboarded accounts' identity + stamp; leave 'newbie' as-is (un-onboarded).
    IF (acct->>'onboarded')::boolean THEN
      UPDATE public.users
        SET display_name = acct->>'name',
            nickname     = acct->>'nick',
            onboarded_at = now()
        WHERE id = uid;
    END IF;
  END LOOP;

  -- admin@ is an admin.
  UPDATE public.users SET is_admin = true
    WHERE id = 'd0000000-0000-4000-8000-000000000001';
END $$;

-- Approved participants (existence of the row = approved to bet). pending@ and
-- newbie@ deliberately get NO row. entry_fee within the tournament bounds.
INSERT INTO public.tournament_participants (user_id, tournament_id, entry_fee, is_player)
SELECT v.user_id, t.id, v.entry_fee, v.is_player
FROM (
  VALUES
    ('d0000000-0000-4000-8000-000000000001'::uuid, 40, true),  -- admin@ (also bets)
    ('d0000000-0000-4000-8000-000000000002'::uuid, 30, true),  -- approved@
    ('d0000000-0000-4000-8000-000000000003'::uuid, 20, false)  -- nonplayer@
) AS v (user_id, entry_fee, is_player)
CROSS JOIN (SELECT id FROM public.tournaments WHERE year = 2026) AS t
ON CONFLICT (user_id, tournament_id) DO UPDATE SET
  entry_fee = EXCLUDED.entry_fee,
  is_player = EXCLUDED.is_player;
