# Sprint 21 — Dry-run bug fixes

> Part of the [Ozark Open roadmap](../ROADMAP.md). One sprint = one sitting. **Defect sprint** — every item here is the app failing against its own documented intent, found by running the real thing with Pat on Jul 31, 2026. Ship this before anything else from that session.

**Goal:** close the defects the dry run exposed, so the next rehearsal isn't spent rediscovering them. Two of the five move money or block onboarding outright.

**Target:** before the Aug 28 feature freeze; the two P0s well before · **Blockers:** none. All findings are self-contained.

**Reads:** `docs/dry-run/ISSUE_LOG.md` (the session record, rows 1–8 and 21), the linked GitHub issues — each is written to be actionable cold.

### Why this sprint

The dry run's bar was *"completes without an admin needing to touch code or ask Andrew a question."* It cleared that bar overall — the whole lifecycle ran and the pool reconciled to the cent — but produced 21 findings. These five are the ones where the app is simply wrong.

- [ ] **Avatar upload fails with an RLS violation** ([#90](https://github.com/andrewelong18/ozark-open/issues/90)) — **P0.** Blocks the photo step of onboarding, the highest-support-load moment of September. The obvious causes are already ruled out (policies exist in prod, path matches the policy, `userId` is the real auth uid), so **start with a captured failing request**, not a policy rewrite. Same code in `components/onboarding/onboarding-form.tsx:70` and `components/profile/profile-form.tsx:69` — fix both.
- [ ] **Revoking access destroys the entry fee and unbalances the pool** ([#91](https://github.com/andrewelong18/ozark-open/issues/91)) — **P0, and it moves money.** Revoke is a hard `DELETE` of the `tournament_participants` row, but placements survive it, so a revoked bettor keeps wagers in the pool while their entry fee stops funding it and `poolTotal()` silently shrinks. Decide soft-revoke vs. fee preservation before building; soft-revoke means auditing everywhere that treats row-existence as the betting gate (A12).
- [ ] **A $0 wager is refused silently** ([#92](https://github.com/andrewelong18/ozark-open/issues/92)) — server-side validation is right, the client swallows the message. Other §7 rejections do surface, so this is an inconsistency. Check the whole boundary set at once: `0`, `2.50`, `-5`, empty.
- [ ] **Crop and remove on avatar upload** ([#93](https://github.com/andrewelong18/ozark-open/issues/93)) — P2 quality-of-life, blocked by #90. Keep it dependency-light; a canvas square crop is enough.
- [ ] **Dry-run tooling** ([#94](https://github.com/andrewelong18/ozark-open/issues/94), [#95](https://github.com/andrewelong18/ozark-open/issues/95)) — `dev-magiclink.ts` emits the legacy `/auth/v1/verify` link the callback correctly rejects; the three `*-placements`/`*-fallback` SQL files collide on their unique constraint because a data-modifying CTE shares the INSERT's snapshot. Both cost live time on Jul 31.
- [ ] **Gameplan corrections** ([#109](https://github.com/andrewelong18/ozark-open/issues/109)) — docs only. Acts 1.4/2.2 are ordered before the menu exists; Act 2.3 changes an entry fee and never restores it (which silently broke Act 4.6 and Appendix A on the night); Act 3.5's wager count is off by one.

**Done when:** a brand-new member can onboard with a cropped photo; revoking and re-approving leaves the pool arithmetic unchanged; every rejected stake shows a message; and `bash scripts/dry-run-verify.sh` passes end to end from a clean checkout, on macOS, without hand-editing the SQL.

### Out of scope (don't build)

- **Anything from the rule-change list.** Sprint 22 owns the pick-count rule and the import guards; mixing them in makes this sprint unshippable.
- **Admin UI additions.** Sprint 23.
- **Re-landing the pick sort.** Reverted deliberately in `bc9447f`; it belongs to Sprint 24 with tests.
