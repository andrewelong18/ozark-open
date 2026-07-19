// Unit tests for lib/profile.ts — the pure half of PATCH /api/profile:
// nickname normalization + validation and body parsing. Zero-dependency by
// design: node:test via npm run test.

import test from "node:test"
import assert from "node:assert/strict"
import {
  NICKNAME_MAX,
  normalizeNickname,
  parseProfileBody,
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
