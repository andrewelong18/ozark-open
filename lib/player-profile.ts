// Player profile read path (Sprint 18): the pure half of the profile modal —
// normalizing the users-row profile fields and parsing the past-finishes
// series into a sorted, render-ready shape.
//
// Sprint 26 changed what that series MEANS. It used to be a made-up score
// drawn as a bar chart; it is now the member's finishing PLACE, which is a
// rank — lower is better, ties are real ("T15"), and a bar's height says
// nothing true about it. Hence places, not values, and circles, not bars.
// The deterministic dummy series went with it: a member with no finishes now
// renders no section at all rather than an invented one.
//
// Pure module by design — no Supabase, no "@/" alias imports — so the
// node:test suite exercises the exact code the modal runs.

// ---------------------------------------------------------------------------
// Profile fields
// ---------------------------------------------------------------------------

/**
 * One finish in a member's Ozark Open history.
 *
 * `place` is the sheet's own string, rendered verbatim ("1", "T15").
 * `rank` is that string as a number for ordering and the medal accent, and
 * `tied` records the leading T — so the UI never has to re-parse the string.
 */
export type PlacePoint = {
  year: number
  place: string
  rank: number
  tied: boolean
}

/** The fully-normalized profile the modal renders. Identity fields always
 * present; the descriptive fields fall back to friendly placeholders so a
 * member the admin hasn't filled in yet still reads cleanly. */
export type PlayerProfile = {
  display_name: string
  nickname: string | null
  avatar_url: string | null
  bio: string | null
  hometown: string | null
  member_since: number | null
  strength: string | null
  weakness: string | null
  past_performance: PlacePoint[]
}

/** Raw users-row shape the modal query returns (profile columns are all
 * nullable; PostgREST may hand smallints back as strings). */
export type ProfileQueryRow = {
  display_name?: string | null
  nickname?: string | null
  avatar_url?: string | null
  bio?: string | null
  hometown?: string | null
  member_since?: number | string | null
  strength?: string | null
  weakness?: string | null
  past_performance?: unknown
}

/** A finite integer or null — guards the smallint/jsonb-number coercions. */
function toIntOrNull(value: unknown): number | null {
  if (value == null || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n) : null
}

/**
 * Parse the past_performance jsonb into a sorted, sanitized finish series.
 * Accepts an already-parsed array or a JSON string (defensive — the browser
 * client hands back parsed jsonb, but a bad upload shouldn't crash the modal).
 *
 * Drops anything without a finite year AND a usable place, which is also how
 * the Sprint 18 `{ year, value }` rows fall out: they carry no place, so a
 * database that predates the migration renders an empty section instead of
 * scores relabelled as finishes.
 */
export function parsePastPerformance(raw: unknown): PlacePoint[] {
  let arr: unknown = raw
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(arr)) return []
  const points: PlacePoint[] = []
  for (const item of arr) {
    if (item == null || typeof item !== "object") continue
    const year = toIntOrNull((item as Record<string, unknown>).year)
    if (year == null) continue
    const point = toPlacePoint(year, (item as Record<string, unknown>).place)
    if (point) points.push(point)
  }
  return points.sort((a, b) => a.year - b.year)
}

/** A raw place cell → a PlacePoint, or null if there's no rank in it. */
function toPlacePoint(year: number, raw: unknown): PlacePoint | null {
  if (raw == null) return null
  const place = String(raw).trim()
  if (place === "") return null
  const tied = /^t/i.test(place)
  const rank = toIntOrNull(tied ? place.slice(1) : place)
  if (rank == null || rank < 1) return null
  // Normalized, so "t15" and "T15.0" both render as the app writes them.
  return { year, place: tied ? `T${rank}` : String(rank), rank, tied }
}

/**
 * Flatten a users row into the modal's profile shape. A missing/blank text
 * field becomes null (the modal renders a placeholder); the finish series is
 * parsed and left empty when there is none, which is the modal's signal to
 * drop the Past Finishes section entirely — a 2026 debutant has no history,
 * and inventing one was the old behavior this replaces.
 */
export function normalizeProfileRow(row: ProfileQueryRow | null): PlayerProfile {
  const trimmed = (v: string | null | undefined): string | null => {
    const t = (v ?? "").trim()
    return t.length > 0 ? t : null
  }
  return {
    display_name: trimmed(row?.display_name) ?? "Unknown member",
    nickname: trimmed(row?.nickname),
    avatar_url: trimmed(row?.avatar_url),
    bio: trimmed(row?.bio),
    hometown: trimmed(row?.hometown),
    member_since: toIntOrNull(row?.member_since),
    strength: trimmed(row?.strength),
    weakness: trimmed(row?.weakness),
    past_performance: parsePastPerformance(row?.past_performance),
  }
}
