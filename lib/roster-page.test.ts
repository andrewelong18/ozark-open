// Unit tests for lib/roster-page.ts — who /roster shows, and in what order.
// Zero-dependency by design: node:test via npm run test.
//
// Rewritten alongside the module on Sept 20, 2026: the roster is driven by
// ACCOUNTS now, not entries. The cases that used to assert "no entry means
// not on the roster" are inverted on purpose — that rule is gone, and the
// test named for the reset below is the one that would have caught it.

import test from "node:test"
import assert from "node:assert/strict"
import {
  buildFieldRoster,
  hasPlayerProfile,
  hasFinishedOnboarding,
  isFieldMember,
  type RosterParticipantRow,
  type RosterUserRow,
} from "./roster-page.ts"

/** A registered member with a seeded profile — the ordinary case. */
const seeded: RosterUserRow = {
  id: "u1",
  display_name: "Ethan Kipping",
  hometown: "Waterloo, IL",
  member_since: 2022,
  bio: "Waterloo, IL native and 2024 Ozark Open champion.",
  strength: "Large ass cheeks",
  weakness: "Having smaller muscles than Pat",
  past_performance: [{ year: 2024, place: "1" }],
}

// ---------------------------------------------------------------------------
// hasPlayerProfile
// ---------------------------------------------------------------------------

test("hasPlayerProfile: a seeded member has one", () => {
  assert.equal(hasPlayerProfile(seeded), true)
})

test("hasPlayerProfile: an unseeded member has none", () => {
  // What a name the seed doesn't cover looks like — every profile column NULL.
  assert.equal(hasPlayerProfile({ id: "u2", display_name: "Mike Yenzer Jr" }), false)
})

test("hasPlayerProfile: any single column is enough", () => {
  const bare = { id: "u1", display_name: "X" }
  assert.equal(hasPlayerProfile({ ...bare, hometown: "Union, MO" }), true)
  assert.equal(hasPlayerProfile({ ...bare, bio: "A bio." }), true)
  assert.equal(hasPlayerProfile({ ...bare, strength: "Vapes" }), true)
  assert.equal(hasPlayerProfile({ ...bare, weakness: "Bonfires" }), true)
  assert.equal(hasPlayerProfile({ ...bare, member_since: 2026 }), true)
  assert.equal(hasPlayerProfile({ ...bare, past_performance: [{ year: 2025, place: "3" }] }), true)
})

test("hasPlayerProfile: a 2026 debutant with no finishes still has a profile", () => {
  // Dale Price, Derek Mercer, Don Harris, Justin Hendrix, Matt Jackson and
  // TJ Johnson all seed past_performance = NULL. Requiring every column would
  // have kept all six off the roster.
  assert.equal(
    hasPlayerProfile({
      id: "u3",
      display_name: "TJ Johnson",
      hometown: "St. Louis, MO",
      member_since: 2026,
      strength: "S&T Miner pride",
      weakness: "Fat bitches in Rolla",
      bio: "St. Louis, MO native and new member joining the Ozark Open in 2026.",
      past_performance: null,
    }),
    true
  )
})

test("hasPlayerProfile: blanks and empties are not a profile", () => {
  const bare = { id: "u1", display_name: "X" }
  assert.equal(hasPlayerProfile({ ...bare, hometown: "   " }), false)
  assert.equal(hasPlayerProfile({ ...bare, member_since: "" }), false)
  assert.equal(hasPlayerProfile({ ...bare, member_since: "nope" }), false)
  assert.equal(hasPlayerProfile({ ...bare, past_performance: [] }), false)
  assert.equal(hasPlayerProfile({ ...bare, past_performance: {} }), false)
})

test("hasPlayerProfile: a string member_since is coerced, not trusted", () => {
  assert.equal(hasPlayerProfile({ id: "u1", display_name: "X", member_since: "2024" }), true)
})

// ---------------------------------------------------------------------------
// hasFinishedOnboarding
// ---------------------------------------------------------------------------

test("hasFinishedOnboarding: a name means signed up, blank means not", () => {
  assert.equal(hasFinishedOnboarding(seeded), true)
  assert.equal(hasFinishedOnboarding({ id: "u1", display_name: "  " }), false)
  assert.equal(hasFinishedOnboarding({ id: "u1" }), false)
})

// ---------------------------------------------------------------------------
// isFieldMember
// ---------------------------------------------------------------------------

test("isFieldMember: an account with a profile is in the field", () => {
  assert.equal(isFieldMember(seeded), true)
})

test("isFieldMember: NO PARTICIPANT ROW IS NOT A REASON TO EXCLUDE", () => {
  // The point of the rewrite. Someone who registered five minutes ago and
  // whom no admin has touched belongs on the roster.
  assert.equal(isFieldMember(seeded, undefined), true)
})

test("isFieldMember: an approved member with no phase entry is still in the field", () => {
  // The Sept 20 reset case: every entry cleared to NULL, seven registered
  // members, and the old gate emptied the page. Entries are not consulted.
  assert.equal(isFieldMember(seeded, { user_id: "u1" }), true)
  assert.equal(isFieldMember(seeded, { user_id: "u1", is_player: true }), true)
})

test("isFieldMember: no profile keeps you off, account or not", () => {
  const unseeded = { id: "u1", display_name: "Mike Yenzer Jr" }
  assert.equal(isFieldMember(unseeded), false)
  assert.equal(isFieldMember(unseeded, { user_id: "u1", is_player: true }), false)
})

test("isFieldMember: an unnamed account is not a person yet", () => {
  assert.equal(isFieldMember({ ...seeded, display_name: "  " }), false)
})

test("isFieldMember: a bettor who isn't golfing is vetoed", () => {
  assert.equal(isFieldMember(seeded, { user_id: "u1", is_player: false }), false)
})

test("isFieldMember: a revoked member is vetoed", () => {
  assert.equal(
    isFieldMember(seeded, { user_id: "u1", revoked_at: "2026-09-01T00:00:00Z" }),
    false
  )
})

test("isFieldMember: a blank revoked_at is not a revoke", () => {
  assert.equal(isFieldMember(seeded, { user_id: "u1", revoked_at: "   " }), true)
})

// ---------------------------------------------------------------------------
// buildFieldRoster
// ---------------------------------------------------------------------------

/** Give a user the minimum that counts as a profile. */
function withProfile(user: RosterUserRow): RosterUserRow {
  return { hometown: "Union, MO", ...user }
}

test("buildFieldRoster sorts by name, case-insensitively", () => {
  const roster = buildFieldRoster({
    users: [
      withProfile({ id: "a", display_name: "Pat Leicht" }),
      withProfile({ id: "b", display_name: "alex leslie" }),
      withProfile({ id: "c", display_name: "Ethan Kipping" }),
    ],
    participants: [],
  })
  assert.deepEqual(
    roster.map((p) => p.name),
    ["alex leslie", "Ethan Kipping", "Pat Leicht"]
  )
})

test("buildFieldRoster carries only what the card renders", () => {
  const [player] = buildFieldRoster({
    users: [
      {
        ...seeded,
        id: "a",
        nickname: "  Cheeks McGee  ",
        avatar_url: "https://x/y.jpg",
      },
    ],
    participants: [],
  })
  // The profile columns were read to qualify the row; none of them ride along.
  assert.deepEqual(player, {
    user_id: "a",
    name: "Ethan Kipping",
    nickname: "Cheeks McGee",
    avatar_url: "https://x/y.jpg",
  })
})

test("buildFieldRoster blanks become null, not empty strings", () => {
  const [player] = buildFieldRoster({
    users: [withProfile({ id: "a", display_name: "Pat Leicht", nickname: "   ", avatar_url: "" })],
    participants: [],
  })
  assert.equal(player.nickname, null)
  assert.equal(player.avatar_url, null)
})

test("buildFieldRoster: a brand-new registrant appears with no admin step", () => {
  // The whole request: they onboard, the seed trigger writes their profile in
  // the same statement, and they are on the roster.
  const roster = buildFieldRoster({
    users: [withProfile({ id: "new", display_name: "Jake Kohne" })],
    participants: [],
  })
  assert.deepEqual(
    roster.map((p) => p.name),
    ["Jake Kohne"]
  )
})

test("buildFieldRoster drops everyone the gate excludes", () => {
  const roster = buildFieldRoster({
    users: [
      withProfile({ id: "a", display_name: "Registered" }),
      withProfile({ id: "b", display_name: "No entry yet" }),
      withProfile({ id: "c", display_name: "Revoked" }),
      withProfile({ id: "d", display_name: "Bettor only" }),
      { id: "e", display_name: "Unseeded name" },
      withProfile({ id: "f", display_name: "   " }),
    ],
    participants: [
      { user_id: "c", revoked_at: "2026-09-01" },
      { user_id: "d", is_player: false },
    ],
  })
  // "No entry yet" now survives; it used to be the thing this test excluded.
  assert.deepEqual(
    roster.map((p) => p.name),
    ["No entry yet", "Registered"]
  )
})

test("buildFieldRoster ignores a participant row with no users row", () => {
  const roster = buildFieldRoster({
    users: [],
    participants: [{ user_id: "ghost", is_player: true }],
  })
  assert.deepEqual(roster, [])
})

test("buildFieldRoster renders each player once", () => {
  const roster = buildFieldRoster({
    users: [
      withProfile({ id: "a", display_name: "Pat Leicht" }),
      withProfile({ id: "a", display_name: "Pat Leicht" }),
    ],
    participants: [
      { user_id: "a", is_player: true },
      { user_id: "a", is_player: true },
    ],
  })
  assert.equal(roster.length, 1)
})

test("buildFieldRoster: a duplicate participant row can't dodge the veto", () => {
  // First row wins, so a stray second row saying is_player: true must not
  // reinstate somebody the first one vetoed.
  const roster = buildFieldRoster({
    users: [withProfile({ id: "a", display_name: "Bettor only" })],
    participants: [
      { user_id: "a", is_player: false },
      { user_id: "a", is_player: true },
    ] as RosterParticipantRow[],
  })
  assert.deepEqual(roster, [])
})

test("buildFieldRoster: an empty roster is empty, not a crash", () => {
  assert.deepEqual(buildFieldRoster({ users: [], participants: [] }), [])
})
