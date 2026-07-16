# Sportsbook — UI Kit

High-fidelity, click-through recreation of the Ozark Open Sportsbook web app. Mobile-first (designed at ~430px, centered on desktop). Composes the design-system component primitives — it does not re-implement them.

## Run
Open `index.html`. It links the design system's `styles.css`, loads the compiled bundle (`_ds_bundle.js`), then mounts the screens.

## Flow
1. **Login** — magic-link brand moment. Enter an email → "Check your email" → **Continue (demo)** signs you in.
2. **Dashboard** — pool total, your entry, payout-so-far stat cards; Round 1 budget snapshot; personalized rules card.
3. **Bet Menu** (core) — Round 1 open bets grouped by category. Type a whole-dollar stake, hit ↵/✓ to place. The sticky budget bar + compliance banner track your total against your $40 entry live.
4. **My Bets** — your placements by round, running total, and per-bet theoretical payout on resolved bets.
5. **All Bets** — reuses the My Bets layout (social/post-close view stand-in).
6. **Results** — final pari-mutuel standings with a winner spotlight.
7. **Leaderboard** — golf standings mirrored from the scoring sheet (read-only).

## Files
- `index.html` — mount + script loading
- `data.js` — fake tournament/bet/results data (`window.OZ`)
- `App.jsx` — auth gate + Header + screen router
- `screens/` — `Login`, `Dashboard`, `BetMenu`, `MyBets`, `Results`, `Leaderboard`

## Notes
- Ground truth: `riversteve/ozark-open` (`app/bets`, `app/dashboard`, `app/login`) + the design brief §5 screen list. The real app is Next.js + Supabase; this kit fakes all data and interactivity.
- Admin UI is intentionally omitted — admins work in Supabase Studio, per the PRD.
