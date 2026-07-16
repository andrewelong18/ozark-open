# Ozark Open Sportsbook — Design System

A cohesive visual system for the **Ozark Open Sportsbook**, a private, invite-only fantasy-golf betting app for ~24 friends at an annual 3-day golf tournament. The system blends a **classic golf-clubhouse** feel with **modern-sportsbook data clarity** — Masters-style restraint meets DraftKings-style odds legibility, without any casino neon or urgency dark patterns.

> No house, no rake, no profit. It's pari-mutuel: the whole entry pool is redistributed proportionally to how everyone's bets performed. This is a private pool among friends — polish where it's seen (Bet Menu, Results), economize where it isn't (Login, empty states).

---

## Sources

This system was built from materials the user provided. If you have access, explore them to go deeper:

- **Codebase (ground truth for screens & tokens):** GitHub `riversteve/ozark-open` — Next.js 15 + Tailwind + shadcn/ui. Key files read: `app/globals.css`, `app/bets/page.tsx`, `app/dashboard/page.tsx`, `app/login/page.tsx`, `components/ui/*`, `lib/odds.ts`, `PRD.md`, `README.md`. Related forks: `andrewelong18/ozark-open`.
- **Design brief:** `uploads/ozark-open-design-brief.md` (component inventory §6, screens §5, tone §3).
- **Brand assets:** full-color wordmark, mark-only, and full lockup (provided as SVG/PNG); **Azalea** display font (OTF/TTF).

The codebase ships generic grayscale shadcn tokens; **this design system replaces them** with the branded palette below, per the user's direction (primary `#312F8C`).

---

## Product & Context

- **Users:** ~24 men, 22–45, on **phones, outdoors, in sunlight** (golf carts, the range, the bar). Mobile-first is non-negotiable; desktop is secondary (admins).
- **Usage:** bursty — intense when bets open/close, obsessive score-checking after each round.
- **Numbers everywhere:** American odds (`+150` / `-130`), fractional (`3-2`), implied (`40.0%`), money (`$40`, `$21.87`). All numeric displays use **tabular figures**.
- **Theme:** single **light theme**, high contrast for sunlight readability. WCAG AA, touch targets ≥44px, color never the sole carrier of meaning (outcomes pair color + glyph + label).

---

## Content Fundamentals

**Voice:** clubby, trustworthy, sharp, a little cocky, fun. Like a well-run bet between friends — confident, never salesy, never anxious.

- **Person:** address the player as **"you"** ("You're in.", "You've wagered $23 of $40"). The book/house is implicit — there is no "we're selling you" tone because there's no house.
- **Casing:** **Title Case** for screen headings and nav ("Bet Menu", "My Bets", "All Bets"). **Sentence case** for body, captions, and helper text. Badges are short Title/label case ("Open", "Hit", "Round 1").
- **Tone examples (from the product):**
  - Confident & plain: *"No house, no rake, no profit."* · *"Betting closes when an admin closes it."*
  - Friendly guardrails: *"You've wagered $23 of $40… add $17 and at least 2 more bets."* — firm but never nagging, never blocks browsing.
  - Personality in empty states: *"Round 2 opens Saturday morning."* · *"No bets published yet."* Inside jokes are welcome in copy (fraternity crowd) but the **UI itself stays sharp, not jokey.**
- **Anti-patterns:** no "BET NOW" pressure, no countdown-timer anxiety, no confetti, no fake scarcity. Numbers speak for themselves.
- **Emoji:** used **sparingly** as quiet functional accents only — a golf flag ⛳ on empty states / rules headers. Never in dense tables, never decorative spray. Outcome glyphs use plain typographic marks (✓ ✕ = ∅), not emoji.

---

## Visual Foundations

**Color.** Anchored on brand indigo **`#312F8C`** (`--indigo-700`), clubhouse gold **`#FDDA00`** (`--gold-400`, AA-safe text via `--gold-600`), fairway green for wins/open, flag red for losses, amber for caution/compliance. Warm cream neutrals (page `#FAF8F2`, sunken `#F4F2EA`) give the clubhouse warmth while white cards keep data crisp. The **outcome triad must survive a 25-row table** — greens/reds are muted surface tints with a colored glyph, not saturated fills, so a resolved menu never becomes a Christmas tree. Gold is rationed: one gold moment per screen (the marquee action or the pool-total tile).

**Type.** Display/brand is **Azalea** (a warm serif) used for **headings and brand moments ONLY** — screen titles, card titles, the wordmark. Body & all UI is **Montserrat** (400/500/600/700). Numbers are Montserrat with `font-variant-numeric: tabular-nums` (`--numeric-tabular`) so odds and money columns align. Min body size 16px for sunlight.

**Spacing & layout.** 4px base grid. Mobile-first single column (`--content-max: 640px`); desktop centers within `--container-max: 1120px`. Touch targets ≥44px. Tables go edge-to-edge inside cards on mobile and stack the odds cluster under the description (see `BetRow`).

**Radii.** 10px is the default surface/input radius (from the codebase `--radius`), 14px for cards, 6px for chips, pills for badges. Not pill-happy — chips stay squared-ish for a tabular, sportsbook feel.

**Backgrounds.** Flat warm cream — **no gradients, no imagery, no textures**. The brand color appears as solid fills (header, feature tile), never as a gradient wash. Depth comes from soft low shadows, not glow.

**Shadows & borders.** Soft, low, neutral-tinted (`--shadow-sm` on cards, `--shadow-md` when lifted). 1px warm hairline borders (`--ink-200`). Focus is a 3px indigo ring (`--shadow-focus`); the one exception glow is `--shadow-gold`, used **only** on the "bet placed" confirmation flash.

**Motion.** Subtle, confirmation-only. `--dur-fast/base/slow` (120/180/260ms) with `--ease-standard`/`--ease-out`. Buttons nudge down 1px on press; the progress bar eases its width; the stake input flashes gold once on placement. No infinite loops, no bounces, no attention-grabbing animation.

**Hover / press.** Hover darkens the fill one step (primary → `--primary-hover`); secondary/ghost pick up a faint indigo/cream wash. Press = 1px downward nudge, shadow removed. Disabled = 50% opacity, no pointer.

**Transparency & blur.** Essentially none — sunlight readability favors opaque, high-contrast surfaces. No frosted glass.

---

## Iconography

- **Approach:** the product is deliberately **glyph-light**. It leans on **typographic marks and tabular numbers**, not an icon set. Outcome states use plain marks — **✓** hit, **✕** miss, **=** push, **∅** void — always paired with a text label and color.
- **No bundled icon font.** The codebase ships only a few placeholder Next.js SVGs (`file.svg`, `globe.svg`, etc.) that aren't part of the brand, so none were imported.
- **Emoji** is limited to a single functional golf flag ⛳ (empty states, rules-card header). Not decorative.
- **If you need a broader UI icon set** (e.g. chevrons, close, menu for a richer build), use **[Lucide](https://lucide.dev)** from CDN at a 1.75–2px stroke to match Montserrat's weight, and keep it monochrome (`--ink-600` / `--indigo-700`). This is a **recommended substitution**, not an existing brand asset — flag it when you use it.
- **Brand marks live in `assets/logos/`:** `ozark-lockup.png` (full lockup), `ozark-mark.svg` (Missouri + flag mark, use as app icon/favicon), `ozark-wordmark.svg` (full-color wordmark).

---

## Index / Manifest

**Root**
- `styles.css` — the single entry point consumers link (imports fonts + all tokens).
- `readme.md` — this guide.
- `SKILL.md` — Agent-Skills-compatible front matter for use in Claude Code.

**`tokens/`** — `fonts.css` (Azalea @font-face), `colors.css`, `typography.css`, `spacing.css` (spacing, radii, shadows, layout, motion).

**`assets/`** — `logos/` (lockup PNG, mark + wordmark SVG), `fonts/` (Azalea OTF/TTF).

**`guidelines/`** — foundation specimen cards (Colors, Type, Spacing, Brand groups).

**`components/`** — reusable primitives (React). Grouped:
- **core/** — `Button`, `Badge`, `Input`, `Card` (+ `CardHeader`)
- **betting/** — `OddsChip`, `StatusBadge`, `OutcomeBadge`, `StakeInput`, `MoneyDisplay`, `BetRow`
- **modules/** — `StatCard`, `BudgetModule`, `RulesCard`, `ComplianceBanner`, `EmptyState`
- **navigation/** — `Header`

Full component list (17 exports): **Button, Badge, Input, Card, CardHeader, OddsChip, StatusBadge, OutcomeBadge, StakeInput, MoneyDisplay, BetRow, StatCard, BudgetModule, RulesCard, ComplianceBanner, EmptyState, Header.** These map directly to the design brief's §6 component inventory.

**`ui_kits/sportsbook/`** — high-fidelity click-through recreation of the web app: Login → Dashboard → Bet Menu → My Bets → Results → Leaderboard. Entry: `ui_kits/sportsbook/index.html`.

### Intentional additions
- **CardHeader** — a lightweight header helper for `Card` (title + subtitle + action slot). Not in the brief's list; added because every card in the mocks needs a consistent display-font title row.
- **Leaderboard** screen — the brief lists it as a screen; it's rendered in the UI kit as a golf-standings table (mirrors the scoring sheet), not a reusable component.

---

## Using the system

Consumers link one file: `styles.css`. Components read CSS custom properties (no CSS-in-JS lib). Mount via the compiled bundle: `const { Button, BetRow } = window.DesignSystem_d43214`. See each component's `.prompt.md` for a one-line usage note + example.
