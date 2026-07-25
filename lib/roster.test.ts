// Unit tests for lib/roster.ts — the email merge and the status rules behind
// /admin/roster. Zero-dependency by design: node:test via npm run test.

import test from "node:test"
import assert from "node:assert/strict"
import {
  buildRoster,
  normalizeEmail,
  type AuthActivityQueryRow,
  type InviteQueryRow,
  type ParticipantQueryRow,
  type UserQueryRow,
} from "./roster.ts"

function roster(overrides: {
  invites?: InviteQueryRow[]
  users?: UserQueryRow[]
  participants?: ParticipantQueryRow[]
  authActivity?: AuthActivityQueryRow[]
}) {
  return buildRoster({
    invites: overrides.invites ?? [],
    users: overrides.users ?? [],
    participants: overrides.participants ?? [],
    authActivity: overrides.authActivity ?? [],
  })
}

/** An onboarded member. */
function user(id: string, email: string, extra: Partial<UserQueryRow> = {}) {
  return {
    id,
    email,
    display_name: id,
    onboarded_at: "2026-07-01T00:00:00Z",
    ...extra,
  } satisfies UserQueryRow
}

// ---------------------------------------------------------------------------
// normalizeEmail
// ---------------------------------------------------------------------------

test("normalizeEmail trims and lowercases; null becomes empty", () => {
  assert.equal(normalizeEmail("  Dan@Example.COM "), "dan@example.com")
  assert.equal(normalizeEmail(null), "")
  assert.equal(normalizeEmail(undefined), "")
})

// ---------------------------------------------------------------------------
// not_registered — the invite-only rows
// ---------------------------------------------------------------------------

test("an invite with no matching user is not_registered, never logged in", () => {
  const r = roster({ invites: [{ email: "pat@x.com", invited_name: "Pat" }] })
  assert.equal(r.people.length, 1)
  const p = r.people[0]
  assert.equal(p.status, "not_registered")
  assert.equal(p.reason, "no_account")
  assert.equal(p.user_id, null)
  assert.equal(p.last_sign_in_at, null)
  assert.equal(p.name, "Pat")
  assert.equal(p.invited, true)
  assert.equal(p.key, "invite:pat@x.com")
  assert.deepEqual(r.notRegistered, [p])
})

test("an invite with no invited_name falls back to the email", () => {
  const r = roster({ invites: [{ email: "pat@x.com" }] })
  assert.equal(r.people[0].name, "pat@x.com")
})

// ---------------------------------------------------------------------------
// The email merge
// ---------------------------------------------------------------------------

test("invite and user match case-insensitively into one person", () => {
  const r = roster({
    invites: [{ email: "  Dan@Example.COM ", invited_name: "Dan" }],
    users: [user("u-dan", "dan@example.com")],
  })
  assert.equal(r.people.length, 1)
  assert.equal(r.people[0].user_id, "u-dan")
  assert.equal(r.people[0].invited, true)
})

test("duplicate invites collapse to a single person", () => {
  const r = roster({ invites: [{ email: "a@x.com" }, { email: "A@X.com" }] })
  assert.equal(r.counts.total, 1)
})

test("a registered member who isn't on the invite roster still appears", () => {
  const r = roster({
    invites: [{ email: "pat@x.com" }],
    users: [user("u-jake", "jake@x.com")],
  })
  assert.equal(r.counts.total, 2)
  const jake = r.people.find((p) => p.user_id === "u-jake")
  assert.ok(jake)
  assert.equal(jake.invited, false)
  assert.equal(r.hasInvites, true)
})

// ---------------------------------------------------------------------------
// Status rules for registered members
// ---------------------------------------------------------------------------

test("a participant row with an entry fee is ready to bet", () => {
  const r = roster({
    users: [user("u-a", "a@x.com")],
    participants: [{ user_id: "u-a", entry_fee: 25 }],
  })
  assert.equal(r.people[0].status, "ready")
  assert.equal(r.people[0].reason, "ready")
  assert.equal(r.people[0].entry_fee, 25)
})

test("a string entry_fee from PostgREST is still ready", () => {
  const r = roster({
    users: [user("u-a", "a@x.com")],
    participants: [{ user_id: "u-a", entry_fee: "25" }],
  })
  assert.equal(r.people[0].status, "ready")
  assert.equal(r.people[0].entry_fee, 25)
})

test("a participant row with no usable fee is not_ready / fee_unset", () => {
  for (const fee of [0, null, "abc"] as const) {
    const r = roster({
      users: [user("u-a", "a@x.com")],
      participants: [{ user_id: "u-a", entry_fee: fee }],
    })
    assert.equal(r.people[0].status, "not_ready")
    assert.equal(r.people[0].reason, "fee_unset")
    assert.equal(r.people[0].entry_fee, null)
  }
})

test("onboarded with no participant row is not_ready / not_approved", () => {
  const r = roster({ users: [user("u-a", "a@x.com")] })
  assert.equal(r.people[0].status, "not_ready")
  assert.equal(r.people[0].reason, "not_approved")
})

test("never onboarded with no participant row is not_ready / not_onboarded", () => {
  const r = roster({ users: [user("u-a", "a@x.com", { onboarded_at: null })] })
  assert.equal(r.people[0].status, "not_ready")
  assert.equal(r.people[0].reason, "not_onboarded")
  assert.equal(r.people[0].onboarded, false)
})

test("the participant row is the gate — approved but not onboarded is ready", () => {
  // PRD §12 A11: a tournament_participants row existing = approved to bet.
  // The roster must not claim otherwise.
  const r = roster({
    users: [user("u-a", "a@x.com", { onboarded_at: null })],
    participants: [{ user_id: "u-a", entry_fee: 40 }],
  })
  assert.equal(r.people[0].status, "ready")
})

// ---------------------------------------------------------------------------
// Admin is a badge, not a status
// ---------------------------------------------------------------------------

test("an admin who isn't approved is still in the not-ready chase list", () => {
  const r = roster({ users: [user("u-a", "a@x.com", { is_admin: true })] })
  assert.equal(r.people[0].is_admin, true)
  assert.equal(r.people[0].status, "not_ready")
  assert.deepEqual(r.notReady, r.people)
  assert.equal(r.counts.admins, 1)
})

// ---------------------------------------------------------------------------
// Last login
// ---------------------------------------------------------------------------

test("last_sign_in_at is attached by user id", () => {
  const r = roster({
    users: [user("u-a", "a@x.com")],
    authActivity: [{ user_id: "u-a", last_sign_in_at: "2026-07-20T12:00:00Z" }],
  })
  assert.equal(r.people[0].last_sign_in_at, "2026-07-20T12:00:00Z")
})

test("an empty authActivity (RPC blocked) degrades to null, never throws", () => {
  const r = roster({ users: [user("u-a", "a@x.com")], authActivity: [] })
  assert.equal(r.people[0].last_sign_in_at, null)
})

// ---------------------------------------------------------------------------
// Ordering, counts, hasInvites
// ---------------------------------------------------------------------------

test("people sort chase-first, then alphabetically within a status", () => {
  const r = roster({
    invites: [{ email: "zed@x.com" }, { email: "amy@x.com" }],
    users: [
      user("u-bob", "bob@x.com", { display_name: "Bob" }),
      user("u-ann", "ann@x.com", { display_name: "Ann" }),
      user("u-cy", "cy@x.com", { display_name: "Cy" }),
    ],
    participants: [{ user_id: "u-cy", entry_fee: 30 }],
  })
  assert.deepEqual(
    r.people.map((p) => p.name),
    ["amy@x.com", "zed@x.com", "Ann", "Bob", "Cy"]
  )
  assert.deepEqual(
    r.notRegistered.map((p) => p.name),
    ["amy@x.com", "zed@x.com"]
  )
  assert.deepEqual(
    r.notReady.map((p) => p.name),
    ["Ann", "Bob"]
  )
  assert.deepEqual(
    r.ready.map((p) => p.name),
    ["Cy"]
  )
})

test("the three buckets add up to the total", () => {
  const r = roster({
    invites: [{ email: "pat@x.com" }, { email: "ann@x.com" }],
    users: [user("u-ann", "ann@x.com"), user("u-cy", "cy@x.com")],
    participants: [{ user_id: "u-cy", entry_fee: 20 }],
  })
  const { notRegistered, notReady, ready, total } = r.counts
  assert.equal(notRegistered + notReady + ready, total)
  assert.equal(total, 3)
})

test("hasInvites is false when the admin hasn't entered a roster yet", () => {
  const r = roster({ users: [user("u-a", "a@x.com")] })
  assert.equal(r.hasInvites, false)
  assert.equal(r.counts.total, 1)
})
