# Sprint 24 — Betting menu UX

> Part of the [Ozark Open roadmap](../ROADMAP.md). Presentation sprint — no schema, no rule changes. Everything here is about the page ~32 people refresh all weekend, mostly one-handed on a phone, standing on a tee box.

**Goal:** make `/bets` readable. Right now a closed menu is a wall of names, the filters compete with each other, a golfer's handicap is glued into their name, and pick order is undefined.

**Target:** before the Aug 28 feature freeze · **Blockers:** none. Independent of Sprints 21–23.

**Reads:** `components/betting/bets-menu.tsx`, `app/bets/page.tsx`, `lib/closed-bets.ts`, `docs/DESIGN_SYSTEM.md` and the `ozark-open-design` skill (the visual source of truth).

### Why this sprint

Act 11's mobile pass and Act 6.4's reveal were where Pat's reactions were sharpest. None of these are bugs in the money; all of them are why the app feels harder to use than it is.

- [x] **Stroke handicap becomes a badge** ([#102](https://github.com/andrewelong18/ozark-open/issues/102)). "Jake Kohne (E)" should render as **Jake Kohne** plus a small `E` badge, with the profile link wrapping only the name. **Reuse the importer's existing strip** — `regexp_replace(label, '\s*\((?:E|[+-]?\d+)\)\s*$', '')` — rather than writing a second one. If display and matching ever diverge, a label that renders fine could stop linking to its player, and the self-bet cap, self-pick flag and opponent block all depend on that link. Extract one helper, use it in both places.
- [x] **Collapse the reveal** ([#103](https://github.com/andrewelong18/ozark-open/issues/103)). A tertiary `x bettors` link per bet row, expanding accordion-style and collapsing again, **collapsed by default**. `groupPlacementsByPick` in `lib/closed-bets.ts` already shapes the data. Keep per-pick totals visible while collapsed — the totals are the at-a-glance value, the names are the detail. A closed bet nobody wagered on still shows, so make sure the zero-bettor collapsed state reads sensibly. This is the weekend's big social moment; it should still feel like a reveal, just not a wall.
- [x] **Simplify the filters** ([#104](https://github.com/andrewelong18/ozark-open/issues/104)). One filter dimension at a time. Replace the `"all" | "open" | "closed"` triple (`bets-menu.tsx:76`) with a **binary open/closed toggle defaulting to open**, falling back to closed when nothing is open. Fold in the existing "contextual" round and category logic (`:152`, `:180`) rather than leaving three competing patterns. **The default must be computed from what's on the page** — during a live tournament Phase 1 is closed while Phase 2 is open, so both states exist at once and "default to open" has to mean *open bets exist*, not *Phase 1*.
- [x] **Sort picks by implied probability** ([#105](https://github.com/andrewelong18/ozark-open/issues/105)). Favourites first, so a bet reads best-to-worst however the sheet was typed. Derive from `american_odds` (the payout-math field, always present) **not** the sheet's `probability` column (verbatim display, can be blank). Tie-break on `sheet_pick_id`.

  This also fixes a real correctness bug it uncovered: `app/bets/page.tsx` fetches `bet_picks` with **no `ORDER BY` at any layer**, so order is whatever Postgres returns and an upsert can reshuffle it — while `/my-bets` and `/admin/view` both sort by `sheet_pick_id`, making the menu the odd one out. Written during the dry run as `e045a99` and deliberately reverted in `bc9447f`; re-land it **with a unit test on the comparator**.

  Decide as part of this: should `/my-bets` and `/admin/view` match the menu's order, or keep `sheet_pick_id`?

  **Shipped in two halves.** `lib/pick-order.ts` + 11 comparator tests landed early as `524ad92`, and `app/bets/page.tsx` called `sortPicks`. But `bets-menu.tsx` still re-sorted by `sheet_pick_id` at *both* render sites, which ran afterwards and threw the ordering away — so #105 shipped as a no-op and the menu still rendered in Postgres order. Both re-sorts removed in `4e28eef`; ordering now happens once, server-side, in `groupBets`.

  **Decision — `/my-bets` and `/admin/view` keep `sheet_pick_id`.** `/admin/view` is a replica of the admin's View sheet, so re-ordering it defeats the page's whole purpose. `/my-bets` lists only the picks you actually wagered on — favourites-first over a partial set sorts an arbitrary subset and reads as noise. The menu is the one surface where you scan a bet's *full* slate to choose, which is where best-to-worst earns its keep. Recorded in `lib/pick-order.ts` next to the code that has to keep honouring it.

**Done when:** on a phone, a closed bet shows a bettor count that expands and collapses; only one filter is active at a time and no combination empties the page; handicaps read as badges with pick→player matching unchanged (`dry-run-verify.sh` still links 56 picks); and a bet's picks render favourites-first, deterministically across re-uploads.

### Shipped — Aug 8, 2026

All four checkboxes, verified locally: `npm test` **337 passing** (was 298 — +39 across `pick-label`, `bet-filters`, `closed-bets` and `placements`) · `npx tsc --noEmit` clean · `npm run build` clean · `local-db-verify.sh` passing · `dry-run-verify.sh` end to end, pool unchanged at **$425 − $32 = $393** with 0 pending and **56 picks still linked**.

Two things this sprint found that the plan didn't anticipate:

1. **#105 was a no-op on `main`** — see the checkbox above. The feature was written, tested and merged, and none of it reached the screen.
2. **The on-behalf thread had no coverage.** Sprint 23 threads `onBehalfOf` page → `BetsMenu` → `BetPlacementCard`, where it swaps the write endpoint. A filter refactor that dropped the prop would make an admin's wager *for a member* post to `/api/placements` as themselves — a valid, correctly-validated wager on the wrong person's slate, invisible from both ends. The prop is now **required** on `BetPlacementCard` (dropping it is a `tsc` error, verified by removing it and watching TS2741 fire), and the endpoint swap moved into a unit-tested `placementTarget()`.

Deliberately not done, and why:

- **The placement confirm strips keep the full label.** There the label is prose in a one-line sentence ("Lock in $20 on Jake Kohne (E)"), and the two-tap flow was verified with Pat on Jul 31 — out of scope per this file.
- **`/admin/view` keeps verbatim labels and sheet order.** It is a View-sheet replica; both changes would make it stop replicating the sheet.

### Out of scope (don't build)

- **Changing what the reveal shows.** Names and amounts on every pick after close is settled (Q11). This is about disclosure, not content.
- **Sorting bets.** Phase → round → category → `sheet_bet_id` stays.
- **Live odds, animation, or real-time updates.** Globally out of scope.
- **Touching the placement flow.** The two-tap confirm works and was verified on Jul 31.
