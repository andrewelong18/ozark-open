// activity_placements() round-trip — the containment claim, tested.
//
// The dashboard activity feed reads placements through a SECURITY DEFINER
// function, which means it reads them with RLS switched off. Everything that
// keeps the feed inside the hidden-until-close model (PRD §8) therefore comes
// down to one column list and one gate, and neither is reachable from a unit
// test: lib/activity.ts only ever sees rows that have already been through the
// function, so it would happily render an `amount` if one appeared.
//
// The failure this exists to catch is a future edit — a join added for an
// avatar, a column added "while we're here" — that publishes every member's
// position mid-phase. It would look exactly like a working feed.
//
// Three things are asserted, in order of how badly they fail:
//
//   1. The function's RESULT SIGNATURE is exactly five columns. Adding one
//      fails here, in the diff that adds it.
//   2. The function returns OTHER members' rows on an OPEN bet — which a plain
//      read cannot (asserted alongside, so a broken feed and a leaking one are
//      distinguishable failures).
//   3. anon cannot execute it at all.
//
// Setup: the throwaway cluster the other round-trips use. Run standalone with
//   PGURI=... node --experimental-strip-types scripts/activity-rls-roundtrip.ts

import { execFileSync } from "node:child_process"

const PGURI = process.env.PGURI ?? "postgresql://localhost:5432/ozark_roundtrip"

let failures = 0
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "  ✓" : "  ✗ FAIL"} ${label}${detail ? ` — ${detail}` : ""}`)
  if (!ok) failures++
}

function runSql(sql: string): string {
  return execFileSync(
    "psql",
    [PGURI, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
    { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
  ).trim()
}

/** Run as an authenticated member, RLS enforced. The SETs print command tags,
 *  so the statement's own result is the last line. */
function asUser(userId: string, sql: string): string {
  const out = runSql(
    `SET ROLE authenticated; SET request.jwt.claim.sub = '${userId}'; ${sql}`
  )
  return out.split("\n").at(-1) ?? ""
}

// Distinct ids from the other harnesses, so they can share a database.
const ONE = "00000000-0000-4000-8000-0000000009a1"
const TWO = "00000000-0000-4000-8000-0000000009a2"

function main() {
  console.log("activity_placements() round-trip\n")

  // --- Local-stub plumbing: GUC-backed auth.uid() + grants ------------------
  runSql(`
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    GRANT USAGE ON SCHEMA public TO authenticated, anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  `)

  // --- Fixtures -------------------------------------------------------------
  // Two members, both with a live wager on the same OPEN bet, plus one removed
  // wager. The seed's bet 1 is closed, so this makes its own open bet rather
  // than mutating a fixture the other harnesses read.
  runSql(`
    DELETE FROM public.bet_placements WHERE user_id IN ('${ONE}', '${TWO}');
    DELETE FROM public.users WHERE id IN ('${ONE}', '${TWO}');
    DELETE FROM auth.users  WHERE id IN ('${ONE}', '${TWO}');
    INSERT INTO auth.users (id, email) VALUES
      ('${ONE}', 'one@activity.test'),
      ('${TWO}', 'two@activity.test');
    UPDATE public.users SET display_name = CASE id
             WHEN '${ONE}'::uuid THEN 'Member One'
             ELSE 'Member Two' END
     WHERE id IN ('${ONE}', '${TWO}');

    DELETE FROM public.bets WHERE sheet_bet_id = 900;
    INSERT INTO public.bets
      (tournament_id, category_id, sheet_bet_id, title, phase, round, status, opened_at)
    SELECT t.id, c.id, 900, 'Activity fixture', 1, 'tournament', 'open', now()
      FROM public.tournaments t
      CROSS JOIN (SELECT id FROM public.bet_categories WHERE name = 'Top Finisher') c
     WHERE t.year = 2026;

    INSERT INTO public.bet_picks
      (bet_id, sheet_pick_id, label, american_odds, fractional_odds, probability)
    SELECT b.id, 9001, 'Fixture Pick', 110, '11/10', 0.476
      FROM public.bets b WHERE b.sheet_bet_id = 900;
    INSERT INTO public.bet_picks
      (bet_id, sheet_pick_id, label, american_odds, fractional_odds, probability)
    SELECT b.id, 9002, 'Fixture Pick Two', 200, '2/1', 0.333
      FROM public.bets b WHERE b.sheet_bet_id = 900;

    INSERT INTO public.bet_placements (user_id, pick_id, amount, odds_at_placement)
    SELECT '${ONE}', p.id, 5, 110 FROM public.bet_picks p WHERE p.sheet_pick_id = 9001;
    INSERT INTO public.bet_placements (user_id, pick_id, amount, odds_at_placement)
    SELECT '${TWO}', p.id, 7, 110 FROM public.bet_picks p WHERE p.sheet_pick_id = 9001;
    -- A removed wager: money history, not activity.
    INSERT INTO public.bet_placements
      (user_id, pick_id, amount, odds_at_placement, deleted_at)
    SELECT '${TWO}', p.id, 3, 200, now()
      FROM public.bet_picks p WHERE p.sheet_pick_id = 9002;
  `)

  const tournamentId = runSql(
    `SELECT id FROM public.tournaments WHERE year = 2026 LIMIT 1`
  )

  // --- 1. The column list ---------------------------------------------------
  // The assertion the whole feature's privacy rests on. Written as an exact
  // string on purpose: a diff that adds `amount` to the RETURNS TABLE fails
  // here rather than shipping and reading like a nicer feed.
  const signature = runSql(
    `SELECT pg_get_function_result('public.activity_placements(uuid, int)'::regprocedure)`
  ).replace(/\s+/g, " ")
  check(
    "returns exactly (id, user_id, display_name, avatar_url, created_at)",
    signature ===
      "TABLE(id uuid, user_id uuid, display_name text, avatar_url text, created_at timestamp with time zone)",
    signature
  )
  check(
    "names no position column",
    !/amount|odds|pick_id|placed_by|bet_id|title|label/i.test(signature),
    signature
  )

  // --- 2. What a member can see --------------------------------------------
  // The baseline first: without the function, an open bet shows you yourself.
  const ownOnly = asUser(
    ONE,
    `SELECT count(*) FROM public.bet_placements p
       JOIN public.bet_picks pk ON pk.id = p.pick_id
       JOIN public.bets b ON b.id = pk.bet_id
      WHERE b.sheet_bet_id = 900`
  )
  check(
    "a plain read on an open bet still shows a member only their own row",
    ownOnly === "1",
    `saw ${ownOnly}`
  )

  const viaFunction = asUser(
    ONE,
    `SELECT count(*) FROM public.activity_placements('${tournamentId}'::uuid, 40)
      WHERE user_id IN ('${ONE}', '${TWO}')`
  )
  check(
    "the feed sees both members' wagers while the bet is open",
    viaFunction === "2",
    `saw ${viaFunction}`
  )

  const names = asUser(
    ONE,
    `SELECT string_agg(display_name, ',' ORDER BY display_name)
       FROM public.activity_placements('${tournamentId}'::uuid, 40)
      WHERE user_id IN ('${ONE}', '${TWO}')`
  )
  check("it carries display names", names === "Member One,Member Two", names)

  const withDeleted = asUser(
    ONE,
    `SELECT count(*) FROM public.activity_placements('${tournamentId}'::uuid, 100)
      WHERE user_id = '${TWO}'`
  )
  check(
    "a removed wager leaves the feed with it",
    withDeleted === "1",
    `saw ${withDeleted} rows for a member with 1 live + 1 removed`
  )

  const limited = asUser(
    ONE,
    `SELECT count(*) FROM public.activity_placements('${tournamentId}'::uuid, 1)`
  )
  check("the limit is honoured", limited === "1", `saw ${limited}`)

  const otherTournament = asUser(
    ONE,
    `SELECT count(*) FROM public.activity_placements(
       '00000000-0000-4000-8000-00000000dead'::uuid, 40)`
  )
  check(
    "another tournament's id returns nothing",
    otherTournament === "0",
    `saw ${otherTournament}`
  )

  // --- 3. anon ---------------------------------------------------------------
  let anonRefused = false
  try {
    runSql(
      `SET ROLE anon; SELECT count(*) FROM public.activity_placements('${tournamentId}'::uuid, 40)`
    )
  } catch {
    anonRefused = true
  }
  check("anon cannot execute it at all", anonRefused)

  // --- Cleanup ---------------------------------------------------------------
  runSql(`
    DELETE FROM public.bet_placements WHERE user_id IN ('${ONE}', '${TWO}');
    DELETE FROM public.bet_picks WHERE sheet_pick_id IN (9001, 9002);
    DELETE FROM public.bets WHERE sheet_bet_id = 900;
    DELETE FROM public.users WHERE id IN ('${ONE}', '${TWO}');
    DELETE FROM auth.users WHERE id IN ('${ONE}', '${TWO}');
  `)

  console.log(
    failures === 0
      ? "\nactivity_placements(): all checks passed"
      : `\nactivity_placements(): ${failures} check(s) FAILED`
  )
  process.exit(failures === 0 ? 0 : 1)
}

main()
