// Unit tests for lib/members.ts — the pure half of POST /api/admin/members
// (#124). Zero-dependency by design: node:test via npm run test.

import test from "node:test"
import assert from "node:assert/strict"
import { parseNewMemberBody, validateNewMember } from "./members.ts"

/** Parse-then-validate, the way the route does it. */
function check(body: unknown): { ok: boolean; errors: string[] } {
  const parsed = parseNewMemberBody(body)
  if (!parsed.ok) return { ok: false, errors: [parsed.error] }
  const verdict = validateNewMember(parsed.value)
  return verdict.ok ? { ok: true, errors: [] } : { ok: false, errors: verdict.errors }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

test("a well-formed body parses to trimmed, normalized fields", () => {
  const parsed = parseNewMemberBody({
    email: "  Dan@Example.COM ",
    displayName: "  Dan   Smith ",
  })
  assert.ok(parsed.ok)
  assert.deepEqual(parsed.value, {
    email: "Dan@Example.COM",
    normalizedEmail: "dan@example.com",
    displayName: "Dan Smith",
  })
})

test("the email is stored as typed but matched lowercased", () => {
  // The account is created with what the admin typed; the duplicate check runs
  // against normalizedEmail, agreeing with tournament_invites' lower(email)
  // unique index and with lib/roster.ts's funnel matching.
  const parsed = parseNewMemberBody({ email: "Pat@X.com", displayName: "Pat" })
  assert.ok(parsed.ok)
  assert.equal(parsed.value.email, "Pat@X.com")
  assert.equal(parsed.value.normalizedEmail, "pat@x.com")
})

test("a non-object body is rejected, not coerced", () => {
  for (const body of [null, "dan@x.com", 42, undefined]) {
    const parsed = parseNewMemberBody(body)
    assert.equal(parsed.ok, false, `expected ${String(body)} to be rejected`)
  }
})

test("wrong-typed fields are rejected rather than stringified", () => {
  assert.equal(parseNewMemberBody({ email: 42, displayName: "Dan" }).ok, false)
  assert.equal(parseNewMemberBody({ email: "d@x.com", displayName: 42 }).ok, false)
})

test("missing fields parse to empty strings so validation can flag them", () => {
  const parsed = parseNewMemberBody({})
  assert.ok(parsed.ok)
  assert.equal(parsed.value.email, "")
  assert.equal(parsed.value.displayName, "")
})

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

test("email and name together are enough", () => {
  assert.deepEqual(check({ email: "dan@x.com", displayName: "Dan Smith" }), {
    ok: true,
    errors: [],
  })
})

test("both fields are required, and both errors come back together", () => {
  const { ok, errors } = check({ email: "", displayName: "" })
  assert.equal(ok, false)
  assert.equal(errors.length, 2, "the form shows them at once, not one at a time")
})

test("the name is required — an unnamed member breaks pick matching", () => {
  // handle_new_user() seeds display_name with the email address, and
  // lib/import.ts links picks to people by matching display_name. A member left
  // named "dan@x.com" matches no pick, which silently disables their self-bet
  // cap, self-pick flag and opponent block. So the name is not optional here.
  const { ok, errors } = check({ email: "dan@x.com", displayName: "   " })
  assert.equal(ok, false)
  assert.equal(errors.length, 1)
})

test("a malformed address is refused, and the message quotes it back", () => {
  const { ok, errors } = check({ email: "dan-at-x.com", displayName: "Dan" })
  assert.equal(ok, false)
  assert.match(errors[0], /dan-at-x\.com/)
})

test("the email rules match the invite paste box's", () => {
  // Same validator (looksLikeEmail, exported from lib/invites.ts), so the two
  // features in the same console can't disagree about one address.
  const bad = ["no-at-sign", "two@@x.com", "trailing@dot.", "spaced @x.com", "@x.com"]
  for (const email of bad) {
    assert.equal(check({ email, displayName: "Dan" }).ok, false, `${email} should fail`)
  }
  const good = ["dan@x.com", "dan.smith+ozark@mail.example.co.uk", "d_s@x.io"]
  for (const email of good) {
    assert.equal(check({ email, displayName: "Dan" }).ok, true, `${email} should pass`)
  }
})

test("an over-long name is refused by the shared display-name rules", () => {
  const { ok } = check({ email: "dan@x.com", displayName: "D".repeat(41) })
  assert.equal(ok, false)
})

test("an entry fee in the body is ignored — approval owns the money", () => {
  // Deliberate: POST /api/admin/participants validates the fee against the
  // tournaments row. Two validators for one dollar figure is how the pool math
  // drifts, so this module never sees it.
  const parsed = parseNewMemberBody({
    email: "dan@x.com",
    displayName: "Dan",
    entryFee: 999999,
  })
  assert.ok(parsed.ok)
  assert.equal("entryFee" in parsed.value, false)
})
