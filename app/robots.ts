import type { MetadataRoute } from "next"

// Keep the pool out of search results.
//
// Found during the Aug 9, 2026 production verification pass. Every route is
// already behind auth — signed out, all twelve protected paths 307 to /login,
// checked against ozark-open.com — so this is a privacy matter, not a security
// one. But `/` and `/login` are public by necessity, and on the custom domain
// they carried no `x-robots-tag` and there was no robots.txt, so a private
// invite-only betting pool was fully crawlable by name.
//
// The `.vercel.app` aliases were never at risk: Vercel stamps `x-robots-tag:
// noindex` on deployments it protects, which is exactly why this went unnoticed
// — the protected URLs looked fine and the real one didn't have the header.
//
// Disallow everything rather than just the private routes. There is no page
// here we want found: "public access, SEO" is explicitly out of scope, and the
// ~32 people who need this URL are getting it by text message.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  }
}
