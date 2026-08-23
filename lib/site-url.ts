// The one place that knows what this app's address is.
//
// The bug that produced this module (Aug 23, 2026): a member started at
// ozark-open.com, typed their email, and the magic link in their inbox pointed
// at ozark-open-sportsbook.vercel.app. Two separate causes, both fixed here and
// in the Supabase auth config:
//
//   1. The email template builds its link from `{{ .SiteURL }}` — a fixed
//      server-side Supabase setting, not the host the request came from. It was
//      still the .vercel.app URL from before the domain was bought, so EVERY
//      link went there regardless of where the sign-in started.
//   2. `emailRedirectTo` was derived from the request host, so the two halves
//      could disagree — and ozark-open.com wasn't in the redirect allow-list
//      anyway, which would have made the app's half lose the tie.
//
// So: in production there is exactly ONE origin, the one on the domain Andrew
// actually bought. Not a preference — a link a member gets must match the URL
// they were told to visit, or the session cookie lands on the wrong origin.
//
// Pure module by design — no next/headers, no request objects — so both the
// middleware and the login server action can share it and node:test can drive
// every branch.

/** The domain members are given. Everything else is an alias that redirects. */
export const CANONICAL_HOST = "ozark-open.com"

/** The only origin production ever puts in a link, a cookie, or an email. */
export const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`

/** Where local dev lives when there's no request host to read. */
const LOCAL_ORIGIN = "http://localhost:3000"

/** Hostnames that are a developer's own machine, and so speak http. */
function isLoopback(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1"
  )
}

/** `host` header minus any :port, lowercased. */
function hostname(host: string): string {
  const trimmed = host.trim().toLowerCase()
  // IPv6 literals keep their brackets; everything else splits on the colon.
  if (trimmed.startsWith("[")) return trimmed.slice(0, trimmed.indexOf("]") + 1)
  return trimmed.split(":")[0]
}

/**
 * The origin to build user-facing absolute URLs from — magic-link callbacks
 * above all.
 *
 * In production it is always the canonical domain, whatever host the request
 * arrived on, because the middleware has already sent every other host there.
 * Elsewhere (preview deploys, `next dev`) it's the request's own host, so a
 * preview's links stay inside that preview instead of bouncing to prod.
 *
 * @param host       the request's Host header
 * @param vercelEnv  process.env.VERCEL_ENV — "production" | "preview" | undefined
 */
export function siteOrigin(
  host: string | null | undefined,
  vercelEnv: string | undefined
): string {
  if (vercelEnv === "production") return CANONICAL_ORIGIN
  if (!host) return LOCAL_ORIGIN
  const protocol = isLoopback(hostname(host)) ? "http" : "https"
  return `${protocol}://${host.trim()}`
}

/**
 * True when this request reached a production alias that isn't the canonical
 * domain (the .vercel.app URLs, www.) and should be 308'd to it.
 *
 * Gated on VERCEL_ENV === "production" so preview deployments — whose whole
 * job is to be a different host — are left alone, and so a missing env var
 * fails OPEN (no redirect) rather than bouncing local dev at the front door.
 */
export function needsCanonicalRedirect(
  host: string | null | undefined,
  vercelEnv: string | undefined
): boolean {
  if (vercelEnv !== "production") return false
  if (!host) return false
  return hostname(host) !== CANONICAL_HOST
}
