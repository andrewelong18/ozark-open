# Sprint 7 — Payouts: Theoretical & Final (Phases 6 + 7)

> Part of the [Ozark Open roadmap](../ROADMAP.md). One sprint = one sitting; don't start while blockers are open.

**Goal:** per-placement, per-user, and final pari-mutuel numbers that match what Pat would compute by hand.
**Reads:** PRD §5 · DATA_MODEL §4 · ADR 0001 §9.
**Target:** ~Aug 21 · **Blockers:** Sprint 6. *(Q5 resolved: display cents. Q6-as-amended: push returns stake in the math; void leaves the pool.)*

- [x] Migration: `placement_payouts_view` per DATA_MODEL §4 — computes from `odds_at_placement` + `bet_picks.result`, excludes soft-deleted rows, surfaces `refunded_stake` for voids. *(`security_invoker` added so the view honors RLS; SQL proven against a throwaway local PG16 by `scripts/payout-view-roundtrip.ts`. Prod SQL run pending — see the Sprint 7 issues.)*
- [x] "My Bets": theoretical payout per resolved placement + "Total theoretical payout" summary (pushes count, voids show as refunded).
- [x] Admin "view all" page: everyone's placements and payouts in one table, including still-open phases and self-pick review flags (replicates the spreadsheet's `View` sheet). *(Shipped as `/admin/view` with an admin-only nav link — flat rows grouped by bettor, per-bettor wagered/theoretical/actual-as-it-stands.)*
- [x] `lib/payouts.ts`: pool = sum(entry fees) − sum(refunded voided stakes); share = `user_theoretical / sum_all × pool`.
- [x] `/results` page: name, entry fee, theoretical payout, actual payout, profit/loss — visible only when `tournament.status = 'completed'`; amounts to the cent (Q5).
- [x] Cross-check the 2026 worked example: pool $520 (no voids), sum $279.57, Jake Kohne $21.87 → $40.67. Add a void case and verify the pool shrinks by exactly the voided stakes. *(Both in `lib/payouts.test.ts`. Note: the exact quotient of the published inputs is 40.6782 → displays $40.68 under round-half-up cents; the PRD's $40.67 looks like fuller-precision or truncated spreadsheet output — flagged for Pat rather than bent to match.)*

**Done when:** the numbers match Pat's hand-math for any user, including the void case. *(Verified locally — 113 unit tests incl. the worked example + void case, PG16 round trip for the view's SQL, build + lint. The view migration was applied to prod Jul 18, 2026 (#34); prod verification and Pat's confirmation tracked in the Sprint 7 issues.)*
