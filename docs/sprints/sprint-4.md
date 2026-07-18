# Sprint 4 — Placement API & Place-Bet UI (Phase 4b)

> Part of the [Ozark Open roadmap](../ROADMAP.md). One sprint = one sitting; don't start while blockers are open.

**Goal:** a participant can place, edit, and remove a wager on a pick from the menu.
**Target:** early–mid Aug · **Blockers:** Sprint 3.

- [x] `app/api/placements/route.ts`: POST/PATCH/DELETE, calling `lib/validation.ts` before any write; reject non-participants and non-`open` bets. Every write snapshots the pick's current odds into `odds_at_placement`; DELETE sets `deleted_at` (soft delete; re-placing revives the row).
- [x] Self-pick flagging on write: pick's `player_user_id` = bettor → `requires_admin_review = true`.
- [x] Inline amount input per **pick** on `/bets` for each `open` bet (own placement pre-filled if it exists); single-pick categories switch to pick-one affordance.
- [x] Clear error surface: rule violations come back as human-readable messages ("Max single bet is $20 for your $40 entry", "You can't bet against yourself in a match").
- [x] Finish the Sprint 2 import-report warning: odds changed on picks with live placements.

**Done when:** a participant can complete a legal placement end-to-end on the phone, and every §7 violation is rejected with a readable message.

> **Verification status (Jul 17, 2026):** code complete. Verified locally: every §7
> violation produces its `lib/validation.ts` message through the route's exact context
> assembly (`lib/placements.test.ts`, 52 tests green), and the DB lifecycle —
> insert / edit / soft delete / revive, hard-delete block, post-close visibility —
> holds under RLS on a throwaway local Postgres 16 (`scripts/placement-roundtrip.ts`).
> `npm run build` and `npm run lint` clean. The **in-browser half of "Done when"
> (a legal placement end-to-end on the phone) is pending prod** — the prod SQL
> chain landed Jul 18, 2026 (#12/#22) and the PR is merged, so only the browser
> pass itself remains; tracked in #24 ("Sprint 4: verify placement flow end-to-end
> in the prod browser").
