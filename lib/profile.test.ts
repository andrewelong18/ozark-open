// Unit tests for lib/profile.ts — the pure half of PATCH /api/profile:
// nickname normalization + validation and body parsing. Zero-dependency by
// design: node:test via npm run test.

import test from "node:test"
import assert from "node:assert/strict"
import {
  DISPLAY_NAME_MAX,
  NICKNAME_MAX,
  normalizeDisplayName,
  normalizeNickname,
  parseOnboardingBody,
  parseProfileBody,
  validateDisplayName,
  validateOnboarding,
  validateProfile,
} from "./profile.ts"

// ---------------------------------------------------------------------------
// normalizeNickname
// ---------------------------------------------------------------------------

test("normalizeNickname trims and collapses whitespace", () => {
  assert.equal(normalizeNickname("  Slim  "), "Slim")
  assert.equal(normalizeNickname("The   Shark"), "The Shark")
})

test("normalizeNickname treats empty/whitespace as cleared (null)", () => {
  assert.equal(normalizeNickname(""), null)
  assert.equal(normalizeNickname("   "), null)
  assert.equal(normalizeNickname(undefined), null)
  assert.equal(normalizeNickname(null), null)
  assert.equal(normalizeNickname(42), null)
})

// ---------------------------------------------------------------------------
// parseProfileBody
// ---------------------------------------------------------------------------

test("parseProfileBody accepts a nickname + avatarUpdated flag", () => {
  const parsed = parseProfileBody({ nickname: " Ozark Slim ", avatarUpdated: true })
  assert.ok(parsed.ok)
  assert.equal(parsed.value.nickname, "Ozark Slim")
  assert.equal(parsed.value.avatarUpdated, true)
})

test("parseProfileBody defaults a missing nickname to null and avatar to false", () => {
  const parsed = parseProfileBody({})
  assert.ok(parsed.ok)
  assert.equal(parsed.value.nickname, null)
  assert.equal(parsed.value.avatarUpdated, false)
})

test("parseProfileBody rejects a non-string nickname and non-object bodies", () => {
  assert.equal(parseProfileBody({ nickname: 7 }).ok, false)
  assert.equal(parseProfileBody(null).ok, false)
  assert.equal(parseProfileBody("nope").ok, false)
})

test("parseProfileBody only treats avatarUpdated === true as an update", () => {
  assert.equal(parseProfileBody({ avatarUpdated: "true" }).ok && parseProfileBody({ avatarUpdated: "true" }).value.avatarUpdated, false)
})

// ---------------------------------------------------------------------------
// validateProfile
// ---------------------------------------------------------------------------

test("validateProfile accepts a normal nickname and a cleared (null) nickname", () => {
  assert.deepEqual(validateProfile({ nickname: "Slim", avatarUpdated: false }), {
    ok: true,
  })
  assert.deepEqual(validateProfile({ nickname: null, avatarUpdated: true }), {
    ok: true,
  })
})

test("validateProfile rejects an over-long nickname", () => {
  const verdict = validateProfile({
    nickname: "x".repeat(NICKNAME_MAX + 1),
    avatarUpdated: false,
  })
  assert.equal(verdict.ok, false)
})

test("validateProfile rejects markup / control characters", () => {
  assert.equal(
    validateProfile({ nickname: "<script>", avatarUpdated: false }).ok,
    false
  )
  assert.equal(
    validateProfile({ nickname: "line\nbreak", avatarUpdated: false }).ok,
    false
  )
})

test("validateProfile allows friendly punctuation and unicode letters", () => {
  for (const nick of ["O'Brien", 'The "Kid"', "J.R.", "Björn", "A-Team (1)"]) {
    assert.deepEqual(
      validateProfile({ nickname: nick, avatarUpdated: false }),
      { ok: true },
      nick
    )
  }
})

// ---------------------------------------------------------------------------
// Onboarding (Sprint 16): required display name + optional nickname/avatar
// ---------------------------------------------------------------------------

test("normalizeDisplayName trims/collapses and coerces non-strings to empty", () => {
  assert.equal(normalizeDisplayName("  Andrew   Long "), "Andrew Long")
  assert.equal(normalizeDisplayName(""), "")
  assert.equal(normalizeDisplayName(undefined), "")
  assert.equal(normalizeDisplayName(42), "")
})

test("validateDisplayName requires a non-empty, reasonable-length name", () => {
  assert.notEqual(validateDisplayName(""), null)
  assert.notEqual(validateDisplayName("x".repeat(DISPLAY_NAME_MAX + 1)), null)
  assert.equal(validateDisplayName("Andrew Long"), null)
  assert.equal(validateDisplayName("J.R. O'Brien"), null)
  assert.notEqual(validateDisplayName("<b>hi</b>"), null)
  assert.notEqual(validateDisplayName("line\nbreak"), null)
})

test("parseOnboardingBody normalizes name + nickname and reads the avatar flag", () => {
  const parsed = parseOnboardingBody({
    displayName: "  Jake  Kohne ",
    nickname: " Kohno ",
    avatarUpdated: true,
  })
  assert.ok(parsed.ok)
  assert.equal(parsed.value.displayName, "Jake Kohne")
  assert.equal(parsed.value.nickname, "Kohno")
  assert.equal(parsed.value.avatarUpdated, true)
})

test("parseOnboardingBody rejects non-string name/nickname and non-object bodies", () => {
  assert.equal(parseOnboardingBody({ displayName: 7 }).ok, false)
  assert.equal(parseOnboardingBody({ nickname: 7 }).ok, false)
  assert.equal(parseOnboardingBody(null).ok, false)
})

test("validateOnboarding requires the name but allows a blank nickname", () => {
  assert.deepEqual(
    validateOnboarding({ displayName: "Andrew Long", nickname: null, avatarUpdated: false }),
    { ok: true }
  )
  const missing = validateOnboarding({ displayName: "", nickname: null, avatarUpdated: false })
  assert.equal(missing.ok, false)
})

test("validateOnboarding surfaces both name and nickname problems", () => {
  const verdict = validateOnboarding({
    displayName: "",
    nickname: "x".repeat(NICKNAME_MAX + 1),
    avatarUpdated: false,
  })
  assert.equal(verdict.ok, false)
  assert.ok(!verdict.ok && verdict.errors.length >= 2)
})
