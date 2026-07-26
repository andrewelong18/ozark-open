// Unit tests for lib/invites.ts — the paste-a-list parser behind the bulk
// invite box on /admin/people. Zero-dependency by design: node:test via
// npm run test.

import test from "node:test"
import assert from "node:assert/strict"
import { parseInviteList } from "./invites.ts"

// ---------------------------------------------------------------------------
// The shapes that actually get pasted
// ---------------------------------------------------------------------------

test("a bare address is an entry with no name", () => {
  const { entries, skipped } = parseInviteList("dan@x.com")
  assert.deepEqual(skipped, [])
  assert.deepEqual(entries, [
    { email: "dan@x.com", normalizedEmail: "dan@x.com", name: "" },
  ])
})

test("name, email — the spreadsheet-column form", () => {
  const { entries } = parseInviteList("Dan Smith, dan@x.com")
  assert.deepEqual(entries, [
    { email: "dan@x.com", normalizedEmail: "dan@x.com", name: "Dan Smith" },
  ])
})

test("either order works, and tabs and semicolons separate too", () => {
  const { entries } = parseInviteList(
    ["dan@x.com, Dan Smith", "Pat Jones\tpat@x.com", "Jake; jake@x.com"].join("\n")
  )
  assert.deepEqual(
    entries.map((e) => [e.name, e.email]),
    [
      ["Dan Smith", "dan@x.com"],
      ["Pat Jones", "pat@x.com"],
      ["Jake", "jake@x.com"],
    ]
  )
})

test("Name <email> — the mail-client form", () => {
  const { entries } = parseInviteList("Dan Smith <dan@x.com>")
  assert.deepEqual(entries, [
    { email: "dan@x.com", normalizedEmail: "dan@x.com", name: "Dan Smith" },
  ])
})

test("a quoted spreadsheet paste loses its quotes", () => {
  const { entries } = parseInviteList('"Smith, Dan","dan@x.com"')
  assert.equal(entries.length, 1)
  assert.equal(entries[0].email, "dan@x.com")
  // The comma inside the quoted cell still splits the name — acceptable; the
  // address is what the invite is keyed on.
  assert.equal(entries[0].name, "Smith Dan")
})

test("an apostrophe inside a name survives", () => {
  const { entries } = parseInviteList("Pat O'Brien, pat@x.com")
  assert.equal(entries[0].name, "Pat O'Brien")
})

// ---------------------------------------------------------------------------
// Normalizing and deduping
// ---------------------------------------------------------------------------

test("the normalized key lowercases and trims; the stored email is as typed", () => {
  const { entries } = parseInviteList("  Dan ,  Dan@Example.COM  ")
  assert.equal(entries[0].email, "Dan@Example.COM")
  assert.equal(entries[0].normalizedEmail, "dan@example.com")
})

test("a repeated email collapses to one entry, last non-empty name winning", () => {
  const { entries } = parseInviteList(
    ["dan@x.com", "Dan Smith, DAN@x.com", "dan@X.com"].join("\n")
  )
  assert.equal(entries.length, 1)
  assert.equal(entries[0].name, "Dan Smith")
  assert.equal(entries[0].normalizedEmail, "dan@x.com")
})

// ---------------------------------------------------------------------------
// Blank lines and typos
// ---------------------------------------------------------------------------

test("blank lines are ignored silently", () => {
  const { entries, skipped } = parseInviteList("\n\ndan@x.com\n   \n\npat@x.com\n")
  assert.equal(entries.length, 2)
  assert.deepEqual(skipped, [])
})

test("a line with no address is reported with its 1-based line number", () => {
  const { entries, skipped } = parseInviteList(
    ["dan@x.com", "Pat Jones", "pat@ (typo)", "jake@x.com"].join("\n")
  )
  assert.deepEqual(
    entries.map((e) => e.email),
    ["dan@x.com", "jake@x.com"]
  )
  assert.equal(skipped.length, 2)
  assert.equal(skipped[0].line, 2)
  assert.equal(skipped[0].text, "Pat Jones")
  assert.equal(skipped[1].line, 3)
})

test("an address with no dot in the domain is a typo, not an entry", () => {
  const { entries, skipped } = parseInviteList("dan@localhost")
  assert.deepEqual(entries, [])
  assert.equal(skipped.length, 1)
})

test("empty input parses to nothing at all", () => {
  const { entries, skipped } = parseInviteList("")
  assert.deepEqual(entries, [])
  assert.deepEqual(skipped, [])
})
