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

- [ ] `AdSlot` component: fixed 3.2:1 aspect-ratio box at content-column width, subtle on-brand frame with a small "Sponsored" tag (part of the joke); renders image or looping muted video by file type.
- [ ] Creatives live in `public/ads/` with a tiny `ads.json` manifest (`file`, `alt`, optional `href`); the slot picks one at random per page load — no weighting, no impression tracking, obviously.
- [ ] Place the slot at the bottom of `/dashboard` and the bottom of the landing page (`/`, pre-login — static assets, no data fetch, so no RLS concern).
- [ ] Drop in the first creative(s) from Andrew and verify both placements on desktop and a phone (scaling, loop, tap-through if `href` is set).

**Done when:** a creative designed to the spec above, dropped into `public/ads/` and listed in the manifest, shows correctly at the bottom of both pages on desktop and phone with no code change.
