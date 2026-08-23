// Unit tests for lib/site-url.ts — the canonical-domain rules. Zero-dependency:
// node:test via npm test.

import test from "node:test"
import assert from "node:assert/strict"

import {
  CANONICAL_ORIGIN,
  needsCanonicalRedirect,
  siteOrigin,
} from "./site-url.ts"

// ---------------------------------------------------------------------------
// siteOrigin — what goes in the magic link
// ---------------------------------------------------------------------------

test("production ignores the request host entirely", () => {
  for (const host of [
    "ozark-open.com",
    "www.ozark-open.com",
    "ozark-open-sportsbook.vercel.app",
    "ozark-open-sportsbook-nerdyandyproject.vercel.app",
  ]) {
    assert.equal(siteOrigin(host, "production"), CANONICAL_ORIGIN)
  }
})

test("preview deploys keep their own host, so their links stay in the preview", () => {
  assert.equal(
    siteOrigin("ozark-open-git-fix-abc.vercel.app", "preview"),
    "https://ozark-open-git-fix-abc.vercel.app"
  )
})

test("local dev speaks http, including on a non-3000 port", () => {
  assert.equal(siteOrigin("localhost:3000", undefined), "http://localhost:3000")
  assert.equal(siteOrigin("localhost:3001", undefined), "http://localhost:3001")
  assert.equal(siteOrigin("127.0.0.1:3000", undefined), "http://127.0.0.1:3000")
})

test("a missing Host header falls back to local dev, never to prod", () => {
  assert.equal(siteOrigin(null, undefined), "http://localhost:3000")
  assert.equal(siteOrigin(undefined, "preview"), "http://localhost:3000")
})

// ---------------------------------------------------------------------------
// needsCanonicalRedirect — the middleware's front door
// ---------------------------------------------------------------------------

test("every production alias but the canonical host redirects", () => {
  for (const host of [
    "ozark-open-sportsbook.vercel.app",
    "ozark-open-lyart.vercel.app",
    "ozark-open-sportsbook-git-main-nerdyandyproject.vercel.app",
    "www.ozark-open.com",
  ]) {
    assert.equal(needsCanonicalRedirect(host, "production"), true, host)
  }
})

test("the canonical host does not redirect to itself", () => {
  assert.equal(needsCanonicalRedirect("ozark-open.com", "production"), false)
  // Case and an explicit port are still the same host — a loop here would take
  // the whole site down, so both are pinned.
  assert.equal(needsCanonicalRedirect("Ozark-Open.com", "production"), false)
  assert.equal(needsCanonicalRedirect("ozark-open.com:443", "production"), false)
})

test("previews and local dev are never redirected", () => {
  assert.equal(needsCanonicalRedirect("ozark-open-git-x.vercel.app", "preview"), false)
  assert.equal(needsCanonicalRedirect("localhost:3000", undefined), false)
})

test("a missing VERCEL_ENV fails open rather than bouncing the request", () => {
  assert.equal(needsCanonicalRedirect("ozark-open-sportsbook.vercel.app", undefined), false)
})
