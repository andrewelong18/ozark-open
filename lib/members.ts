// Admin-created members (Sprint 23 / #124) — the pure half of
// POST /api/admin/members.
//
// Pat's ask from the Jul 31 dry run: "some members will struggle with the
// email/magic-link flow — let me add them myself and place their wagers for
// them." The wager half shipped in Sprint 23 (`/bets?for=<userId>`); this is the
// account half, and this module is the part of it that can be unit-tested. The
// GoTrue call itself lives in the route.
//
// Pure module by design — no Supabase, no "@/" alias imports — so the node:test
// suite exercises the exact code the API route runs. Same convention as
// lib/validation.ts and lib/invites.ts.
//
// The entry fee is deliberately NOT validated here. Approval is a separate call
// to the already-shipped POST /api/admin/participants, which runs
// validateEntryFee against the tournaments row — duplicating that check would
// give the money two sources of truth.

import { looksLikeEmail } from "./invites.ts"
import { normalizeDisplayName, validateDisplayName } from "./profile.ts"
import { normalizeEmail } from "./roster.ts"

export type NewMemberInput = {
  /** As typed, trimmed — what the auth account is created with. */
  email: string
  /** The merge key, and what the duplicate check compares against. */
  normalizedEmail: string
  /** Trimmed, whitespace-collapsed. Required — see below. */
  displayName: string
}

export function parseNewMemberBody(
  body: unknown
): { ok: true; value: NewMemberInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Invalid request body." }
  }
  const b = body as Record<string, unknown>
  if (b.email != null && typeof b.email !== "string") {
    return { ok: false, error: "Email must be text." }
  }
  if (b.displayName != null && typeof b.displayName !== "string") {
    return { ok: false, error: "Name must be text." }
  }
  const email = typeof b.email === "string" ? b.email.trim() : ""
  return {
    ok: true,
    value: {
      email,
      normalizedEmail: normalizeEmail(email),
      displayName: normalizeDisplayName(b.displayName),
    },
  }
}

/**
 * Validate the pair. Both fields are REQUIRED, and the name especially:
 *
 * `handle_new_user()` seeds display_name with the email address, and
 * `lib/import.ts` links picks to people by matching display_name (ADR 0001 §11,
 * PRD §12 A10). A member whose display_name stayed an email address would never
 * match a pick, which silently disables their self-bet cap, their self-pick
 * flag and their opponent block — the wagers would all be accepted and some of
 * them would be wrong. So the admin names them at creation time, not later.
 *
 * Every error is collected rather than returned first-one-wins, matching
 * validateOnboarding — the form shows them together.
 */
export function validateNewMember(
  input: NewMemberInput
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = []

  if (input.email === "") {
    errors.push("Enter their email address.")
  } else if (!looksLikeEmail(input.email)) {
    errors.push(`"${input.email}" doesn't look like an email address.`)
  }

  const nameError = validateDisplayName(input.displayName)
  if (nameError) errors.push(nameError)

  return errors.length > 0 ? { ok: false, errors } : { ok: true }
}
