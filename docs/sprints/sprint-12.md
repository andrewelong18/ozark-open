# Sprint 12 — Animation & Delight Pass + Jake Celebration (Bonus)

> Part of the [Ozark Open roadmap](../ROADMAP.md). **Bonus wish-list sprint (added Jul 18, 2026)** — an enhancement, never an MVP blocker. Work it only when no MVP sprint (0–9) is waiting.

**Goal:** the app feels slick and modern — intentional motion throughout — and placing a bet summons the Jake celebration: his face animates in with a sound.
**Target:** before the Aug 28 feature freeze (the Jake celebration is a feature, not post-freeze polish) · **Blockers:** a photo of Jake's face and a short sound clip from Andrew — neither exists in the design skill's assets yet. Polish pages only after they're functionally verified in the browser (#31).

**Reads:** the `ozark-open-design` skill (visual source of truth — motion must fit the brand), `DESIGN_SYSTEM.md` (how tokens are wired into the app).

- [x] Define the motion vocabulary once — durations and easings as CSS custom properties alongside the existing design tokens. CSS transitions/keyframes first; add a motion library only if something genuinely needs orchestration. **Done Aug 12, 2026 with zero new dependencies.** Two tiers on IBM Carbon's productive/expressive split; every curve a named Material 3 or Penner value rather than an eyeballed one. Lives in the design skill (`tokens/motion.css` + two playable `guidelines/motion-*.card.html` specimens) *first*, ported to `app/globals.css` second — a new page now inherits motion the way it inherits colour.
- [x] Apply the pass app-wide: page/route transitions, card and list entrances (`/bets` menu, My Bets), button/press feedback, banner and toast in/out, fade or skeleton for loading states. **Done.** Route fade (`components/route-fade.tsx`), staggered row/section entrances on the four read-only pages, the bet-menu filter swap, the bet-error toast's enter *and* exit, press/hover retokening across 16 sites, and `loading.tsx` skeletons for `/leaderboard`, `/results`, `/my-bets`.
- [x] Respect `prefers-reduced-motion` everywhere — degrade to fades or nothing. **Done**, as a blanket floor in `@layer base` plus `motion-safe:` on decorative entrances. The floor is `0.01ms`, never `0s` and never `animation: none` — see the note below.
- [ ] **Jake celebration:** on a *successful* placement (the API confirm, not the button click), Jake's face animates in — springs on, holds a beat, exits — with the sound. Keep playback in the user-gesture chain so mobile autoplay rules allow it; add a mute toggle persisted in `localStorage`. **Still blocked on assets** ([#164](https://github.com/andrewelong18/ozark-open/issues/164)).
- [ ] Add the Jake image + audio to the design skill's assets and reference them from the app (optimized: small webp/avif, short compressed audio clip). **Still blocked on assets** ([#164](https://github.com/andrewelong18/ozark-open/issues/164)).
- [x] Mobile check: smooth on a mid-tier phone — animate `transform`/`opacity` only, no layout-thrashing properties. **Done**, with one documented exception (the progress bar's width) and one hazard caught by test: the bet slip is `position: fixed` inside the route wrapper, and a transform-animated ancestor becomes its containing block, which would peel the bar off the viewport on every navigation. The entrance animates opacity only, and `e2e/motion.spec.ts` measures the bar mid-flight to keep it that way.

**Done when:** clicking around the deployed app feels fluid rather than page-flippy, a placed bet reliably summons Jake with sound on both phone and desktop (and mutes when asked), and `prefers-reduced-motion` users get a calm version.

---

## What shipped, Aug 12 2026 — the motion half

Six commits, no new npm dependencies. The full check gate (389 unit tests, lint,
`tsc --noEmit`, `next build`) and the full Playwright suite (**49 passed, 0
failed**, against a real local Supabase stack) are green.

**Two bugs found on the way in**, both pre-existing:

- `components/ui/dialog.tsx` used `duration-[--dur-slow]`, Tailwind v3 syntax
  for an implicit `var()`. v4 removed it, so what shipped was
  `transition-duration: --dur-slow` — invalid, resolving to `0s`. **The dialog
  had not animated since Sprint 18.**
- `e2e/results-and-reveal.spec.ts` asserted `getByText("Pool $N")`, which
  matches twice on `/results` (the gold badge and the settlement summary's
  "Pool $N · 3 entries"). The assertion landed in `11f200e`; `e9a4c7d` added
  the second element three days later. Nobody noticed because the e2e job is
  `workflow_dispatch`, not a merge gate.

**Three things were tried and deliberately reverted** — each recorded in
`DESIGN_SYSTEM.md` § Motion and in the design skill, so they don't get
re-attempted:

1. **`grid-template-rows: 0fr → 1fr` collapses.** A `0fr` collapse must keep its
   content mounted, which trades "absent" for "present but clipped".
   `overflow: hidden` does not empty a bounding box, so the content still
   answers a text query. On `ClosedBetCard` that would have forced
   `e2e/bets-menu.spec.ts` (#103) to stop asserting bettor names are absent
   while collapsed — weakening a real guard on the reveal-at-close contract to
   buy a 24px height animation. On the admin console it made "Playing golfer"
   resolve to two checkboxes. Two independent tests, one root cause.
2. **React `<ViewTransition>` for route transitions.** Would have given the gold
   nav pill a genuine shared-element morph — Framer Motion's `layoutId` effect,
   natively. But `experimental.viewTransition: true` alone does nothing:
   instrumenting `document.startViewTransition` in a real browser counted
   **zero** calls on a `<Link>` navigation and zero on `router.refresh()`. It
   needs an explicit component in every `page.tsx` — ten-plus files behind an
   experimental React API, three weeks before this has to work unattended at a
   live tournament. Replaced with a pathname-keyed CSS fade, which as a bonus
   *cannot* fire on `router.refresh()`.
3. **Gating `hover:` behind `@media (hover: hover)`.** Tailwind compiles
   `hover:` to a bare `:hover`, so a tap on a phone leaves the hover style
   stuck. `@custom-variant` will not override a built-in variant in Tailwind
   4.2.4 — both forms compile silently to nothing ([#165](https://github.com/andrewelong18/ozark-open/issues/165)).

**The riskiest decision, and what it's actually worth.** The reduced-motion
floor is `0.01ms` rather than `0s` or `animation: none`, because Base UI keeps
`Dialog.Popup` mounted until `getAnimations()` settles and `BetErrorToast`
unmounts on `animationend` — with `none` there is no animation and no event.
`e2e/motion.spec.ts` was then run against three sabotaged builds instead of
trusting that reasoning:

| sabotage | result |
|---|---|
| floor → `animation: none`, toast fallback intact | still passes |
| toast fallback removed, floor intact | still passes |
| **both removed** | **`reduce` branch fails** |

So the floor is not individually load-bearing today — two independent
protections cover each other. The comments that claimed otherwise were
rewritten. It stays at `0.01ms` because the next component that unmounts on an
event won't arrive with a belt of its own.

**Every new test was verified by sabotage**, not by passing: the filter-swap
test fails when `key={facetKey}` is restored (proving it guards the typed-stake
regression), and the route-fade test fails when the entrance uses a transform
(proving it guards `position: fixed`).

**Residue:** the Jake celebration and its assets ([#164](https://github.com/andrewelong18/ozark-open/issues/164)), the
`hover:` gating ([#165](https://github.com/andrewelong18/ozark-open/issues/165)), and a browser pass on a real
phone ([#166](https://github.com/andrewelong18/ozark-open/issues/166)).
