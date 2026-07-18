# Sprint 12 — Animation & Delight Pass + Jake Celebration (Bonus)

> Part of the [Ozark Open roadmap](../ROADMAP.md). **Bonus wish-list sprint (added Jul 18, 2026)** — an enhancement, never an MVP blocker. Work it only when no MVP sprint (0–9) is waiting.

**Goal:** the app feels slick and modern — intentional motion throughout — and placing a bet summons the Jake celebration: his face animates in with a sound.
**Target:** before the Aug 28 feature freeze (the Jake celebration is a feature, not post-freeze polish) · **Blockers:** a photo of Jake's face and a short sound clip from Andrew — neither exists in the design skill's assets yet. Polish pages only after they're functionally verified in the browser (#31).

**Reads:** the `ozark-open-design` skill (visual source of truth — motion must fit the brand), `DESIGN_SYSTEM.md` (how tokens are wired into the app).

- [ ] Define the motion vocabulary once — durations and easings as CSS custom properties alongside the existing design tokens. CSS transitions/keyframes first; add a motion library only if something genuinely needs orchestration.
- [ ] Apply the pass app-wide: page/route transitions, card and list entrances (`/bets` menu, My Bets), button/press feedback, banner and toast in/out, fade or skeleton for loading states.
- [ ] Respect `prefers-reduced-motion` everywhere — degrade to fades or nothing.
- [ ] **Jake celebration:** on a *successful* placement (the API confirm, not the button click), Jake's face animates in — springs on, holds a beat, exits — with the sound. Keep playback in the user-gesture chain so mobile autoplay rules allow it; add a mute toggle persisted in `localStorage`.
- [ ] Add the Jake image + audio to the design skill's assets and reference them from the app (optimized: small webp/avif, short compressed audio clip).
- [ ] Mobile check: smooth on a mid-tier phone — animate `transform`/`opacity` only, no layout-thrashing properties.

**Done when:** clicking around the deployed app feels fluid rather than page-flippy, a placed bet reliably summons Jake with sound on both phone and desktop (and mutes when asked), and `prefers-reduced-motion` users get a calm version.
