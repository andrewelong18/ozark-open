# Design Brief — Ozark Open Sportsbook

**Purpose of this doc:** context for creating the design system (tokens, components, screen patterns) for the Ozark Open Sportsbook web app. The output should be a cohesive visual system that a developer can implement directly in Tailwind CSS + shadcn/ui.

---

## 1. What the Product Is

A **private, invite-only fantasy-golf betting app** for ~24 friends at an annual 3-day golf tournament (the Ozark Open, Sept 24–27, 2026). Participants pay a $20–$50 entry fee, get a curated menu of bets with hand-set American odds, and wager their exact entry fee across two betting rounds. It's **pari-mutuel**: no house, no rake — the whole pool is redistributed proportionally to how everyone's bets performed.

Think: *a real sportsbook's information density and trust cues, but with the warmth of a group-chat bet between friends.* It replaces texting bets to one guy who types them into Excel.

**It is not** a commercial gambling product. No marketing pages, no onboarding funnel, no public access — every screen is behind login.

---

## 2. Users & Context of Use

- **~24 men, ages 22–45**, phones in one hand, often a drink or a golf club in the other.
- **Primary device: phone, outdoors, in sunlight** — on golf carts, at the range, at the bar after the round. Mobile-first is non-negotiable; desktop is the secondary case (the admins doing data entry).
- Usage is **bursty**: intense activity the night bets open and the morning they close, then obsessive score-checking after each round resolves.
- Two roles: **participants** (bet, check results) and **4 admins** (they manage data in Supabase Studio, not in the app — no admin UI needed beyond a couple of read-only compliance/overview pages).

---

## 3. Brand & Tone

- **Name displayed:** "Ozark Open Sportsbook" (informally "Sig Tau Sportsbook" — fraternity crowd, inside jokes welcome in copy but the UI itself should look sharp, not jokey).
- **Vibe targets:** classic golf clubhouse × modern sportsbook. Masters-style restraint (deep greens, cream, gold accents) meets DraftKings-style data clarity (odds chips, tabular numbers) — *without* the casino neon or urgency-manipulation patterns of real betting apps.
- **Anti-goals:** no neon gradients, no confetti, no countdown-timer anxiety, no dark-pattern "BET NOW" pressure. Betting closes when an admin closes it; the design should feel relaxed and confident.
- Personality words: **clubby, trustworthy, sharp, a little cocky, fun.**
- A simple logotype/mark suggestion is welcome (golf flag, crest, or monogram territory) but not required.

---

## 4. Technical Constraints (hard)

- **Stack:** Next.js 15 (App Router) + Tailwind CSS + **shadcn/ui** components. The design system must be expressible as **CSS variables / Tailwind theme tokens** and shadcn component variants — not bespoke components from scratch.
- Existing shadcn components in use: `Card`, `Badge`, `Button`, `Input`, `Label`. Expect to add: `Table`, `Tabs`, `Alert`, `Dialog`, `Progress`/stat displays.
- **Dark mode:** pick one — either ship light + dark or commit to a single polished theme (single theme is acceptable for v1; if one, consider that outdoor sunlight readability favors a light theme with strong contrast).
- **Numbers everywhere:** odds (`+150`, `-130`, fractional `3-2`, implied `40.0%`) and money (`$40`, `$21.87`). All numeric displays need **tabular numerals** and consistent alignment.
- Accessibility floor: WCAG AA contrast, touch targets ≥44px, color never the sole carrier of meaning (outcomes also get labels/icons).

---

## 5. Screens to Design For

| Screen | What it does | Design emphasis |
|---|---|---|
| **Login** | Email → magic link sent. One field, one button. | Warm first impression; the only "brand moment" page |
| **Dashboard** | Tournament name/status, your registration + entry fee, **pool total**, personalized rules card | Glanceable stat cards |
| **Bet Menu** (`/bets`) | 15–25 bets per round, grouped by round → category. Per bet: #, description, odds (American/fractional/implied), status badge, outcome badge, **inline stake input** when open | The core screen. Dense but scannable tables on mobile; this is where the design system earns its keep |
| **My Bets** | Your placements by round, running total vs. entry fee, remaining budget, compliance banner ("You've wagered $23 of $40…"), theoretical payout per resolved bet | Progress/budget visualization; warning states that inform without nagging |
| **All Bets** (post-close) | Everyone's placements — who bet what, for how much, how it's going | The social screen; feels like a leaderboard of bravado |
| **Results** | Final standings: name, entry, theoretical payout, actual payout, P/L | Celebratory but legible; the screenshot people share |
| **Leaderboard** | Golf standings mirrored from the scoring sheet (player, thru, score, position) | Familiar golf-leaderboard conventions |

---

## 6. Component Inventory (the design system's parts list)

1. **Odds chip** — American odds as the primary token (`+150` / `-130`), positive/negative visually distinct; compact variants showing fractional + implied probability.
2. **Status badge** — bet lifecycle: `open` / `closed` / `resolved` (draft never shown). Open should feel inviting, closed neutral, resolved quiet.
3. **Outcome badge** — `hit` / `miss` / `push` / `void`. **Hit = win (green family), miss = loss (red family), push/void = neutral returns.** Needs to read at a glance in a long table; pair color with icon or label.
4. **Stake input** — inline dollar input on each open bet row. Whole dollars only. Needs clear placed/unplaced/error states and a satisfying "bet placed" confirmation.
5. **Budget/progress module** — "wagered $X of $Y" with 5-bet-minimum indicator. Appears on My Bets and condensed in the header/dashboard.
6. **Rules card** — personalized: entry fee, max single bet, max self-bet, min/max bet counts. Reference-card energy, not legal-terms energy.
7. **Compliance banner** — "incomplete" warning while under minimum or off exact total. Firm but friendly; never blocks browsing.
8. **Bet table row** — the workhorse. Mobile-first layout for: bet #, description (can be long: "Dan Mercer to finish top 4 + ties"), odds cluster, badges, stake input/placed amount.
9. **Stat card** — dashboard tiles (pool total, your entry, payout so far).
10. **Money display** — consistent treatment for dollars (whole) and computed payouts (cents), P/L with +/− coloring.
11. **Empty/waiting states** — "No bets published yet", "Round 2 opens Saturday morning" — good places for personality.
12. **Header/nav** — app name, user display name, logout; mobile nav across the 5–6 pages.

---

## 7. Deliverables Wanted from the Design System

1. **Design tokens:** color palette (semantic: background/surface/primary/accent + the win/loss/neutral outcome triad + open/closed status hues), type scale (with a tabular-numeral-capable number treatment), spacing, radii, shadows — expressed as CSS variables compatible with shadcn/ui theming.
2. **Typography pairing:** one display/brand face (clubhouse character) + one workhorse UI face; system-font fallbacks acceptable.
3. **Component specs** for the inventory in §6 (states: default/hover/active/disabled/error).
4. **Two or three key screens mocked** to prove the system: **Bet Menu (mobile)** is mandatory; Dashboard and Results are the best supporting picks.
5. Light guidance on motion (subtle; confirmation moments only) and iconography style.

---

## 8. Constraints Recap (do not violate)

- Mobile-first, sunlight-readable, thumb-reachable.
- Maps cleanly onto Tailwind + shadcn/ui tokens and variants.
- Outcome colors must survive a 25-row table without turning into a Christmas tree.
- No casino/urgency dark patterns. No public-facing/marketing pages needed.
- Whole-dollar inputs; payout displays show cents.
- 24 users, private, fun — polish where it's seen (bet menu, results), economize where it isn't (login, empty states can be simple).
