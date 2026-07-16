# Sprint 4 — Placement API & Place-Bet UI (Phase 4b)

> Part of the [Ozark Open roadmap](../ROADMAP.md). One sprint = one sitting; don't start while blockers are open.

**Goal:** a participant can place, edit, and remove a wager on a pick from the menu.
**Target:** early–mid Aug · **Blockers:** Sprint 3.

- [ ] `app/api/placements/route.ts`: POST/PATCH/DELETE, calling `lib/validation.ts` before any write; reject non-participants and non-`open` bets. Every write snapshots the pick's current odds into `odds_at_placement`; DELETE sets `deleted_at` (soft delete; re-placing revives the row).
- [ ] Self-pick flagging on write: pick's `player_user_id` = bettor → `requires_admin_review = true`.
- [ ] Inline amount input per **pick** on `/bets` for each `open` bet (own placement pre-filled if it exists); single-pick categories switch to pick-one affordance.
- [ ] Clear error surface: rule violations come back as human-readable messages ("Max single bet is $20 for your $40 entry", "You can't bet against yourself in a match").
- [ ] Finish the Sprint 2 import-report warning: odds changed on picks with live placements.

**Done when:** a participant can complete a legal placement end-to-end on the phone, and every §7 violation is rejected with a readable message.
