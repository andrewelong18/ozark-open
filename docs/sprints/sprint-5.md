# Sprint 5 — My Bets & Phase Compliance (Phase 4c)

> Part of the [Ozark Open roadmap](../ROADMAP.md). One sprint = one sitting; don't start while blockers are open.

**Goal:** participants always know where they stand against the rules; admins can spot stragglers.
**Target:** ~Aug 12 · **Blockers:** Sprint 4.

- [ ] "My Bets" view: current placements grouped by phase (bet title + pick + amount + snapshotted odds), running total, remaining budget.
- [ ] Personalized rules card: "Your entry: $40 · max single bet: $20 · max on yourself: $10 · 3 of 5 minimum picks this phase" — computed from the `tournaments` row; kills the questions Pat gets by text today.
- [ ] Pool total on the dashboard (sum of participant entry fees).
- [ ] Compliance banner per PRD §8.1: "incomplete" warning while under the 5-pick minimum or off the exact total ("Phase 2 must bring you to exactly $40").
- [ ] Admin compliance view (simple page or documented Studio SQL snippet): who is non-compliant per phase, so admins can chase before closing (Q3 — after the chase, whatever stands, stands).

**Done when:** the full Phase 4 definition-of-done holds — a participant can complete a betting phase without breaking any §7 rule, and knows it.
