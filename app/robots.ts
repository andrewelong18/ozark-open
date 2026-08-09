import type { MetadataRoute } from "next"

// Keep the pool out of search results — WITHOUT blocking the crawler.
//
// Found during the Aug 9, 2026 production verification pass: ozark-open.com
// served no robots.txt, no `x-robots-tag` and no meta robots tag, and a
// `site:ozark-open.com` search returned a live hit — the landing page, indexed
// as https://www.ozark-open.com with its real title and description. A private
// invite-only betting pool was findable by name.
//
// ── WHY THIS ALLOWS CRAWLING, WHICH LOOKS BACKWARDS ────────────────────────
//
// The obvious fix is `Disallow: /`. It is the wrong one here, and would make
// the problem permanent.
//
// robots.txt controls CRAWLING, not INDEXING. Disallowing a URL that is
// already in the index doesn't remove it — it stops the crawler fetching the
// page, so Google never sees the `noindex` telling it to drop the entry, and
// the listing sits there indefinitely (usually as a bare URL with the snippet
// stripped). The two directives actively cancel out: `noindex` only works on a
// page a crawler is still allowed to read.
//
// So the de-index path is: allow the fetch, serve `noindex`, let Google
// re-crawl and drop it. That `noindex` lives in app/layout.tsx's metadata and
// therefore renders on every route.
//
// Note www.ozark-open.com — the host Google actually has indexed — 307s to the
// apex, so the crawler has to be allowed to follow that redirect and read the
// apex page. `Disallow: /` would have blocked exactly that hop.
//
// Nothing here is an SEO feature; "public access, SEO" stays out of scope. It
// is the mechanism for being forgotten, which needs the door left open.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
  }
}
