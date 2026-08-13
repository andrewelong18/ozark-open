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

**Backgrounds.** Flat warm cream — **no gradients, no imagery, no textures**. The brand color appears as solid fills (header, feature tile), never as a gradient wash. Depth comes from soft low shadows, not glow. *(The one gradient in the system is masked to a 1.5px border — the live countdown sweep. It never fills a surface, so the sunlight-readability rationale behind this rule is untouched. See § Motion.)*

**Shadows & borders.** Soft, low, neutral-tinted (`--shadow-sm` on cards, `--shadow-md` when lifted). 1px warm hairline borders (`--ink-200`). Focus is a 3px indigo ring (`--shadow-focus`); the one exception glow is `--shadow-gold`, used **only** on the "bet placed" confirmation flash.

**Motion.** Two tiers, borrowed from IBM Carbon's productive/expressive split. **Productive** — efficient, subtle, out of the way — is the entire betting path: `--dur-fast/base/slow` (120/180/260ms) with `--ease-standard`/`--ease-out`. Someone tapping stakes into 13 bets in a golf cart must never wait on a flourish, so nothing on that path exceeds `--dur-slow`. **Expressive** is arrival and confirmation only — `--dur-enter` (320ms) with `--ease-entrance`, and `--ease-overshoot` for the moment a bet lands — and it is rationed the way brand gold is: roughly one per screen. Exits are deliberately faster than entrances (`--dur-exit`, 160ms) so old content clears rather than competing. Buttons nudge down 1px on press; the stake input flashes gold once on placement; lists cascade in at 40ms a row, capped at 240ms. No bounces that oscillate, and no attention-grabbing animation. Ongoing animation is allowed **only** where it carries information that is true just while it runs — a loading skeleton, the ring on an **Open** badge, the border sweep on a **counting** countdown — and it stops when that stops being true. **Full spec: [§ Motion](#motion) below, plus the two `guidelines/motion-*.card.html` specimens.**

**Hover / press.** Hover darkens the fill one step (primary → `--primary-hover`); secondary/ghost pick up a faint indigo/cream wash. Press = 1px downward nudge, shadow removed. Disabled = 50% opacity, no pointer.

**Transparency & blur.** Essentially none — sunlight readability favors opaque, high-contrast surfaces. No frosted glass.

---

## Motion

Motion is a first-class part of this system, not a footnote — tokens in
`tokens/motion.css`, two specimen cards in `guidelines/`. A page built from this
system should inherit its motion the same way it inherits its colours.

**Every curve is a named industry value, not an eyeballed one.** Two of them were
already here before the motion pass and turned out to be standards, so the three
added extend the same lineage rather than introducing a second dialect.

| Token | Value | Source | Use for |
|---|---|---|---|
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Material 3 `standard` / `emphasized` | On-screen movement, state change |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Penner `easeOutExpo` | Overlays, reveals |
| `--ease-entrance` | `cubic-bezier(0.05, 0.7, 0.1, 1)` | Material 3 `emphasized-decelerate` | Content **arriving** |
| `--ease-exit` | `cubic-bezier(0.3, 0, 0.8, 0.15)` | Material 3 `emphasized-accelerate` | Content **leaving** |
| `--ease-overshoot` | `cubic-bezier(0.34, 1.35, 0.64, 1)` | Penner `easeOutBack`, damped `1.56 → 1.35` | Confirmation. **Transform only** |

| Token | Value | Tier | Use for |
|---|---|---|---|
| `--dur-fast` | `120ms` | productive | Hover, colour, press — the state echo |
| `--dur-base` | `180ms` | productive | The default: reveals, swaps, collapses |
| `--dur-slow` | `260ms` | productive | Overlays: dialog, backdrop, toast enter |
| `--dur-enter` | `320ms` | **expressive** | Route and list arrival |
| `--dur-exit` | `160ms` | — | Exits, always faster than the matching enter |
| `--stagger-step` / `--stagger-max` | `40ms` / `240ms` | — | Per-item cascade, and its ceiling |

**Productive vs expressive.** Productive motion is efficient and out of the way,
for moments when someone is completing a task — that is the whole betting path,
and nothing on it exceeds `--dur-slow`. Expressive motion is for arrival and
confirmation, and is rationed the way brand gold is: about one per screen. If you
are unsure which a moment is, it is productive.

**Pattern vocabulary.** Each of these is modelled on a named production library
and reimplemented in plain CSS — no animation dependency:

| Surface | Modelled on | Built as |
|---|---|---|
| Toast | **Sonner** — `data-state="open"/"closed"` | CSS animations keyed off the attribute; exit shorter than enter |
| Dialog / popover | **Radix / Base UI** | `data-starting-style` / `data-ending-style`; fade + `scale-95 → 1`, never from `scale(0)` |
| Accordion, collapsible | **Radix Accordion** | `grid-template-rows: 0fr → 1fr` — no JS measurement — plus mount-on-open / unmount-after-close so closed still means absent. See the caveat below |
| Live status indicator | **Vercel/Linear status dots**; the `animate-ping` idiom | A sibling ring scaling out of the dot, on the Open state only |
| Live border sweep | **Conic-gradient border**, the technique behind most "glowing border" cards | `@property --angle` + a conic gradient masked to the border box |
| List entrance | **Motion's `stagger()`** | `--index` custom property + `animation-delay: min(calc(...), --stagger-max)` |
| Active tab / pill indicator | **Framer Motion `layoutId`** | `view-transition-name` on the active pill; the browser morphs it |
| Route change | **React `<ViewTransition>`** | Explicitly tagged navigations; `default="none"` so data refreshes never animate |
| Press | 1px nudge, shadow removed | Hover behind `@media (hover: hover)` so a tap can't leave it stuck |
| Rolling numbers | **NumberFlow** | **Deliberately not adopted** — see below |

**The collapse caveat — and the shape that solves it.** A `0fr → 1fr` collapse
needs its content **mounted** to have a height to animate to. Done naively that
trades "absent" for "present but clipped", and the difference is not cosmetic:

- `overflow: hidden` at `0fr` hides content visually but does **not** empty its
  bounding box, so it still answers a text query and still reports visible.
- Form controls inside stay in the document, so a label lookup can match two
  elements where it used to match one. `inert` fixes focus order and the
  accessibility tree, but not this.

An early attempt shipped the naive version and was reverted after both problems
showed up as failing tests. **The fix is not to avoid the technique — it is to
mount on open and unmount once the CLOSE transition finishes**, so the steady
closed state is genuinely empty and only the ~180ms of the closing transition
has content present-but-hidden. That is what `Collapse` does, and it is the same
latch shape the toast uses for its exit — including the same hazard, that a
suppressed transition would strand the panel, hence its fallback timer.

**Hard rules.**

- **Transform and opacity only.** Never `top`, `margin`, or an unbounded `height`
  — those run on the layout thread and drop frames on a mid-tier phone.
  **One named exception:** a progress bar's `width`, where width *is* the meaning
  and `scaleX` would squash the pill's rounded cap. It is a 10px-tall solid block
  with no children, so the layout cost is nil. Don't generalise the exception.
  For collapsing panels the answer is `grid-template-rows`, not `height`.
- **`--ease-overshoot` on transform only.** Applied to colour or opacity it
  overshoots past the token value, which is off-brand and can break contrast.
- **Never animate a `display: contents` element** — it generates no box, so
  transform and opacity are silent no-ops. This bites on responsive tables that
  use `sm:contents` to stack on mobile: animate the row, never the wrapper.
- **Never gate an unmount behind `motion-safe:`.** Anything that removes itself on
  `animationend` must still animate under reduced motion.
- **Reduced motion is a floor, not an off switch.** Zero durations to `0.01ms` —
  never `0s`, never `animation: none`. Components that keep an element mounted
  until its animation finishes (Base UI popups) or that unmount on `animationend`
  (toasts) rely on a real animation existing; with `none` there is no event and
  they strand on screen.
- **Don't animate constantly-changing values** — a 1Hz countdown, or a figure that
  recomputes on every keystroke. Motion there reads as lag.
- **No rolling/counting numbers.** They are self-running attention loops, and every
  numeric surface here already uses tabular figures, so digits swap without
  reflow. The problem the technique solves does not exist in this system.
- **Ongoing animation is allowed in exactly one case: when it carries
  information that is only true while it runs, and it stops when that stops
  being true.** Three qualify, and nothing else does yet — a loading skeleton's
  pulse, the ring on an **Open** status badge, and the border sweep on a
  **counting** countdown. Closed and resolved badges are static; the countdown's
  sweep is gone the moment it reaches zero. That "stops being true" clause is
  the whole exception — an indicator that animates whatever the state is says
  nothing, and is just decoration that never rests.
- **Gradients remain banned as BACKGROUNDS.** The rationale is sunlight
  readability: flat warm cream, depth from shadow, nothing that reads as glare.
  A gradient confined to a border by a mask does not touch that rationale, and
  is permitted for the live-border treatment only. If it fills a surface, it is
  banned.
- **Still banned:** confetti, attention loops that carry no information,
  gradient washes on surfaces, frosted glass, urgency and countdown-anxiety
  patterns. The countdown's border is not an urgency pattern: no red, no
  acceleration as the clock runs down, no pulsing digits.

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

**`tokens/`** — `fonts.css` (Azalea @font-face), `colors.css`, `typography.css`, `spacing.css` (spacing, radii, shadows, layout), `motion.css` (easings, durations, stagger).

**`assets/`** — `logos/` (lockup PNG, mark + wordmark SVG), `fonts/` (Azalea OTF/TTF).

**`guidelines/`** — foundation specimen cards (Colors, Type, Spacing, Brand, Motion groups). The two Motion cards are playable: `motion-timing` plots the five easings and runs the five durations side by side; `motion-patterns` demos the stagger, collapse, toast, press and confirmation patterns with the hard rules alongside.

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
