# Design System

How the Ozark Open Sportsbook's visual system is wired into this Next.js app.
The canonical **visual** reference lives in [`design-system/`](design-system/)
(HTML/JSX + CSS custom properties); this document describes the **ported**
implementation you actually build against — TypeScript React + Tailwind v4 +
shadcn/ui.

> Source of truth for _design_ (color, type, spacing, component anatomy) is
> `design-system/`. Source of truth for _code_ is `components/` + `app/globals.css`.
> When they disagree on a hex value or a variant, the design system wins; port
> it, don't fork it.

---

## 1. Token layers

All tokens live in [`app/globals.css`](app/globals.css) as CSS custom
properties, in two tiers, then are exposed to Tailwind through `@theme inline`.

### Tier 1 — raw scale (literal brand ramps)

Never referenced directly in components except for washes/steps. Hex values are
canonical (lifted verbatim from `design-system/tokens/colors.css`).

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
  `--shadow-gold`), and motion (`--ease-*`, `--dur-*`).

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

Wired with `next/font` in [`app/layout.tsx`](app/layout.tsx):

- **Montserrat** (`next/font/google`) → `--font-montserrat` → `--font-sans`.
  Workhorse UI + body, weights 400/500/600/700.
- **Azalea** (`next/font/local`, [`app/fonts/Azalea.otf`](app/fonts)) →
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

## 4. Using it

- **Reference gallery:** [`/style-guide`](app/style-guide/page.tsx) renders every
  token and component variant — the living equivalent of the DS card gallery.
- **Real screens** (`app/login`, `app/dashboard`, `app/bets`) use these
  components with live Supabase data and the `DATA_MODEL.md` schema — the
  `design-system/ui_kits/sportsbook/` screens are layout reference only; nothing
  is hardcoded from the demo data.
- **Adding a component:** reuse/extend the shadcn primitive if one fits;
  otherwise add under `components/betting|modules/` and bind classes to the
  semantic tokens above — don't reach past them to raw hex.
- **Verify:** `npm run lint` and `npx tsc --noEmit` and `npm run build` must stay
  green. The `design-system/` folder is vendored reference and is excluded from
  linting.
