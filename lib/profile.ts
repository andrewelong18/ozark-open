// Self-serve profile edits (Sprint 15): the pure parse/validate half of
// PATCH /api/profile. A user may set only a cosmetic nickname and (via the
// avatarUpdated flag) refresh their avatar URL — display_name and is_admin are
// pinned in the DB guard trigger, never here.
//
// Pure module by design — no Supabase, no "@/" alias imports — so the
// node:test suite exercises the exact code the route runs.

export const NICKNAME_MAX = 24
export const DISPLAY_NAME_MAX = 40

// Letters (any language), numbers, spaces, and friendly punctuation. Keeps a
// nickname to a name — no newlines, no markup.
const NICKNAME_RE = /^[\p{L}\p{N} '"._!?()&-]+$/u
// A display name is the same shape but must be non-empty and is what everyone
// sees / what the importer matches against (ADR 0001 §11).
const DISPLAY_NAME_RE = NICKNAME_RE

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

// ---------------------------------------------------------------------------
// Onboarding (Sprint 16): the required first-run step. Same nickname + avatar
// as /profile, plus a REQUIRED display_name the member sets themselves — the
// one time they may (the DB guard pins it afterward; the admin verifies it at
// approval). Pure like the rest of this module.
// ---------------------------------------------------------------------------

export type OnboardingInput = {
  /** Trimmed, whitespace-collapsed display name. Never null — it's required. */
  displayName: string
  /** Trimmed nickname, or null to leave it unset. */
  nickname: string | null
  /** True when the client just uploaded a new avatar file to storage. */
  avatarUpdated: boolean
}

/** Trim + collapse internal whitespace; empty stays "" so validation can flag it. */
export function normalizeDisplayName(raw: unknown): string {
  if (typeof raw !== "string") return ""
  return raw.trim().replace(/\s+/g, " ")
}

export function parseOnboardingBody(
  body: unknown
): { ok: true; value: OnboardingInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Invalid request body." }
  }
  const b = body as Record<string, unknown>
  if (b.displayName != null && typeof b.displayName !== "string") {
    return { ok: false, error: "Display name must be text." }
  }
  if (b.nickname != null && typeof b.nickname !== "string") {
    return { ok: false, error: "Nickname must be text." }
  }
  return {
    ok: true,
    value: {
      displayName: normalizeDisplayName(b.displayName),
      nickname: normalizeNickname(b.nickname),
      avatarUpdated: b.avatarUpdated === true,
    },
  }
}

/** Validate a REQUIRED display name (onboarding + the admin-verify step). */
export function validateDisplayName(name: string): string | null {
  if (name.length === 0) return "Enter your name so everyone knows who's betting."
  if (name.length > DISPLAY_NAME_MAX)
    return `Name must be ${DISPLAY_NAME_MAX} characters or fewer.`
  if (!DISPLAY_NAME_RE.test(name))
    return "Name can only use letters, numbers, spaces, and basic punctuation."
  return null
}

export function validateOnboarding(
  input: OnboardingInput
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const nameError = validateDisplayName(input.displayName)
  if (nameError) errors.push(nameError)
  // Reuse the nickname rules for the optional field.
  const profileVerdict = validateProfile({
    nickname: input.nickname,
    avatarUpdated: input.avatarUpdated,
  })
  if (!profileVerdict.ok) errors.push(...profileVerdict.errors)
  return errors.length > 0 ? { ok: false, errors } : { ok: true }
}
