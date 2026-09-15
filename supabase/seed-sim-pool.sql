-- ═══════════════════════════════════════════════════════════════════════════
-- The full-pool simulation — ~32 members, mid-tournament
-- ═══════════════════════════════════════════════════════════════════════════
--
-- "Simulate everyone signed up" without recruiting 32 humans. Load this and the
-- app shows what the real weekend looks like: a settled Phase 1 with everyone's
-- picks revealed, an open Phase 2 to bet into, and a pari-mutuel split across a
-- full field.
--
-- Run AFTER the menu exists. It needs Phase 2 bets, so the 19-bet sheet — not
-- the 13-bet supabase/seed-sample-phase1.sql, which is Phase 1 only:
--
--   node --experimental-strip-types scripts/import-roundtrip.ts   (or upload
--   docs/import/bets-sample.xlsx at /admin/import)
--   psql "$PGURI" -f supabase/seed-sim-pool.sql
--
-- scripts/sim-pool-verify.sh does the whole thing from an empty database and
-- then checks the money reconciles.
--
-- ── STATE IT LEAVES YOU IN ─────────────────────────────────────────────────
--   Phase 1  closed, every pick carrying the sheet's Round-1 verdict
--            → the reveal is populated, theoretical payouts are real
--   Phase 2  open, deadline in the future
--            → there is still something to bet on
--
-- ── SAFETY ─────────────────────────────────────────────────────────────────
-- Every address is @sim.ozark.test — a third domain, deliberately not
-- @ozark.test (seed-dev-accounts.sql) and not @dryrun.ozark.test
-- (supabase/dry-run/), so no teardown can ever catch another fixture's
-- accounts. Teardown: supabase/seed-sim-pool-teardown.sql.
--
-- Idempotent: deterministic UUIDs, delete-then-insert.
--
-- ── WHY THE WAGERS ARE VALID BY CONSTRUCTION ───────────────────────────────
-- Nothing here hardcodes a rule. Entries, stakes and pick counts are derived
-- from the tournaments row (entry_fee_min/max, max_single_bet,
-- min_picks_per_phase), and each bettor only backs bets they are NOT a linked
-- player in — so the self-bet cap and the opponent block are satisfied by never
-- coming near them. scripts/sim-pool-verify.sh proves it by replaying every
-- wager through lib/validation.ts.
--
-- ── PER-PHASE ENTRIES (Sprint 30 / ADR 0002) ───────────────────────────────
-- Each phase is its own entry and its own pot. Most members enter both phases
-- and wager each entry exactly; two deliberate exceptions make the pot math
-- non-trivial at field size:
--   · every 7th member wagers only $15 of their Phase 2 entry — under the $20
--     floor, so $5 forfeits to the pot and the rest of the entry comes back;
--   · every 11th member has no Phase 2 entry at all.

BEGIN;

-- ---------------------------------------------------------------------------
-- 32 accounts. The first twelve are named after golfers on the sample menu so
-- import name-matching links them to picks (that link is what makes a pool
-- realistic — some members are also in the field). The rest are pure bettors.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  names CONSTANT text[] := ARRAY[
    -- Named off the menu → these become linked players.
    'Dan Mercer','Garrett Klenke','Ethan Kipping','Alex Leslie',
    'Devin Arand','Pat Leicht','Dustin Scheller','Mike Vemmer',
    'Rob Vemmer','Jake Kohne','Steve Jones','Mike Yenzer',
    -- Bettors who aren't in the field.
    'Avery Sim','Blake Sim','Casey Sim','Dana Sim','Eli Sim','Frankie Sim',
    'Gale Sim','Harper Sim','Indigo Sim','Jules Sim','Kai Sim','Logan Sim',
    'Marley Sim','Noa Sim','Onyx Sim','Peyton Sim','Quinn Sim','Reese Sim',
    'Sage Sim','Tatum Sim'
  ];
  fee_min int; fee_max int;
  t_id uuid;
  uid uuid;
  i int;
  nm text;
  email text;
  fee int;
  fee2 int;
  is_player boolean;
BEGIN
  SELECT id, entry_fee_min, entry_fee_max INTO t_id, fee_min, fee_max
  FROM public.tournaments WHERE year = 2026;
  IF t_id IS NULL THEN
    RAISE EXCEPTION 'No 2026 tournament row — run the migrations first.';
  END IF;

  FOR i IN 1..array_length(names, 1) LOOP
    nm := names[i];
    email := lower(replace(nm, ' ', '.')) || '@sim.ozark.test';
    uid := ('5107' || lpad(to_hex(i), 4, '0') || '-0000-4000-8000-' ||
            lpad(to_hex(i), 12, '0'))::uuid;

    -- Phase 1 entries walk the whole legal range in $5 steps; Phase 2 takes a
    -- different walk, and every 11th member sits Phase 2 out.
    fee := fee_min + (((i - 1) * 5) % (fee_max - fee_min + 1));
    fee := LEAST(fee, fee_max);
    fee2 := CASE WHEN i % 11 = 0 THEN NULL
                 ELSE LEAST(fee_min + ((i * 3) % (fee_max - fee_min + 1)), fee_max) END;
    is_player := i <= 12;

    DELETE FROM auth.users WHERE id = uid;

    INSERT INTO auth.users (
      instance_id, id, aud, role, email, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
      email, now(), '{"provider":"email","providers":["email"]}', '{}',
      now(), now(), '', '', '', ''
    );

    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), uid, uid::text,
      jsonb_build_object('sub', uid::text, 'email', email, 'email_verified', true),
      'email', now(), now(), now()
    );

    UPDATE public.users SET display_name = nm, onboarded_at = now() WHERE id = uid;

    INSERT INTO public.tournament_participants
      (user_id, tournament_id, phase1_entry_fee, phase2_entry_fee, is_player)
    VALUES (uid, t_id, fee, fee2, is_player)
    ON CONFLICT (user_id, tournament_id) DO UPDATE
      SET phase1_entry_fee = EXCLUDED.phase1_entry_fee,
          phase2_entry_fee = EXCLUDED.phase2_entry_fee,
          is_player        = EXCLUDED.is_player,
          revoked_at       = NULL;
  END LOOP;
END $$;

-- Link picks to the members named after them. Same stroke-suffix strip the
-- importer uses (lib/pick-label.ts), and it only fills NULLs — a hand-set link
-- is never clobbered.
UPDATE public.bet_picks pk
   SET player_user_id = u.id
  FROM public.users u
 WHERE pk.player_user_id IS NULL
   AND u.email LIKE '%@sim.ozark.test'
   AND lower(regexp_replace(pk.label, '\s*\((E|[+-]?[0-9]+)\)$', '')) = lower(u.display_name);

-- ---------------------------------------------------------------------------
-- The clock: Phase 1 has closed, Phase 2 is live.
-- ---------------------------------------------------------------------------
UPDATE public.tournaments
   SET status = 'active',
       phase1_closes_at = now() - interval '1 day',
       phase2_closes_at = now() + interval '7 days',
       show_countdown = true
 WHERE year = 2026;

UPDATE public.bets b SET status = 'closed'
  FROM public.tournaments t
 WHERE b.tournament_id = t.id AND t.year = 2026 AND b.phase = 1;

UPDATE public.bets b SET status = 'open'
  FROM public.tournaments t
 WHERE b.tournament_id = t.id AND t.year = 2026 AND b.phase = 2;

-- A Phase 2 bet can't carry a verdict while it's open (lib/import.ts refuses
-- exactly this), so make sure it doesn't.
UPDATE public.bet_picks pk SET result = 'pending'
  FROM public.bets b, public.tournaments t
 WHERE pk.bet_id = b.id AND b.tournament_id = t.id AND t.year = 2026 AND b.phase = 2;

-- ---------------------------------------------------------------------------
-- The wagers, per phase. Each member wagers each phase entry exactly, across
-- at least min_picks_per_phase picks, every stake within the flat single-bet
-- cap — except every 7th member, who wagers only $15 of their Phase 2 entry.
--
-- Selection rule, which is what keeps every wager legal without encoding a
-- single rule threshold: never a bet the member is a linked player in (so
-- neither the self-bet cap nor the opponent block can fire), and at most one
-- pick in a pick-one category. Which picks each member gets is rotated by
-- their index, so the field spreads across the menu instead of everyone
-- piling onto bet 1.
-- ---------------------------------------------------------------------------
DELETE FROM public.bet_placements
 WHERE user_id IN (SELECT id FROM public.users WHERE email LIKE '%@sim.ozark.test');

DO $$
DECLARE
  t_id uuid;
  min_picks int;
  single_cap int;
  m record;
  ph int;
  entry int;
  target int;
  k int;
  chosen record;
  slot int; base int; extra int; stake int;
BEGIN
  SELECT id, min_picks_per_phase, max_single_bet
    INTO t_id, min_picks, single_cap
    FROM public.tournaments WHERE year = 2026;

  FOR m IN
    SELECT u.id, tp.phase1_entry_fee, tp.phase2_entry_fee,
           row_number() OVER (ORDER BY u.email) AS idx
      FROM public.users u
      JOIN public.tournament_participants tp
        ON tp.user_id = u.id AND tp.tournament_id = t_id
     WHERE u.email LIKE '%@sim.ozark.test'
  LOOP
    FOR ph IN 1..2 LOOP
      entry := CASE ph WHEN 1 THEN m.phase1_entry_fee ELSE m.phase2_entry_fee END;
      CONTINUE WHEN entry IS NULL;

      -- Every 7th member wagers only $15 of their Phase 2 entry: under the $20
      -- floor, so $5 forfeits to the pot and anything above $20 comes back.
      target := CASE WHEN ph = 2 AND m.idx % 7 = 0 THEN LEAST(15, entry) ELSE entry END;
      -- Enough picks that no stake has to exceed the single-bet cap.
      k := GREATEST(min_picks, CEIL(target::numeric / single_cap)::int);
      base  := target / k;
      extra := target % k;
      slot  := 0;

      FOR chosen IN
        WITH eligible AS (
          SELECT p.id AS pick_id, p.american_odds, p.sheet_pick_id, b.sheet_bet_id,
                 c.allows_multiple_picks,
                 row_number() OVER (
                   PARTITION BY b.id
                   ORDER BY (p.sheet_pick_id + m.idx) % 97, p.sheet_pick_id
                 ) AS rn_in_bet
            FROM public.bets b
            JOIN public.bet_categories c ON c.id = b.category_id
            JOIN public.bet_picks p      ON p.bet_id = b.id
           WHERE b.tournament_id = t_id
             AND b.phase = ph
             -- Never a bet this member plays in.
             AND NOT EXISTS (
               SELECT 1 FROM public.bet_picks x
                WHERE x.bet_id = b.id AND x.player_user_id = m.id
             )
        )
        SELECT pick_id, american_odds
          FROM eligible
         WHERE allows_multiple_picks OR rn_in_bet = 1
         -- First picks of every bet before second picks of any, so a slate
         -- spreads across the phase.
         ORDER BY rn_in_bet, ((sheet_bet_id + m.idx) % 19), sheet_pick_id
         LIMIT k
      LOOP
        slot  := slot + 1;
        stake := base + CASE WHEN slot <= extra THEN 1 ELSE 0 END;
        INSERT INTO public.bet_placements (user_id, pick_id, amount, odds_at_placement)
        VALUES (m.id, chosen.pick_id, stake, chosen.american_odds);
      END LOOP;

      IF slot < k THEN
        RAISE EXCEPTION 'member % found only % eligible Phase % picks, needed %', m.idx, slot, ph, k;
      END IF;
    END LOOP;
  END LOOP;
END $$;

COMMIT;

-- ── Verify ──────────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM public.users WHERE email LIKE '%@sim.ozark.test')       AS members,
  (SELECT count(*) FROM public.bet_placements pl
     JOIN public.users u ON u.id = pl.user_id
    WHERE u.email LIKE '%@sim.ozark.test')                                       AS wagers,
  (SELECT sum(tp.phase1_entry_fee) FROM public.tournament_participants tp
     JOIN public.users u ON u.id = tp.user_id
    WHERE u.email LIKE '%@sim.ozark.test' AND tp.revoked_at IS NULL)             AS phase1_entries,
  (SELECT sum(tp.phase2_entry_fee) FROM public.tournament_participants tp
     JOIN public.users u ON u.id = tp.user_id
    WHERE u.email LIKE '%@sim.ozark.test' AND tp.revoked_at IS NULL)             AS phase2_entries,
  (SELECT count(*) FROM public.bets b JOIN public.tournaments t ON t.id = b.tournament_id
    WHERE t.year = 2026 AND b.status = 'open')                                   AS open_bets;
