# Sprint 18 — Player Profile Modals (Bonus)

> Part of the [Ozark Open roadmap](../ROADMAP.md). **Bonus wish-list sprint (added Jul 23, 2026)** — an enhancement, never an MVP blocker. Work it only when no MVP sprint (0–9) is waiting; if it never ships, the tournament still runs. Grew out of Andrew's Jul 23, 2026 direction (clickable player profiles, with a FootballStatsPro player-card screenshot as the information-architecture reference — rendered in the Ozark Open design system, not the reference's dark theme).

**Goal:** turn every member's name into a doorway. Clicking a name anywhere it renders opens an elegantly-animated **profile modal** — avatar, name, "member since" year, hometown, a scouting strength + weakness, a short bio, and a chart of their stats across the previous 4 Ozark Opens. Content is dummy for now (seeded by the migration, Studio-editable), so the presentation lands first and the real copy follows.

**Target:** as time allows before the Aug 28 feature freeze · **Blockers:** none hard. Builds on Sprint 15 (`Avatar` + `UserName` primitives, `avatar_url`) and Sprint 6/7 (the two name-render sites).

**Reads:** `docs/DATA_MODEL.md` §3.1 (`users`), the `ozark-open-design` skill (modal visuals — one gold moment per screen, Azalea for titles only, subtle confirmation-only motion) and the `dataviz` skill (single-series bar chart). `components/avatar.tsx`, `components/user-name.tsx`, `components/betting/bets-menu.tsx`, `app/results/page.tsx`.

**Admin-owned data, dummy for now.** The six new profile columns on `users` are admin/Studio-owned exactly like `display_name` — pinned in `guard_users_self_update`, never editable from `/profile`. The migration seeds placeholder copy + a deterministic per-member 4-year series so every profile renders immediately; Andrew replaces the real values in Studio later.

**First modal in the app.** No dialog/overlay existed before this. Built on Base UI's `Dialog` (already a dep) wrapped in `components/ui/dialog.tsx`, animated with the design system's `--dur-slow` / `--ease-out` via Base UI's transition data-attributes (fade backdrop + fade/zoom panel, symmetric in and out).

- [x] Migration `20260723000000_player_profiles.sql`: add `bio`, `hometown`, `member_since`, `strength`, `weakness`, `past_performance` (jsonb `{year,value}[]`) to `public.users` (all nullable); seed dummy values for existing rows (deterministic per-id chart series); extend `guard_users_self_update` to pin the six columns for self-serve updates.
- [x] `lib/player-profile.ts` (+ node:test): `normalizeProfileRow` with null-safe fallbacks, `parsePastPerformance` (sorts + sanitizes), `dummyPastPerformance` (deterministic fallback), and the pure `chartBars` geometry helper.
- [x] `components/ui/dialog.tsx`: the app's first modal primitive — a brand-styled Base UI `Dialog` wrapper (portal, focus-trap, Esc/outside dismiss) with the fade + zoom enter/exit animation.
- [x] `components/player/`: `player-stats-chart.tsx` (hand-rolled SVG single-series bar chart, best year in gold), `player-profile-modal.tsx` (lazy fetch on open, indigo feature header, strength/weakness cards, bio, chart), `player-profile-provider.tsx` (one shared modal + `usePlayerProfileModal` context), `player-chip.tsx` (clickable Avatar+name trigger).
- [x] Wire it in: mount `PlayerProfileProvider` in `app/layout.tsx`; swap the inline `Avatar`+`UserName` clusters for `<PlayerChip>` in `components/betting/bets-menu.tsx` (closed-bet placements) and `app/results/page.tsx` (winner spotlight + table rows).
- [ ] **Deferred — leaderboard.** `/leaderboard` names are raw Google-Sheet strings with no FK to `users`, so they can't open a profile without name-to-user matching. Out of scope here; revisit if that matching is ever worth building (file a GitHub issue when picked up).
- [x] Docs: this file; `DATA_MODEL.md` §3.1 (the six new columns, admin-owned); `ROADMAP.md` Sprint Index + Status Summary.

**Done when:** clicking any member's name on `/bets` (a closed bet with placements) or `/results` opens a modal that animates in elegantly and out on close (Esc / backdrop / ×), showing that member's dummy bio, member-since, hometown, strength, weakness, and a 4-year stats chart — all in the Ozark Open design system, with focus-trapped a11y — verified against desktop + mobile screenshots. A self-serve `/profile` update can never change any of the new profile fields (guard).
