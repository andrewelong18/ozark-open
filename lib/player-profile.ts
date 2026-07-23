// Player profile read path (Sprint 18): the pure half of the profile modal —
// normalizing the users-row profile fields, parsing the 4-year stats series
// into a sorted chart-ready shape, a deterministic dummy series for members
// whose column is still null, and the value→geometry math the SVG chart draws.
//
// Pure module by design — no Supabase, no "@/" alias imports — so the
// node:test suite exercises the exact code the modal runs.

// ---------------------------------------------------------------------------
// Profile fields
// ---------------------------------------------------------------------------

/** One point in a member's Ozark Open stat history — a year and its value. */
export type StatPoint = { year: number; value: number }

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
  past_performance: StatPoint[]
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
 * Parse the past_performance jsonb into a sorted, sanitized series. Accepts an
 * already-parsed array or a JSON string (defensive — the browser client hands
 * back parsed jsonb, but a bad upload shouldn't crash the modal). Drops any
 * point missing a finite year/value; sorts oldest→newest for the chart.
 */
export function parsePastPerformance(raw: unknown): StatPoint[] {
  let arr: unknown = raw
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(arr)) return []
  const points: StatPoint[] = []
  for (const item of arr) {
    if (item == null || typeof item !== "object") continue
    const year = toIntOrNull((item as Record<string, unknown>).year)
    const value = Number((item as Record<string, unknown>).value)
    if (year == null || !Number.isFinite(value)) continue
    points.push({ year, value })
  }
  return points.sort((a, b) => a.year - b.year)
}

/**
 * Deterministic dummy 4-year series from a user id — used only when a member
 * has no seeded past_performance yet, so their chart still has shape (and a
 * distinct one) instead of rendering empty. Mirrors the migration's intent.
 */
export function dummyPastPerformance(userId: string, endYear = 2025): StatPoint[] {
  // Small stable hash of the id → four pseudo-varied values in [40, 95).
  let h = 0
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0
  const seeds = [h, (h / 2) | 0, (h / 3) | 0, (h / 5) | 0]
  return seeds.map((s, i) => ({
    year: endYear - (3 - i),
    value: 40 + (s % 55),
  }))
}

/**
 * Flatten a users row into the modal's profile shape. A missing/blank text
 * field becomes null (the modal renders a placeholder); the stat series is
 * parsed, and — if empty — replaced with the deterministic dummy so the chart
 * always has something to draw. `userId` seeds that fallback.
 */
export function normalizeProfileRow(
  row: ProfileQueryRow | null,
  userId: string
): PlayerProfile {
  const trimmed = (v: string | null | undefined): string | null => {
    const t = (v ?? "").trim()
    return t.length > 0 ? t : null
  }
  const parsed = parsePastPerformance(row?.past_performance)
  return {
    display_name: trimmed(row?.display_name) ?? "Unknown member",
    nickname: trimmed(row?.nickname),
    avatar_url: trimmed(row?.avatar_url),
    bio: trimmed(row?.bio),
    hometown: trimmed(row?.hometown),
    member_since: toIntOrNull(row?.member_since),
    strength: trimmed(row?.strength),
    weakness: trimmed(row?.weakness),
    past_performance: parsed.length > 0 ? parsed : dummyPastPerformance(userId),
  }
}

// ---------------------------------------------------------------------------
// Chart geometry — value→bar math the SVG chart draws (pure, so it's tested)
// ---------------------------------------------------------------------------

export type ChartBar = StatPoint & {
  /** Bar height in px, scaled so the max value fills `height`. */
  barHeight: number
  /** Whether this is the (first) best year — the gold-highlighted bar. */
  best: boolean
}

/**
 * Map a stat series to bar geometry for a chart of the given inner height.
 * Bars scale against the series max (min floor of 1 so a flat/zero series
 * doesn't divide by zero); the earliest peak year is flagged `best` for the
 * gold accent. Returns [] for an empty series.
 */
export function chartBars(data: StatPoint[], height: number): ChartBar[] {
  if (data.length === 0) return []
  const max = Math.max(1, ...data.map((d) => d.value))
  const bestValue = Math.max(...data.map((d) => d.value))
  let bestFlagged = false
  return data.map((d) => {
    const best = !bestFlagged && d.value === bestValue
    if (best) bestFlagged = true
    return {
      ...d,
      barHeight: Math.max(0, (d.value / max) * height),
      best,
    }
  })
}
