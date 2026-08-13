# Design System

How the Ozark Open Sportsbook's visual system is wired into this Next.js app.
The canonical **visual** reference lives in the `ozark-open-design` skill
([`.claude/skills/ozark-open-design/`](../.claude/skills/ozark-open-design/))
(HTML/JSX + CSS custom properties); this document describes the **ported**
implementation you actually build against — TypeScript React + Tailwind v4 +
shadcn/ui.

> Source of truth for _design_ (color, type, spacing, component anatomy) is the
> `ozark-open-design` skill (`.claude/skills/ozark-open-design/`). Source of truth
> for _code_ is `components/` + `app/globals.css`.
> When they disagree on a hex value or a variant, the design system wins; port
> it, don't fork it.

---

## 1. Token layers

All tokens live in [`app/globals.css`](../app/globals.css) as CSS custom
properties, in two tiers, then are exposed to Tailwind through `@theme inline`.

### Tier 1 — raw scale (literal brand ramps)

Never referenced directly in components except for washes/steps. Hex values are
canonical (lifted verbatim from `.claude/skills/ozark-open-design/tokens/colors.css`).

| Ramp | Var prefix | Notes |
|---|---|---|
| Indigo | `--indigo-50 … --indigo-950` | Brand primary is `--indigo-700` (`#312F8C`) |
| Gold | `--gold-100 … --gold-700` | Brand gold is `--gold-400` (`#FDDA00`); AA text `--gold-600` |
| Green | `--green-50 … --green-800` | Wins / open / positive |
| Red | `--red-50 … --red-800` | Losses / errors / negative |
| Amber | `--amber-50 … --amber-700` | Caution / compliance |
| Ink | `--ink-50 … --ink-950` + `--white` | Warm cream + ink neutrals |

### Tier 2 — semantic aliases (role tokens)

Reference the raw scale. This is what components consume.

- **shadcn roles, remapped to DS values** (so existing shadcn/ui primitives keep
  working): `--background` (cream), `--foreground`, `--card`, `--primary`
  (indigo), `--secondary`, `--muted`, `--accent`, `--destructive` (→ loss red),
  `--border`, `--input`, `--ring` (indigo).
  - **`--accent` stays a neutral warm-cream hover-wash** — the value shadcn's
    ghost/outline hovers and menu highlights expect. It is **not** the brand
    gold.
- **Brand roles added:** `--primary-hover/-active`, `--accent-gold` (+
  `-hover`/`-strong`/`-foreground`) — the rationed gold CTA, one per screen.
- **Sportsbook domain roles added:** the outcome triad (`--win`, `--loss`,
  `--neutral` + `-surface`/`-border`/`-strong`), bet status (`--status-open`,
  `--status-closed`, `--status-resolved` + surfaces/borders), odds polarity
  (`--odds-positive`, `--odds-negative` + surfaces), money P/L (`--money-up`,
  `--money-down`, `--money-flat`, plus `-on-dark` variants for indigo surfaces),
  and compliance (`--caution` + surface/border/strong).
- **Structural:** `--surface-card/-sunken/-inverse/-inverse-2`,
  `--text-strong/-body/-muted/-on-dark`, `--border-strong`, shadows
  (`--shadow-xs/sm/md/lg`, plus `--shadow-focus` and the confirmation-only
  `--shadow-gold`), and motion (`--ease-*`, `--dur-*`, `--stagger-*` — see
  [§4 Motion](#4-motion)).

### Collisions with shadcn defaults — the mapping

| shadcn token | shadcn role | Resolution |
|---|---|---|
| `--accent` | neutral hover-wash | **Mapped** to warm cream (`--ink-100`). Brand gold split off into `--accent-gold-*`. |
| `--primary` | main action | **Mapped** to `--indigo-700`. |
| `--background`, `--card`, `--border`, `--ring`, `--destructive`, `--muted`, `--secondary` | — | **Mapped** to DS values; names kept. |
| outcome / odds / money / status / caution | (none) | **Added** as new tokens. |

Dark mode is intentionally **dropped** — the DS is a single light theme tuned
for outdoor/sunlight readability (WCAG AA).

### Tailwind exposure

`@theme inline` turns the tokens into utilities. Brand ramps are exposed under
`indigo-*` (intentional override of Tailwind's default indigo), `gold-*`, and
`ink-*`. Green/red/amber flow through the `win`/`loss`/`caution` semantics
rather than raw utilities. Examples:

```
bg-primary  text-primary-foreground        // indigo action
bg-accent-gold text-accent-gold-foreground // rationed gold CTA
text-win  border-win-border bg-win-surface // outcome
text-odds-positive / text-odds-negative    // odds polarity
text-money-up / text-money-down            // P/L
.tabular                                    // tabular figures for odds/money
```

Raw scale is always reachable via arbitrary values, e.g. `bg-[var(--indigo-50)]`.

---

## 2. Fonts

Wired with `next/font` in [`app/layout.tsx`](../app/layout.tsx):

- **Montserrat** (`next/font/google`) → `--font-montserrat` → `--font-sans`.
  Workhorse UI + body, weights 400/500/600/700.
- **Azalea** (`next/font/local`, [`app/fonts/Azalea.otf`](../app/fonts)) →
  `--font-azalea` → `--font-display` / `--font-heading`. **Display/brand
  only** — screen titles, card titles (`font-heading`), the wordmark. Never body.

Numbers use Montserrat with `font-variant-numeric: tabular-nums` — apply the
`.tabular` helper so odds and money columns align.

---

## 3. Component inventory

### shadcn/ui primitives (extended in place) — `components/ui/`

| Component | Variants / sizes / states |
|---|---|
| `Button` | variants: `default` (indigo), `gold`, `secondary`, `outline`, `ghost`, `destructive`, `link` · sizes: `sm`/`default`/`lg` (36/44/52px) + `icon*` · disabled |
| `Badge` | variants: `default`/`solid`, `neutral`/`secondary`, `indigo`, `gold`, `green`, `red`/`destructive`, `amber`, `outline` · `uppercase` |
| `Card` | `CardHeader/Title/Description/Action/Content/Footer` · props: `size`, `elevated`, `accent` (gold hazard topper) |
| `Input` | `inputSize` sm/md/lg · `leading`/`trailing` adornments · invalid (`aria-invalid`) · disabled |
| `Label` | unchanged |

### Betting — `components/betting/`

| Component | Purpose |
|---|---|
| `OddsChip` | American odds chip; `size` sm/md/lg; `detail` reveals fractional + implied (from `lib/odds.ts`) |
| `MoneyDisplay` | Money treatment; `cents`, `pl` (colors the sign), `onDark`, `size`, `weight` (uses `lib/money.ts`) |
| `OutcomeBadge` | `hit`/`miss`/`push`/`void` — color + glyph + label |
| `StatusBadge` | `open`/`closed`/`resolved` — dot + label |
| `StakeInput` | Whole-dollar inline stake; unplaced/placed (gold flash)/error/disabled (client) |
| `BetRow` | Workhorse row; action zone adapts to status. Interactive only when `onPlace` is passed |

### Modules — `components/modules/`

`StatCard` (`feature` = indigo marquee tile) · `BudgetModule` (wagered vs entry,
under/exact/over) · `ComplianceBanner` (`warning`/`info`/`success`) · `RulesCard`
· `EmptyState`.

### Navigation — `components/`

`Header` (server; indigo bar, Azalea wordmark that truncates with ellipsis and
never collides with the user/logout cluster) + `SiteNav` (client; clubhouse pill
nav with gold active pill, active via `usePathname`).

---

## 4. Motion

The design skill is the source of truth here too — `tokens/motion.css` plus the
two `guidelines/motion-*.card.html` specimens. This section is the app-side port:
where the tokens live in code, and which Tailwind utilities they generate.

**Two tiers**, borrowed from IBM Carbon's productive/expressive split.
**Productive** is the whole betting path — efficient, out of the way, never above
`--dur-slow`. **Expressive** is arrival and confirmation, rationed like brand
gold at about one per screen. When unsure, a moment is productive.

**Every curve is a named industry value.** The two the system already had turned
out to be standards, so the three added extend the same lineage:

| Token | Value | Source |
|---|---|---|
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Material 3 `standard` / `emphasized` |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Penner `easeOutExpo` |
| `--ease-entrance` | `cubic-bezier(0.05, 0.7, 0.1, 1)` | Material 3 `emphasized-decelerate` |
| `--ease-exit` | `cubic-bezier(0.3, 0, 0.8, 0.15)` | Material 3 `emphasized-accelerate` |
| `--ease-overshoot` | `cubic-bezier(0.34, 1.35, 0.64, 1)` | Penner `easeOutBack`, damped `1.56 → 1.35`. Transform only |

Durations: `--dur-fast` 120 · `--dur-base` 180 · `--dur-slow` 260 (productive) ·
`--dur-enter` 320 (expressive) · `--dur-exit` 160 (exits always beat their
enter). Stagger: `--stagger-step` 40ms, `--stagger-max` 240ms.

### How it's wired (Tailwind v4 specifics)

`--ease-*` and `--animate-*` **are** theme namespaces, so `@theme static` in
`app/globals.css` generates real `ease-entrance` / `animate-rise-in` utilities.
**`--duration-*` is not a namespace** — the named tiers (`duration-fast`,
`duration-base`, `duration-slow`, `duration-enter`, `duration-exit`) and
`stagger` are hand-rolled with `@utility`. Each duration utility sets Tailwind's
internal `--tw-duration` as well as the longhand, which is what lets
`duration-slow` retime a `tw-animate-css` enter/exit animation rather than only a
plain transition.

`--ease-out` deliberately **overrides** Tailwind's built-in `ease-out`. One
vocabulary; no second set of curves smuggled in via framework defaults.

> Watch for the Tailwind v3 shorthand `duration-[--dur-slow]`. v4 removed it in
> favour of `duration-(--dur-slow)`, and the v3 form compiles to an invalid
> `transition-duration: --dur-slow` that silently resolves to `0s`. It shipped in
> `components/ui/dialog.tsx` for two sprints. Prefer the named utilities.

### Pattern vocabulary

Each surface is modelled on a named production library and reimplemented in CSS —
there is **no animation dependency** in this app.

| Surface | Modelled on | Built as |
|---|---|---|
| `BetErrorToast` | **Sonner** | `data-state="open"/"closed"` + `tw-animate-css`; message latched locally so the exit outlives the prop |
| `Dialog` | **Radix / Base UI** | `data-starting-style` / `data-ending-style`; fade + `scale-95 → 1` |
| Accordions, admin collapsibles | **Radix Accordion** | `components/ui/collapse.tsx` — `grid-template-rows: 0fr → 1fr` with mount-on-open / unmount-after-close |
| Live status indicator | status-dot idiom (`animate-ping`) | A sibling ring scaling out of the dot, Open state only |
| Live border sweep | conic-gradient border | `@property --angle` + a conic gradient masked to the border box |
| Server-rendered list rows | **Motion's `stagger()`** | `--index` inline + the `stagger` utility |
| Active nav pill | **Framer Motion `layoutId`** | `view-transition-name` — the browser morphs it between routes |
| Route change | **React `<ViewTransition>`** | Tagged navigations only; `default="none"` so `router.refresh()` never animates |
| Rolling numbers | **NumberFlow** | **Not adopted.** `MoneyDisplay` is a server component, so there is no client-side "before" value; a counting number is a self-running attention loop; and every money surface already uses tabular figures, so digits swap without reflow |

### The collapse caveat, and the shape that solves it

A `0fr → 1fr` collapse needs its content **mounted** to have a height to animate
to. Done naively that trades "absent" for "present but clipped":

- `overflow: hidden` at `0fr` hides content visually but does **not** empty its
  bounding box — it still answers a text query and still reports visible to
  Playwright, so neither `toHaveCount(0)` nor `not.toBeVisible()` holds.
- Form controls inside stay in the document, so a label lookup that matched one
  element can match two. `inert` fixes tab order and the accessibility tree,
  not this.

The naive version shipped once and was reverted: on `ClosedBetCard` it would
have forced `e2e/bets-menu.spec.ts` (#103) to stop asserting bettor names are
absent while collapsed, and on `people-console.tsx` it made "Playing golfer"
resolve to two checkboxes and broke `e2e/admin-approval.spec.ts`.

**The fix was not to avoid the technique.** `components/ui/collapse.tsx` mounts
on open and unmounts once the close transition finishes, so the steady closed
state is genuinely empty — both guards hold — and both directions animate. The
only window where content exists while visually closed is the ~180ms of the
closing transition. It is the same latch shape `BetErrorToast` uses, with the
same hazard (a suppressed transition would strand the panel) and the same
mitigation (a fallback timer).

`Collapse` is used by the closed-bet reveal, both admin disclosure boxes, the
per-row approve/edit panels, both bet confirm strips, the locked-odds receipt,
and the how-it-works launcher.

### Hard rules

- **Transform and opacity only** — never `top`, `margin`, or an unbounded
  `height`. One named exception: a progress bar's `width` (`BudgetModule`), where
  width *is* the meaning and `scaleX` squashes the pill cap. Don't generalise it.
- **`--ease-overshoot` on transform only** — on colour or opacity it overshoots
  past the token value and can break contrast.
- **Never animate a `display: contents` element.** `/leaderboard`, `/results` and
  `/admin/view` stack their grids with `sm:contents`; animate the row, never the
  wrapper, or it silently does nothing at `sm+` while working on mobile.
- **Never gate an unmount behind `motion-safe:`.**
- **Reduced motion is a floor, not an off switch.** `app/globals.css` zeroes
  durations to `0.01ms` — never `0s`, never `animation: none`. Base UI keeps
  `Dialog.Popup` mounted until `getAnimations()` settles and `BetErrorToast`
  unmounts on `animationend`; with `none` no animation exists, no event fires, and
  the toast strands on screen. `::view-transition-*` gets its own block because
  the `*` selector cannot reach pseudo-elements outside the document tree.
- **Don't animate constantly-changing values** — `Countdown` (1Hz) and the
  `/admin/rules` preview table (per keystroke) are explicit opt-outs.
- **Ongoing animation is allowed only where it carries information that is true
  just while it runs, and stops when that stops being true.** Exactly three
  qualify: a loading skeleton's pulse, the ring on an **Open** `StatusBadge`
  (`--animate-live-ping`), and the border sweep on a **counting** `Countdown`
  (`--animate-live-sweep`). Closed and resolved badges are static; the sweep is
  gone the moment the clock reaches zero. That clause is the whole exception.
- **Gradients remain banned as backgrounds**, for sunlight readability. The
  `live-border` utility confines one to a 1.5px border with a mask, which does
  not touch that rationale. It requires `@property --angle` — unregistered, a
  custom property is a string to the interpolator and the gradient jumps
  between keyframes instead of rotating.
- **Still banned:** confetti, attention loops that carry no information,
  gradient washes on surfaces, frosted glass, urgency patterns. The countdown
  border is not one: no red, no acceleration, no pulsing digits.

---

## 5. Using it

- **Reference gallery:** [`/style-guide`](../app/style-guide/page.tsx) renders every
  token and component variant — the living equivalent of the DS card gallery.
- **Real screens** (`app/login`, `app/dashboard`, `app/bets`) use these
  components with live Supabase data and the `DATA_MODEL.md` schema — the
  `.claude/skills/ozark-open-design/ui_kits/sportsbook/` screens are layout reference
  only; nothing is hardcoded from the demo data.
- **Adding a component:** reuse/extend the shadcn primitive if one fits;
  otherwise add under `components/betting|modules/` and bind classes to the
  semantic tokens above — don't reach past them to raw hex.
- **Destructive / irreversible actions read red.** Buttons that log out, remove,
  or delete use the `destructive` `Button` variant (tonal loss red). Inline text
  controls that do the same (e.g. the bet-menu "Remove bet" link) use `text-loss`
  (→ `text-loss-strong` on hover). Red is reserved for this and for losses/errors
  — never for ordinary emphasis.
- **Verify:** `npm run lint` and `npx tsc --noEmit` and `npm run build` must stay
  green. The `ozark-open-design` skill (`.claude/skills/ozark-open-design/`) is
  vendored reference and is excluded from linting.
