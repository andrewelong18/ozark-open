// Probabilities arrive from the admin's sheet as decimals (0.4761…) and are
// shown to one decimal place ("47.6%") per PRD §6 — never recomputed from
// the odds. Applies to both a pick's probability and a bet's total.
export function formatProbability(decimal: number): string {
  return `${(decimal * 100).toFixed(1)}%`
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * "3 days ago" for an admin-facing timestamp — /admin/roster's last-login
 * column. `now` is injectable so the buckets are testable. A missing or
 * unparseable stamp reads "Never": an invite-only roster row has no account
 * at all. A future stamp reads "just now" rather than a negative duration.
 *
 * Hand-rolled rather than Intl.RelativeTimeFormat so the strings don't shift
 * between ICU builds (and between the Vercel server and the browser).
 */
export function formatRelativeTime(
  iso: string | null | undefined,
  now: number | Date = Date.now()
): string {
  if (!iso) return "Never"
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return "Never"

  const elapsed = (now instanceof Date ? now.getTime() : now) - then
  if (elapsed < MINUTE) return "just now"
  if (elapsed < HOUR) return plural(Math.floor(elapsed / MINUTE), "minute")
  if (elapsed < DAY) return plural(Math.floor(elapsed / HOUR), "hour")
  if (elapsed < 7 * DAY) return plural(Math.floor(elapsed / DAY), "day")
  if (elapsed < 35 * DAY) return plural(Math.floor(elapsed / (7 * DAY)), "week")
  if (elapsed < 365 * DAY)
    return plural(Math.floor(elapsed / (30 * DAY)), "month")
  return plural(Math.floor(elapsed / (365 * DAY)), "year")
}

/**
 * The absolute stamp shown on hover next to a relative one. Pinned to the
 * tournament's clock so a server render doesn't print UTC and the string
 * doesn't shift between server and client. "" for a missing stamp.
 */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return `${date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Chicago",
  })} CT`
}
