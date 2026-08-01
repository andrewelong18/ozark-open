# Sprint 24 — Betting menu UX

> Part of the [Ozark Open roadmap](../ROADMAP.md). Presentation sprint — no schema, no rule changes. Everything here is about the page ~32 people refresh all weekend, mostly one-handed on a phone, standing on a tee box.

**Goal:** make `/bets` readable. Right now a closed menu is a wall of names, the filters compete with each other, a golfer's handicap is glued into their name, and pick order is undefined.

**Target:** before the Aug 28 feature freeze · **Blockers:** none. Independent of Sprints 21–23.

**Reads:** `components/betting/bets-menu.tsx`, `app/bets/page.tsx`, `lib/closed-bets.ts`, `docs/DESIGN_SYSTEM.md` and the `ozark-open-design` skill (the visual source of truth).

### Why this sprint

Act 11's mobile pass and Act 6.4's reveal were where Pat's reactions were sharpest. None of these are bugs in the money; all of them are why the app feels harder to use than it is.

- [ ] **Stroke handicap becomes a badge** ([#102](https://github.com/andrewelong18/ozark-open/issues/102)). "Jake Kohne (E)" should render as **Jake Kohne** plus a small `E` badge, with the profile link wrapping only the name. **Reuse the importer's existing strip** — `regexp_replace(label, '\s*\((?:E|[+-]?\d+)\)\s*$', '')` — rather than writing a second one. If display and matching ever diverge, a label that renders fine could stop linking to its player, and the self-bet cap, self-pick flag and opponent block all depend on that link. Extract one helper, use it in both places.
- [ ] **Collapse the reveal** ([#103](https://github.com/andrewelong18/ozark-open/issues/103)). A tertiary `x bettors` link per bet row, expanding accordion-style and collapsing again, **collapsed by default**. `groupPlacementsByPick` in `lib/closed-bets.ts` already shapes the data. Keep per-pick totals visible while collapsed — the totals are the at-a-glance value, the names are the detail. A closed bet nobody wagered on still shows, so make sure the zero-bettor collapsed state reads sensibly. This is the weekend's big social moment; it should still feel like a reveal, just not a wall.
- [ ] **Simplify the filters** ([#104](https://github.com/andrewelong18/ozark-open/issues/104)). One filter dimension at a time. Replace the `"all" | "open" | "closed"` triple (`bets-menu.tsx:76`) with a **binary open/closed toggle defaulting to open**, falling back to closed when nothing is open. Fold in the existing "contextual" round and category logic (`:152`, `:180`) rather than leaving three competing patterns. **The default must be computed from what's on the page** — during a live tournament Phase 1 is closed while Phase 2 is open, so both states exist at once and "default to open" has to mean *open bets exist*, not *Phase 1*.
- [ ] **Sort picks by implied probability** ([#105](https://github.com/andrewelong18/ozark-open/issues/105)). Favourites first, so a bet reads best-to-worst however the sheet was typed. Derive from `american_odds` (the payout-math field, always present) **not** the sheet's `probability` column (verbatim display, can be blank). Tie-break on `sheet_pick_id`.

  This also fixes a real correctness bug it uncovered: `app/bets/page.tsx` fetches `bet_picks` with **no `ORDER BY` at any layer**, so order is whatever Postgres returns and an upsert can reshuffle it — while `/my-bets` and `/admin/view` both sort by `sheet_pick_id`, making the menu the odd one out. Written during the dry run as `e045a99` and deliberately reverted in `bc9447f`; re-land it **with a unit test on the comparator**.

  Decide as part of this: should `/my-bets` and `/admin/view` match the menu's order, or keep `sheet_pick_id`?

**Done when:** on a phone, a closed bet shows a bettor count that expands and collapses; only one filter is active at a time and no combination empties the page; handicaps read as badges with pick→player matching unchanged (`dry-run-verify.sh` still links 56 picks); and a bet's picks render favourites-first, deterministically across re-uploads.

### Out of scope (don't build)

- **Changing what the reveal shows.** Names and amounts on every pick after close is settled (Q11). This is about disclosure, not content.
- **Sorting bets.** Phase → round → category → `sheet_bet_id` stays.
- **Live odds, animation, or real-time updates.** Globally out of scope.
- **Touching the placement flow.** The two-tap confirm works and was verified on Jul 31.
