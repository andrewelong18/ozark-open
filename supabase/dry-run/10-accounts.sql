-- ═══════════════════════════════════════════════════════════════════════════
-- Dry run · step 1 — the simulated pool
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Creates twelve simulated accounts so one evening with two people can
-- exercise a ~15-person pari-mutuel pool. Run AFTER 00-reset.sql and BEFORE
-- the Act 3 spreadsheet upload.
--
-- ── WHY THE NAMES MATTER (this is the whole trick) ─────────────────────────
--
-- Three of the §7 rules — self-pick flagging, the self-bet cap, and the
-- opponent hard-block — only fire when a bet_picks row is LINKED to a user.
-- That link is made at import time by name-matching: lib/import.ts strips a
-- stroke suffix from the pick label ("Jake Kohne (E)" → "Jake Kohne") and
-- matches it case-insensitively against users.display_name.
--
-- So these accounts are deliberately named after golfers who already appear
-- in the sample menu. Create them first, then upload the sheet, and
-- player_user_id populates across the menu — which is what makes rules 5, 7
-- and 8 testable at all. Production today has only ONE matched name (Pat),
-- which is why almost none of the money rules have ever been exercised.
--
-- lib/import.ts:594 is `matchedUserId ?? existing?.player_user_id ?? null` —
-- a newly-matched name fills a NULL link, but a hand-set link is never
-- clobbered.
--
-- ── WHY THE ENTRY FEES ARE ALL DIFFERENT ───────────────────────────────────
--
-- Since Sprint 30 (ADR 0002) every member has an entry PER PHASE, and each
-- phase is its own pot. The max single bet is a flat $10 at every entry; what
-- still varies with the entry is the self-bet cap, a quarter of the phase
-- entry, floored, with no hard cap (lib/validation.ts maxSelfBet). The
-- spread of Phase 1 entries below picks out the boundaries:
--
--   $20 entry → max on yourself $5
--   $25 entry → max on yourself $6    ← the floor test: 25% of 25 is 6.25 → $6
--   $30 entry → max on yourself $7    ← floors again
--   $35 entry → max on yourself $8
--   $40 entry → max on yourself $10
--   $50 entry → max on yourself $12   ← no $10 hard cap any more
--
-- Phase 2 entries are mostly the $20 minimum, with Dan at $30 and Mike Vemmer
-- at $50 — Mike is Pat's own worked example in Phase 2 (see 30-).
--
-- ── SAFETY ─────────────────────────────────────────────────────────────────
--
-- Every address is @dryrun.ozark.test — a reserved TLD that can never receive
-- real mail, and deliberately NOT the @ozark.test domain used by
-- supabase/seed-dev-accounts.sql, so teardown can never catch a dev account.
-- These are real login-able accounts; 90-teardown.sql removes them.
--
-- Idempotent: fixed UUIDs, delete-then-insert.

BEGIN;

DO $$
DECLARE
  -- onboarded=false leaves the account un-onboarded so the middleware forces
  -- it through /onboarding. fee1 and fee2 both null means NO participant row
  -- → the account can browse but not bet (that row's existence is the
  -- betting gate, A12). fee1/fee2 are the Phase 1 and Phase 2 entries.
  accounts CONSTANT jsonb := '[
    {"email":"dan.mercer@dryrun.ozark.test",     "id":"f0000000-0000-4000-8000-000000000001", "onboarded":true,  "name":"Dan Mercer",      "fee1":40, "fee2":30, "player":true},
    {"email":"jake.kohne@dryrun.ozark.test",     "id":"f0000000-0000-4000-8000-000000000002", "onboarded":true,  "name":"Jake Kohne",      "fee1":25, "fee2":20, "player":true},
    {"email":"casey.sideline@dryrun.ozark.test", "id":"f0000000-0000-4000-8000-000000000003", "onboarded":true,  "name":"Casey Sideline",  "fee1":50, "fee2":20, "player":false},
    {"email":"newbie@dryrun.ozark.test",         "id":"f0000000-0000-4000-8000-000000000004", "onboarded":false, "name":null,              "fee1":null, "fee2":null, "player":true},
    {"email":"pending@dryrun.ozark.test",        "id":"f0000000-0000-4000-8000-000000000005", "onboarded":true,  "name":"Parker Pending",  "fee1":null, "fee2":null, "player":true},
    {"email":"garrett.klenke@dryrun.ozark.test", "id":"f0000000-0000-4000-8000-000000000006", "onboarded":true,  "name":"Garrett Klenke",  "fee1":20, "fee2":20, "player":true},
    {"email":"ethan.kipping@dryrun.ozark.test",  "id":"f0000000-0000-4000-8000-000000000007", "onboarded":true,  "name":"Ethan Kipping",   "fee1":30, "fee2":20, "player":true},
    {"email":"alex.leslie@dryrun.ozark.test",    "id":"f0000000-0000-4000-8000-000000000008", "onboarded":true,  "name":"Alex Leslie",     "fee1":40, "fee2":20, "player":true},
    {"email":"devin.arand@dryrun.ozark.test",    "id":"f0000000-0000-4000-8000-000000000009", "onboarded":true,  "name":"Devin Arand",     "fee1":20, "fee2":20, "player":true},
    {"email":"dustin.scheller@dryrun.ozark.test","id":"f0000000-0000-4000-8000-00000000000a", "onboarded":true,  "name":"Dustin Scheller", "fee1":35, "fee2":20, "player":true},
    {"email":"mike.vemmer@dryrun.ozark.test",    "id":"f0000000-0000-4000-8000-00000000000b", "onboarded":true,  "name":"Mike Vemmer",     "fee1":50, "fee2":50, "player":true},
    {"email":"rob.vemmer@dryrun.ozark.test",     "id":"f0000000-0000-4000-8000-00000000000c", "onboarded":true,  "name":"Rob Vemmer",      "fee1":25, "fee2":20, "player":true}
  ]'::jsonb;
  acct jsonb;
  uid uuid;
  t_id uuid;
BEGIN
  SELECT id INTO t_id FROM public.tournaments WHERE year = 2026;
  IF t_id IS NULL THEN
    RAISE EXCEPTION 'No 2026 tournament row — run the migrations first.';
  END IF;

  FOR acct IN SELECT * FROM jsonb_array_elements(accounts) LOOP
    uid := (acct->>'id')::uuid;

    -- Clean slate. Cascades to public.users, identities, and participants.
    DELETE FROM auth.users WHERE id = uid;

    -- Passwordless (magic-link only), so no pgcrypto dependency and this runs
    -- fine in the hosted SQL editor. Log in with scripts/dev-magiclink.ts.
    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', acct->>'email',
      now(),
      '{"provider":"email","providers":["email"]}', '{}',
      now(), now(),
      '', '', '', ''
    );

    -- The email identity is what lets signInWithOtp resolve the account.
    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), uid, uid::text,
      jsonb_build_object('sub', uid::text, 'email', acct->>'email', 'email_verified', true),
      'email', now(), now(), now()
    );

    -- handle_new_user already made the public.users row with
    -- display_name = email and onboarded_at NULL. Stamp the onboarded ones.
    -- auth.uid() is NULL in this context so guard_users_self_update is
    -- bypassed and we can set the name directly.
    IF (acct->>'onboarded')::boolean THEN
      UPDATE public.users
        SET display_name = acct->>'name', onboarded_at = now()
        WHERE id = uid;
    END IF;

    -- A participant row existing = approved to bet (ADR 0001 A12). newbie@
    -- and pending@ deliberately get none — they are the funnel demo.
    IF acct->>'fee1' IS NOT NULL OR acct->>'fee2' IS NOT NULL THEN
      INSERT INTO public.tournament_participants
        (user_id, tournament_id, phase1_entry_fee, phase2_entry_fee, is_player)
      VALUES (uid, t_id, (acct->>'fee1')::int, (acct->>'fee2')::int, (acct->>'player')::boolean)
      ON CONFLICT (user_id, tournament_id) DO UPDATE
        SET phase1_entry_fee = EXCLUDED.phase1_entry_fee,
            phase2_entry_fee = EXCLUDED.phase2_entry_fee,
            is_player        = EXCLUDED.is_player;
    END IF;
  END LOOP;
END $$;

-- The three real accounts. Pat is left at $20 / $20 on purpose so Act 2 can
-- edit his Phase 1 entry to $30 and prove the approve/edit path works on a
-- live human. Andrew is $20 in each phase.
UPDATE public.tournament_participants tp
   SET phase1_entry_fee = 20, phase2_entry_fee = 20, is_player = true
  FROM public.users u
 WHERE tp.user_id = u.id
   AND u.email IN ('andrewelong18@gmail.com', 'pleicht17@gmail.com');

-- Steve is the deliberate "paid the entry, never placed a wager" control, now
-- with money on it (ADR 0002): $50 in Phase 1 and nothing in Phase 2. At the
-- Phase 1 close the first $20 of it forfeits to the pot and $30 comes back,
-- so he surfaces in the standings with $0 theoretical, $30 refunded and a
-- $20 loss — and at the Phase 2 close he is the one approved member with no
-- Phase 2 entry.
UPDATE public.tournament_participants tp
   SET phase1_entry_fee = 50, phase2_entry_fee = NULL, is_player = true
  FROM public.users u
 WHERE tp.user_id = u.id
   AND u.email = 'esswein93@gmail.com';

COMMIT;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect 12 sim accounts, 10 of them approved (newbie@ + pending@ have no row).
SELECT
  u.display_name,
  u.email,
  u.onboarded_at IS NOT NULL AS onboarded,
  tp.phase1_entry_fee,
  tp.phase2_entry_fee,
  tp.is_player,
  CASE WHEN tp.user_id IS NULL THEN 'browse-only' ELSE 'approved' END AS access
FROM public.users u
LEFT JOIN public.tournament_participants tp ON tp.user_id = u.id
ORDER BY (tp.user_id IS NULL) DESC, u.display_name;
