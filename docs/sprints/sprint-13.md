# Sprint 13 — Funny Ad Slots (Bonus)

> Part of the [Ozark Open roadmap](../ROADMAP.md). **Bonus wish-list sprint (added Jul 18, 2026)** — an enhancement, never an MVP blocker. Work it only when no MVP sprint (0–9) is waiting.

**Goal:** fake-sponsor ad slots — one at the bottom of the `/dashboard` main page, one on the pre-login landing page (`/`) — that display Andrew's funny static or animated creatives. The app supplies the slots and rotation; Andrew designs the ads to the spec below.
**Target:** as time allows before the Aug 28 feature freeze · **Blockers:** none for the slot code; at least one finished creative from Andrew before it ships visibly.

**Reads:** the `ozark-open-design` skill (the slot chrome — border, "Sponsored" tag — must be on-brand), `app/page.tsx` + `app/dashboard/page.tsx` (the two placements).

## Creative spec (design to this — it matches the app's real layout)

Both pages run a single content column: 640 CSS px max on the landing page, 576 on the dashboard, shrinking to viewport width minus padding on phones (~343 CSS px on a 375 px screen). One creative format serves both slots:

- **Canvas: 1280 × 400 px (3.2 : 1)** — a 2× export that renders at up to 640 × 200 CSS px and scales down to ~343 × 107 on small phones. The slot locks the aspect ratio, so never letterboxes or crops.
- **Legibility floor:** keep text ≥ 48 px on the 1280-wide canvas (≈ 13 px at the smallest render) and keep anything essential inside a 64 px safe margin.
- **Formats:** static — WebP or PNG, ≤ 300 KB. Animated — looping muted WebM/MP4 or animated WebP preferred, GIF accepted, ≤ 1.5 MB, loops fine but no audio (autoplay with sound is blocked anyway).

## Tasks

> **As built, Aug 24, 2026.** The four boxes below were written before the
> creatives existed and before the landing-page overhaul, and the shipped slot
> departs from them in four ways worth recording rather than quietly
> reinterpreting ([#171](https://github.com/andrewelong18/ozark-open/issues/171)):
> it is `AdCarousel`, not `AdSlot`; the manifest is `lib/ads.ts`, not
> `ads.json` (a typed module the importer of a creative cannot typo); it
> **rotates** every 5s instead of picking one per page load; and it is **4:3**
> rather than 3.2:1, because that is the canvas the five creatives were drawn
> on. It sits in the dashboard's right rail under the activity feed, not at the
> bottom of the page — the dashboard the spec describes no longer exists.

- [x] ~~`AdSlot` component~~ → **`components/ads/ad-carousel.tsx`**: 4:3 box, on-brand frame, a "Sponsored" tag in the caption bar (part of the joke), image creatives. Rotation pauses on hover and on keyboard focus, which is the WCAG 2.2.2 escape hatch for auto-updating content; motion is productive-tier on purpose, because a thing that loops forever in the corner of a page reads as a nag in the expressive tier.
- [x] Creatives live in `public/ads/` with **`lib/ads.ts`** as the manifest (`file`, `alt`, optional `href`) — five of them, 800 × 600 (a 2x export for the slot's 400px cap). No weighting, no impression tracking, obviously.
- [x] Place the slot on `/dashboard` — the **right rail**, under the activity feed.
- [x] ~~The **landing-page slot** (`/`, pre-login)~~ — **CUT Aug 31, 2026** (Andrew). Never built, and now deliberately not: it is past the feature freeze, the joke lands inside the app where the audience already is, and the landing page is what people see *before* they are members. Threading a rotating slot into it would also mean reckoning with `docs/LANDING_PAGE_OVERHAUL.md` §3 — an as-built spec carrying two load-bearing rules each learned from a shipped bug — for a gag that already has a home.
- [ ] Wire `href` on the creatives that should link out ([#170](https://github.com/andrewelong18/ozark-open/issues/170)) — the URLs are Andrew's to supply; an ad without one renders as a plain image, which is the current state of all five.

**Done when:** a creative designed to the spec above, dropped into `public/ads/` and listed in the manifest, shows correctly at the bottom of both pages on desktop and phone with no code change.
