# Sprint 7 — Payouts: Theoretical & Final (Phases 6 + 7)

> Part of the [Ozark Open roadmap](../ROADMAP.md). One sprint = one sitting; don't start while blockers are open.

**Goal:** per-placement, per-user, and final pari-mutuel numbers that match what Pat would compute by hand.
**Reads:** PRD §5 · DATA_MODEL §4 · ADR 0001 §9.
**Target:** ~Aug 21 · **Blockers:** Sprint 6. *(Q5 resolved: display cents. Q6-as-amended: push returns stake in the math; void leaves the pool.)*

- [ ] Migration: `placement_payouts_view` per DATA_MODEL §4 — computes from `odds_at_placement` + `bet_picks.result`, excludes soft-deleted rows, surfaces `refunded_stake` for voids.
- [ ] "My Bets": theoretical payout per resolved placement + "Total theoretical payout" summary (pushes count, voids show as refunded).
- [ ] Admin "view all" page: everyone's placements and payouts in one table, including still-open phases and self-pick review flags (replicates the spreadsheet's `View` sheet).
- [ ] `lib/payouts.ts`: pool = sum(entry fees) − sum(refunded voided stakes); share = `user_theoretical / sum_all × pool`.
- [ ] `/results` page: name, entry fee, theoretical payout, actual payout, profit/loss — visible only when `tournament.status = 'completed'`; amounts to the cent (Q5).
- [ ] Cross-check the 2026 worked example: pool $520 (no voids), sum $279.57, Jake Kohne $21.87 → $40.67. Add a void case and verify the pool shrinks by exactly the voided stakes.

**Done when:** the numbers match Pat's hand-math for any user, including the void case.
