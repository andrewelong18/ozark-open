# Sprint 12 — Animation & Delight Pass + Jake Celebration (Bonus)

> Part of the [Ozark Open roadmap](../ROADMAP.md). **Bonus wish-list sprint (added Jul 18, 2026)** — an enhancement, never an MVP blocker. Work it only when no MVP sprint (0–9) is waiting.

**Goal:** the app feels slick and modern — intentional motion throughout — and placing a bet summons the Jake celebration: his face animates in with a sound.
**Target:** before the Aug 28 feature freeze (the Jake celebration is a feature, not post-freeze polish) · **Blockers:** ~~a photo of Jake's face and a short sound clip from Andrew~~ **cleared Aug 23, 2026** — Andrew supplied a 1.63s video instead, which carries both. Polish pages only after they're functionally verified in the browser (#31).

**Reads:** the `ozark-open-design` skill (visual source of truth — motion must fit the brand), `DESIGN_SYSTEM.md` (how tokens are wired into the app).

- [x] Define the motion vocabulary once — durations and easings as CSS custom properties alongside the existing design tokens. CSS transitions/keyframes first; add a motion library only if something genuinely needs orchestration. **Done Aug 12, 2026 with zero new dependencies.** Two tiers on IBM Carbon's productive/expressive split; every curve a named Material 3 or Penner value rather than an eyeballed one. Lives in the design skill (`tokens/motion.css` + two playable `guidelines/motion-*.card.html` specimens) *first*, ported to `app/globals.css` second — a new page now inherits motion the way it inherits colour.
- [x] Apply the pass app-wide: page/route transitions, card and list entrances (`/bets` menu, My Bets), button/press feedback, banner and toast in/out, fade or skeleton for loading states. **Done.** Route fade (`components/route-fade.tsx`), staggered row/section entrances on the four read-only pages, the bet-menu filter swap, the bet-error toast's enter *and* exit, press/hover retokening across 16 sites, and `loading.tsx` skeletons for `/leaderboard`, `/results`, `/my-bets`.
- [x] Respect `prefers-reduced-motion` everywhere — degrade to fades or nothing. **Done**, as a blanket floor in `@layer base` plus `motion-safe:` on decorative entrances. The floor is `0.01ms`, never `0s` and never `animation: none` — see the note below.
- [x] **Jake celebration:** on a *successful* placement (the API confirm, not the button click), the clip animates in — springs on, holds a beat, exits — with the sound. Playback stays in the user-gesture chain so mobile autoplay rules allow it. **Done Aug 23, 2026.** Two deliberate departures from this line as written, both below: the asset arrived as a single video rather than a face + a sound file, and **there is no mute toggle**.
- [x] Add the celebration asset to the repo and reference it from the app (optimized). **Done Aug 23, 2026** — `public/celebration/great-job.mp4`, 214KB, plus a poster frame. Not webp/avif + a separate audio clip, because the asset is one file carrying both. The design skill gets the *timing and the rationale* (`tokens/motion.css`) but deliberately **not a copy of the binary**: 214KB with no design decisions inside it, and two copies of a video is two things to drift.
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

**Residue:** ~~the Jake celebration and its assets ([#164](https://github.com/andrewelong18/ozark-open/issues/164))~~ — shipped
Aug 23, 2026, see below — the
`hover:` gating ([#165](https://github.com/andrewelong18/ozark-open/issues/165)), and a browser pass on a real
phone ([#166](https://github.com/andrewelong18/ozark-open/issues/166)).

---

## What shipped, Aug 23 2026 — the celebration half

The blocker cleared in an unexpected shape. The sprint asked for "a photo of
Jake's face and a short sound clip"; what arrived was **one 1.63s video with
the audio burned in**. So the feature is a video micro-interaction rather than
an `<img>` plus `new Audio()`, and the second checkbox's "small webp/avif +
short compressed audio clip" is moot — there is one file carrying both.

**Two decisions departed from this sprint's text, on purpose:**

1. **No mute toggle.** The box above specified one, persisted in
   `localStorage`. Andrew's call on Aug 23 was sound-on, no control. There is
   still a *silent* fallback — if a browser refuses audible autoplay the clip
   replays muted rather than not at all — but that is resilience, not a user
   setting. Recorded here rather than left as a doc that contradicts the code.
2. **Fires on edits too**, not only on new wagers. An edited stake is still
   money moving. Removals stay silent.

**The asset, measured rather than eyeballed:**

- `cropdetect` returned `crop=676:720:302:0` on all 47 sampled frames — the
  source is a vertical phone clip pillarboxed into 1280×720, so the black bars
  came off exactly instead of by guess.
- Audio was **−10.9 LUFS** integrated, roughly 6 dB hotter than anything that
  fires unprompted after a button press should be. `loudnorm` to −16.
- **MP4 only, and that was measured too:** VP9/WebM at CRF 34 came out **255KB
  against H.264's 214KB**. VP9 loses on a clip this short and this high-motion,
  so a second `<source>` would have added weight and a code path for nothing.

**Three things that look like style choices and aren't:**

- **The `<video>` never unmounts.** A media element earns the right to play
  programmatically by having been played during a user gesture, and that right
  belongs to the *element*. Every other transient surface here latches and
  unmounts on `animationend`; this one can't, or it would be blocked every
  time. It is also why the entrance replays via a forced reflow rather than a
  changing React `key`.
- **Arming happens in the click, before the `fetch`.** By the time the API
  confirms, the gesture has expired and an audible `play()` is refused outright
  on iOS Safari.
- **Nothing takes a pointer event.** No scrim, `pointer-events-none` the whole
  way down — otherwise a centre-screen overlay would fail Playwright's
  actionability check in four existing specs, and interrupt a bettor tapping
  stakes into thirteen bets.

**One finding worth adding to the reduced-motion story above.** Measured under
the floor: **`animationend` does not fire at all** with
`animation-duration: 0.01ms` + `animation-delay: -1ms`. That is consistent with
the sabotage table (the toast survives `animation: none` because its *fallback*
carries it), but sharper than the comments claimed — for `BetCelebration` the
600ms exit fallback is not a belt, it is the only thing that returns the card
to rest for a reduced-motion user. Written into `DESIGN_SYSTEM.md` § 4.

**Verified in a real browser** against the compiled stylesheet and the real
asset: audible autoplay succeeds through the arming path, `ended` fires at
1.65s and drives the close, the card returns to rest with no click, a probe
button beneath the card centre still receives its click, and the card is 272px
on desktop / 217px (58vw) on a 375px phone. The full run also completes under a
reproduction of the reduced-motion floor.

### The bug it shipped with, Aug 23 2026

Merged, then tested on desktop Safari: **the sound played and nothing
appeared.** A clean diagnostic — audio proves `celebrate()` ran and `play()`
succeeded, so the state machine was fine and it was purely rendering.

`BetsMenu` renders inside `<div data-enter-stagger>` (`app/bets/page.tsx`), and
that column animates a transform via `rise-in`. **A transformed element becomes
the containing block for its `position: fixed` descendants**, so the overlay's
`fixed inset-0` sized itself to the whole scrollable bet menu rather than the
viewport, centring the card about 1400px below the fold. Reproduced and
measured: **3125px tall against a ~700px viewport**, card at `top: 1439`.

Two things make this worth writing down rather than just fixing:

- **The hazard was already documented, three lines above where it bit.**
  `app/bets/page.tsx` carries a comment explaining that `data-enter-stagger`
  goes on the inner column precisely so it can't become `BetSlipSummary`'s
  containing block. The celebration rendered *inside* that column and walked
  straight into it.
- **The hijack survives the animation finishing.** With `fill-mode: both` the
  element still counts as transformed after the transform resolves to `none`,
  and engines disagree about that — which is why Chrome hid it and Safari
  didn't. Verifying in one browser was not enough, and neither was verifying
  the component in a harness that had no such ancestor. That was the real
  process failure: the original check exercised the component in isolation
  rather than in the page it ships in.

Fixed by portalling to `document.body` — the structural answer, not a Safari
workaround, and the pattern `BetErrorToast` already uses. Attached to `body`
there is no ancestor left that can hijack the containing block, establish a
stacking context, clip with `overflow`, or apply a `filter`.

Hardened at the same time: the aspect ratio moved off the `<video>` onto a
wrapper with an absolutely-filled child, because `aspect-ratio` on a replaced
element that has its own intrinsic ratio is a long-standing browser
disagreement and a zero-height video is invisible while still playing audio —
the same symptom from a different cause. `webkit-playsinline` added alongside
`playsInline` for pre-10 iOS.

`e2e/celebration.spec.ts` gains the regression, written so it fails on the
original bug three independent ways: the overlay's parent is `document.body`,
its height equals `window.innerHeight`, and — the assertion that needs no
theory — the video's rect actually intersects the viewport.

**Not run locally: the Playwright suite.** `scripts/e2e-verify.sh` needs Docker
for the local Supabase stack and Docker is not installed on this machine, so
`e2e/celebration.spec.ts` is written but unexecuted — see
[#172](https://github.com/andrewelong18/ozark-open/issues/172).
