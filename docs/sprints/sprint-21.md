# Sprint 21 — Dry-run bug fixes

> Part of the [Ozark Open roadmap](../ROADMAP.md). One sprint = one sitting. **Defect sprint** — every item here is the app failing against its own documented intent, found by running the real thing with Pat on Jul 31, 2026. Ship this before anything else from that session.

**Goal:** close the defects the dry run exposed, so the next rehearsal isn't spent rediscovering them. Two of the five move money or block onboarding outright.

**Target:** before the Aug 28 feature freeze; the two P0s well before · **Blockers:** none. All findings are self-contained.

**Reads:** `docs/dry-run/ISSUE_LOG.md` (the session record, rows 1–8 and 21), the linked GitHub issues — each is written to be actionable cold.

### Why this sprint

The dry run's bar was *"completes without an admin needing to touch code or ask Andrew a question."* It cleared that bar overall — the whole lifecycle ran and the pool reconciled to the cent — but produced 21 findings. These five are the ones where the app is simply wrong.

- [ ] **Avatar upload fails with an RLS violation** ([#90](https://github.com/andrewelong18/ozark-open/issues/90)) — **P0. Still open: diagnosed, not fixed (Aug 7).** Blocks the photo step of onboarding, the highest-support-load moment of September. Same code in `components/onboarding/onboarding-form.tsx:70` and `components/profile/profile-form.tsx:69`. The obvious causes stayed ruled out on a second read — the bucket has both an INSERT and an UPDATE policy (`upsert: true` needs both), the `<uid>/avatar` path matches the policy, and the client is a stock `createBrowserClient`. So instead of a policy rewrite: `scripts/avatar-upload-probe.ts` replays the exact upload with a real user token via raw `fetch` (status and body survive) and decodes the JWT it sends, because the top untested hypothesis is that the request arrives as `anon` against `TO authenticated` policies. Running it needs prod credentials this environment doesn't have; the ruled-out list and the usage are commented on the issue.
- [x] **Revoking access destroys the entry fee and unbalances the pool** ([#91](https://github.com/andrewelong18/ozark-open/issues/91)) — **P0, and it moves money. Shipped Aug 7, 2026** as a soft revoke (Andrew's call over the fee-preservation patch): `revoked_at` on the row, so eligibility becomes "row exists AND `revoked_at IS NULL`" (PRD §12 **A13**), applied at all nine query sites. The audit the issue warned about was cheaper than feared — **no RLS policy anywhere reads `tournament_participants`**, and the admin write policy is already `FOR ALL`, so no policy changed. A revoked bettor now leaves both sides of the arithmetic together: `buildResultsTable` drops the payout rows of anyone not in `participants`, so the denominator can't include someone the pool isn't funding. Nothing is deleted, so re-approval (now an upsert clearing the flag, pre-filled with the preserved fee) restores the member, their fee and their wagers exactly. Migration still to be applied in prod ([#113](https://github.com/andrewelong18/ozark-open/issues/113)); browser round trip pending ([#114](https://github.com/andrewelong18/ozark-open/issues/114)).
- [x] **A $0 wager is refused silently** ([#92](https://github.com/andrewelong18/ozark-open/issues/92)) — **Shipped Aug 7, 2026.** Both guards in `bet-placement-card.tsx` bailed out with a bare `return`, and since the stake box only permits digits, `"0"` is truthy — so the button was *enabled*, the press did nothing, and the server's correct "Minimum bet is $1." never got the chance to run. They now call `stakeEntryError` (new, in `lib/placements.ts`, reusing `validateAmount`'s own strings so client and server can't drift) and report through the same red-border-plus-toast path as a server rejection. Extracting the helper is also what made it testable — there's no component test infrastructure. Whole boundary set covered: `0`, `2.50`, `-5`, empty.
- [ ] **Crop and remove on avatar upload** ([#93](https://github.com/andrewelong18/ozark-open/issues/93)) — still open, still blocked by #90 exactly as predicted. P2 quality-of-life; keep it dependency-light when it comes round, a canvas square crop is enough.
- [x] **Dry-run tooling** ([#94](https://github.com/andrewelong18/ozark-open/issues/94), [#95](https://github.com/andrewelong18/ozark-open/issues/95)) — **Shipped Aug 7, 2026.** `dev-magiclink.ts` now emits `…/auth/callback?token_hash=…&type=magiclink` from `properties.hashed_token` (needs one live run to be fully proven — [#115](https://github.com/andrewelong18/ozark-open/issues/115)). The CTE collision turned out to be in **four** files, not three: `20-`/`30-phase1|2-placements.sql` carry the same pattern and the same false "idempotent" header claim, and `20-`'s delete wasn't phase-scoped, so a mid-session re-run would have wiped hand-placed Phase 2 wagers too. `dry-run-verify.ts` now runs each file twice and asserts the counts hold — the harness ran each exactly once, so it could never have caught this.
- [x] **Gameplan corrections** ([#109](https://github.com/andrewelong18/ozark-open/issues/109)) — **Shipped Aug 7, 2026.** Acts 1.4/2.2's two menu checks moved to the end of Act 3.1 (they need a published menu, and `00-reset.sql` hides all 19 bets until then); Act 2.3 now names Casey Sideline and makes restoring his $50 a step, which is what silently broke Act 4.6's cap case and Appendix A's $425; Act 3.5's count corrected 41 → 42, in the SQL file's header too. Step numbers deliberately unchanged — the issue log's Act column keys to them — so the moved checks leave forward pointers behind. Act 0.5 and Act 2.5 also rewritten for the #94 and #91 fixes.

**Done when:** a brand-new member can onboard with a cropped photo; revoking and re-approving leaves the pool arithmetic unchanged; every rejected stake shows a message; and `bash scripts/dry-run-verify.sh` passes end to end from a clean checkout, on macOS, without hand-editing the SQL.

**Status (Aug 7, 2026): three of four buildable items shipped; the avatar half is diagnosed, not fixed.**

| Done-when clause | Where it stands |
|---|---|
| Revoking and re-approving leaves the pool arithmetic unchanged | ✅ In code and unit-tested (`lib/payouts.test.ts`: pool, denominator and every other bettor's share are identical across the round trip). RLS proven on a throwaway PG16 via `scripts/placement-roundtrip.ts`. **Not yet true in prod** — the migration hasn't been applied (#113), and the browser walkthrough is #114 |
| Every rejected stake shows a message | ✅ `0`, `2.50`, `-5` and empty all produce a message, asserted against the server's own wording |
| `dry-run-verify.sh` passes end to end without hand-editing the SQL | ✅ Passes here (Linux, PG16), same reconciliation as Jul 31: $425 − $32 = $393, 0 pending. The macOS half of the clause is untested in this environment |
| A brand-new member can onboard with a cropped photo | ❌ #90 blocks #93. Probe script written; needs one run against prod (see the comment on #90) |

Verification run on Aug 7: `npm test` 195/195, `npx tsc --noEmit` clean apart from the pre-existing `lib/profile.test.ts` error tracked in #87, `npm run build` compiles, `bash scripts/local-db-verify.sh` and `bash scripts/dry-run-verify.sh` both pass.

### Out of scope (don't build)

- **Anything from the rule-change list.** Sprint 22 owns the pick-count rule and the import guards; mixing them in makes this sprint unshippable.
- **Admin UI additions.** Sprint 23.
- **Re-landing the pick sort.** Reverted deliberately in `bc9447f`; it belongs to Sprint 24 with tests.
