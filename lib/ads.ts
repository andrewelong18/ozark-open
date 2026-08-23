// Fake-sponsor creatives for the dashboard ad slot (Sprint 13). The whole
// point is the joke, so there is no weighting, no targeting and no impression
// tracking — just a list the carousel rotates through.
//
// Creatives are 800 x 600 (4:3) and live in `public/ads/`. That canvas is a 2x
// export for the slot's 400px cap; see docs/sprints/sprint-13.md for the design
// spec (type floor, safe margins, why the file carries no border of its own).
//
// To add one: drop the file in `public/ads/` and add a row here. `href` is
// optional — an ad without one renders as a plain image rather than a link.

export type Ad = {
  /** Filename inside `public/ads/`. */
  file: string
  /** Describes the joke, not the artwork — this is the punchline for anyone on a screen reader. */
  alt: string
  /** Optional outbound link. Opens in a new tab. */
  href?: string
}

export const ads: Ad[] = [
  {
    file: "ozark-records.jpg",
    alt: "Ad for the Ozark Open 5 Year Anniversary Soundtrack from Ozark Open Records — a greatest hits compilation, out now on Spotify.",
  },
  {
    file: "sandpit-podcast.jpg",
    alt: "Ad for The Sandpit Podcast, on Spotify.",
  },
  {
    file: "jdaddy-book.png",
    alt: "Ad for the book J Daddy's 6 Rules, a New York Times bestseller, $79.99 plus shipping and handling.",
  },
  {
    file: "cumm-news.png",
    alt: "Ad for C.U.M.M News — journalism you can count on.",
  },
  {
    file: "hammer-leicht.jpg",
    alt: "Ad for the Law Office of Patrick \"The Hammer\" Leicht, tax defense attorney — protecting your Venmo from IRS harassment. Call 1-800-809-6969.",
  },
]
