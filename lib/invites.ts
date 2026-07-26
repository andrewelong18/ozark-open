// Bulk invite entry (Sprint 20, closes #82): the pure half of the paste box on
// /admin/people. An admin pastes the ~32 people they expect, one per line, and
// this turns that into rows for tournament_invites.
//
// Deliberately forgiving about format and unforgiving about the email — the
// paste comes out of a group text or a spreadsheet column, so the shapes below
// all arrive in practice, but a line without a plausible address is reported
// back rather than guessed at.
//
// Pure module by design — no Supabase, no "@/" alias imports — so the
// node:test suite exercises the exact code the API route runs.

import { normalizeEmail } from "./roster.ts"

export type InviteEntry = {
  /** As pasted, trimmed — what gets stored in tournament_invites.email. */
  email: string
  /** The merge key. Agrees with the migration's lower(email) unique index. */
  normalizedEmail: string
  /** "" when the line was an address alone. */
  name: string
}

export type SkippedLine = {
  /** 1-based, counting every line in the paste including blanks. */
  line: number
  text: string
  reason: string
}

export type ParsedInviteList = {
  /** One per distinct email, in first-seen order. */
  entries: InviteEntry[]
  skipped: SkippedLine[]
}

/** Loose on purpose — Postgres already CHECKs position('@' in email) > 1. */
function looksLikeEmail(value: string): boolean {
  if (/\s/.test(value)) return false
  const at = value.indexOf("@")
  if (at < 1 || at !== value.lastIndexOf("@")) return false
  const domain = value.slice(at + 1)
  return domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".")
}

/**
 * Strip the quotes a spreadsheet-column paste brings with it. Applied per
 * field, never to the whole line — `"Smith, Dan","dan@x.com"` has quotes in
 * the middle, so stripping the line's outer pair would corrupt both fields.
 */
function unquote(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2) {
    const first = trimmed[0]
    const last = trimmed[trimmed.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1).trim()
    }
  }
  return trimmed
}

/**
 * A name field may still carry half a quote pair when a quoted CSV cell held
 * the comma we split on. Apostrophes inside a name (O'Brien) survive.
 */
function cleanName(value: string): string {
  return unquote(value).replace(/^"+|"+$/g, "").trim()
}

/**
 * Split one line into name + email. Accepted shapes:
 *   dan@x.com
 *   Dan Smith, dan@x.com          (also tab- or semicolon-separated)
 *   dan@x.com, Dan Smith          (either order)
 *   Dan Smith <dan@x.com>
 */
function parseLine(raw: string): { name: string; email: string } | null {
  const line = raw.trim()
  if (line === "") return null

  // "Dan Smith <dan@x.com>" — the mail-client form.
  const angled = line.match(/^(.*)<([^<>]+)>$/)
  if (angled) {
    const email = unquote(angled[2])
    return looksLikeEmail(email) ? { name: cleanName(angled[1]), email } : null
  }

  const parts = line
    .split(/[,;\t]/)
    .map(unquote)
    .filter((part) => part !== "")
  if (parts.length === 0) return null

  // A bare address, or the last resort for a line we can't split.
  if (parts.length === 1) {
    return looksLikeEmail(parts[0]) ? { name: "", email: parts[0] } : null
  }

  const emailIndex = parts.findIndex(looksLikeEmail)
  if (emailIndex === -1) return null
  const email = parts[emailIndex]
  const name = cleanName(parts.filter((_, i) => i !== emailIndex).join(" "))
  return { name, email }
}

/**
 * Parse the pasted list. Blank lines are ignored silently; a line with no
 * plausible address comes back under `skipped` so the admin can see the typo
 * instead of wondering why 31 of 32 people landed.
 *
 * Within one paste, a repeated email collapses to a single entry — last
 * non-empty name wins, so re-pasting with names filled in upgrades the row.
 */
export function parseInviteList(text: string): ParsedInviteList {
  const entries: InviteEntry[] = []
  const skipped: SkippedLine[] = []
  const indexByEmail = new Map<string, number>()

  const lines = (text ?? "").split(/\r?\n/)
  lines.forEach((raw, i) => {
    const trimmed = raw.trim()
    if (trimmed === "") return

    const parsed = parseLine(raw)
    if (!parsed) {
      skipped.push({
        line: i + 1,
        text: trimmed,
        reason: "no email address on this line",
      })
      return
    }

    const normalizedEmail = normalizeEmail(parsed.email)
    const existing = indexByEmail.get(normalizedEmail)
    if (existing !== undefined) {
      if (parsed.name !== "") entries[existing].name = parsed.name
      return
    }

    indexByEmail.set(normalizedEmail, entries.length)
    entries.push({ email: parsed.email.trim(), normalizedEmail, name: parsed.name })
  })

  return { entries, skipped }
}
