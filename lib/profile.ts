// Self-serve profile edits (Sprint 15): the pure parse/validate half of
// PATCH /api/profile. A user may set only a cosmetic nickname and (via the
// avatarUpdated flag) refresh their avatar URL — display_name and is_admin are
// pinned in the DB guard trigger, never here.
//
// Pure module by design — no Supabase, no "@/" alias imports — so the
// node:test suite exercises the exact code the route runs.

export const NICKNAME_MAX = 24

// Letters (any language), numbers, spaces, and friendly punctuation. Keeps a
// nickname to a name — no newlines, no markup.
const NICKNAME_RE = /^[\p{L}\p{N} '"._!?()&-]+$/u

export type ProfileInput = {
  /** Trimmed nickname, or null to clear it. */
  nickname: string | null
  /** True when the client just uploaded a new avatar file to storage. */
  avatarUpdated: boolean
}

/** Trim, collapse internal whitespace, and treat empty as "cleared" (null). */
export function normalizeNickname(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const trimmed = raw.trim().replace(/\s+/g, " ")
  return trimmed === "" ? null : trimmed
}

export function parseProfileBody(
  body: unknown
): { ok: true; value: ProfileInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Invalid request body." }
  }
  const b = body as Record<string, unknown>
  if (b.nickname != null && typeof b.nickname !== "string") {
    return { ok: false, error: "Nickname must be text." }
  }
  return {
    ok: true,
    value: {
      nickname: normalizeNickname(b.nickname),
      avatarUpdated: b.avatarUpdated === true,
    },
  }
}

export function validateProfile(
  input: ProfileInput
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = []
  if (input.nickname !== null) {
    if (input.nickname.length > NICKNAME_MAX) {
      errors.push(`Nickname must be ${NICKNAME_MAX} characters or fewer.`)
    }
    if (!NICKNAME_RE.test(input.nickname)) {
      errors.push(
        "Nickname can only use letters, numbers, spaces, and basic punctuation."
      )
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true }
}
