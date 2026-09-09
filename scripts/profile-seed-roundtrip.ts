// Sprint 26 profile-seed round-trip: prove that the player_profile_seed
// trigger actually fills a member's profile, on a throwaway local Postgres.
//
// This is the mechanism 20 of the 27 players depend on. When the migration was
// written only 7 had accounts; everyone else's hometown, bio, strength,
// weakness and past finishes arrive the moment their real display_name lands
// on their users row. If the trigger silently doesn't fire, nothing breaks —
// the app just quietly shows blank profiles for two thirds of the field. So it
// gets a test, not an eyeball.
//
// What only a real Postgres can verify:
//
//   - a users INSERT with a seeded name arrives already filled in
//   - onboarding (a member setting their OWN display_name) fills it too,
//     which means this trigger must fire AFTER users_guard_self_update —
//     that guard pins all six columns to OLD for a non-admin self-update, so
//     trigger name order ("users_s…" > "users_g…") is load-bearing
//   - the match is case- and whitespace-insensitive
//   - an unseeded name is left alone rather than half-filled
//   - a rename onto a seeded name applies it (the /admin/people path)
//
// Setup: run after scripts/placement-roundtrip.ts on the same throwaway DB
// (it installs the GUC-backed auth.uid()); this script re-asserts that
// plumbing idempotently so it also works standalone.
//   PGURI=... node --experimental-strip-types scripts/profile-seed-roundtrip.ts

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

function asUser(userId: string, sql: string): string {
  const out = runSql(
    `SET ROLE authenticated; SET request.jwt.claim.sub = '${userId}'; ${sql}`
  )
  return out.split("\n").at(-1) ?? ""
}

/** The six seeded columns for one member, pipe-separated. */
function profileOf(userId: string): string {
  return runSql(
    `SELECT coalesce(hometown,'∅') || '|' || coalesce(member_since::text,'∅')
         || '|' || coalesce(strength,'∅') || '|' || coalesce(weakness,'∅')
         || '|' || coalesce(left(bio, 12),'∅')
         || '|' || coalesce(past_performance::text,'∅')
     FROM public.users WHERE id = '${userId}'`
  )
}

const ROOKIE = "00000000-0000-4000-8000-0000000005e1"
const STRANGER = "00000000-0000-4000-8000-0000000005e2"
const RENAMED = "00000000-0000-4000-8000-0000000005e3"

function main() {
  runSql(`
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  `)

  console.log("\n==> the seed itself")
  const seeded = runSql("SELECT count(*) FROM public.player_profile_seed")
  check("all 27 players are seeded", seeded === "27", `${seeded} rows`)
  const withPlaces = runSql(
    "SELECT count(*) FROM public.player_profile_seed WHERE past_performance IS NOT NULL"
  )
  check(
    "21 have past finishes; the six 2026 debutants have none",
    withPlaces === "21",
    `${withPlaces} rows`
  )
  const badPlace = runSql(`
    SELECT count(*) FROM public.player_profile_seed s,
      LATERAL jsonb_array_elements(s.past_performance) e
    WHERE s.past_performance IS NOT NULL
      AND (e->>'place' IS NULL OR e->>'year' IS NULL
           OR e->>'place' !~ '^T?[0-9]+$')`)
  check("every finish is {year, place} with a parseable place", badPlace === "0")
  // The Sprint 18 shape would render as an empty section — silently, for
  // everyone. Assert it's gone rather than trusting the INSERT.
  const legacy = runSql(`
    SELECT count(*) FROM public.player_profile_seed s,
      LATERAL jsonb_array_elements(s.past_performance) e
    WHERE s.past_performance IS NOT NULL AND e ? 'value'`)
  check("no leftover {year, value} score rows", legacy === "0")

  console.log("\n==> a brand-new account whose name is on the seed")
  // handle_new_user inserts display_name = email, which matches nothing.
  runSql(`
    DELETE FROM public.users WHERE id IN ('${ROOKIE}','${STRANGER}','${RENAMED}');
    DELETE FROM auth.users WHERE id IN ('${ROOKIE}','${STRANGER}','${RENAMED}');
    INSERT INTO auth.users (id, email) VALUES ('${ROOKIE}', 'kyle@test.local');
  `)
  check(
    "signup alone fills nothing (display_name is still the email)",
    profileOf(ROOKIE) === "∅|∅|∅|∅|∅|∅",
    profileOf(ROOKIE)
  )

  // Onboarding: the member sets their OWN display_name. This is a non-admin
  // self-update, so users_guard_self_update pins all six columns to OLD —
  // and this trigger has to run after it and win.
  asUser(
    ROOKIE,
    `UPDATE public.users SET display_name = 'Kyle Getman', onboarded_at = now() WHERE id = '${ROOKIE}'`
  )
  const kyle = profileOf(ROOKIE)
  check(
    "onboarding fills the profile despite the self-update guard",
    kyle.startsWith("Fucking Your Bitch|2023|Peptides|"),
    kyle
  )
  check(
    "…including the past finishes",
    kyle.includes('"place": "6"') && kyle.includes('"year": 2024'),
    kyle
  )
  check(
    "…and the member still cannot write those columns themselves",
    asUser(
      ROOKIE,
      `UPDATE public.users SET hometown = 'Hacked' WHERE id = '${ROOKIE}';
       SELECT hometown FROM public.users WHERE id = '${ROOKIE}'`
    ) === "Fucking Your Bitch"
  )

  console.log("\n==> matching is forgiving about how the name is typed")
  runSql(`UPDATE public.users SET display_name = '  ETHAN KIPPING  ' WHERE id = '${ROOKIE}'`)
  check(
    "case and surrounding whitespace don't matter",
    profileOf(ROOKIE).startsWith("Waterloo, IL|2022|Large ass cheeks|"),
    profileOf(ROOKIE)
  )

  // Two behaviors that are deliberate rather than obviously right, pinned here
  // so a future change to either is a decision and not a surprise:
  //
  //   lower(trim()) is the WHOLE key, so interior whitespace is not
  //   normalized — 'Ethan  Kipping' is a different person to the seed; and
  //
  //   a name that matches nothing LEAVES the existing columns alone rather
  //   than clearing them. That means a rename off a seeded name keeps the old
  //   copy until an admin fixes it — chosen over the alternative, which would
  //   silently wipe a profile typed by hand in Studio every time someone's
  //   display name was edited.
  runSql(`UPDATE public.users SET display_name = 'Ethan  Kipping' WHERE id = '${ROOKIE}'`)
  check(
    "a doubled interior space doesn't match — lower+trim is the whole key",
    runSql(
      `SELECT count(*) FROM public.player_profile_seed
       WHERE name_key = lower(trim('Ethan  Kipping'))`
    ) === "0"
  )
  check(
    "…and a non-match leaves the row's existing copy in place, not blanked",
    profileOf(ROOKIE).startsWith("Waterloo, IL|2022|"),
    profileOf(ROOKIE)
  )

  console.log("\n==> someone the seed doesn't cover")
  runSql(`
    INSERT INTO auth.users (id, email) VALUES ('${STRANGER}', 'nobody@test.local');
    UPDATE public.users SET display_name = 'Some Rando' WHERE id = '${STRANGER}';
  `)
  check(
    "an unseeded name is left entirely blank, not half-filled",
    profileOf(STRANGER) === "∅|∅|∅|∅|∅|∅",
    profileOf(STRANGER)
  )

  console.log("\n==> an admin renaming someone on /admin/people")
  runSql(`
    INSERT INTO auth.users (id, email) VALUES ('${RENAMED}', 'typo@test.local');
    UPDATE public.users SET display_name = 'Pat Licht' WHERE id = '${RENAMED}';
  `)
  check("the typo matched nothing", profileOf(RENAMED) === "∅|∅|∅|∅|∅|∅")
  runSql(`UPDATE public.users SET display_name = 'Pat Leicht' WHERE id = '${RENAMED}'`)
  check(
    "fixing the name applies the seed",
    profileOf(RENAMED).startsWith("St. Louis, MO|2022|Cash flow|"),
    profileOf(RENAMED)
  )

  console.log("\n==> the Sprint 18 placeholders are gone")
  const placeholders = runSql(`
    SELECT count(*) FROM public.users
    WHERE bio LIKE 'Placeholder bio —%'
       OR strength LIKE 'Placeholder strength —%'
       OR weakness LIKE 'Placeholder weakness —%'`)
  check("no member still reads 'Placeholder …'", placeholders === "0")
  const fakeSeries = runSql(`
    SELECT count(*) FROM public.users u,
      LATERAL jsonb_array_elements(u.past_performance) e
    WHERE u.past_performance IS NOT NULL AND e ? 'value'`)
  check("no member still carries a fake {year, value} series", fakeSeries === "0")

  runSql(`
    DELETE FROM public.users WHERE id IN ('${ROOKIE}','${STRANGER}','${RENAMED}');
    DELETE FROM auth.users WHERE id IN ('${ROOKIE}','${STRANGER}','${RENAMED}');
  `)

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`)
    process.exit(1)
  }
  console.log(
    "\nProfile seed round trip passed: a seeded name fills the profile on every path a name arrives by."
  )
}

main()
