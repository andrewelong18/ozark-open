# Sprint 5 — My Bets & Phase Compliance (Phase 4c)

> Part of the [Ozark Open roadmap](../ROADMAP.md). One sprint = one sitting; don't start while blockers are open.

**Goal:** participants always know where they stand against the rules; admins can spot stragglers.
**Target:** ~Aug 12 · **Blockers:** Sprint 4.

- [x] "My Bets" view: current placements grouped by phase (bet title + pick + amount + snapshotted odds), running total, remaining budget.
- [x] Personalized rules card: "Your entry: $40 · max single bet: $20 · max on yourself: $10 · 3 of 5 minimum picks this phase" — computed from the `tournaments` row; kills the questions Pat gets by text today. (Non-players get no "max on yourself" line — Q14.)
- [x] Pool total on the dashboard (sum of participant entry fees). (Shipped as the dashboard rework closing #23: renamed rule columns, placements joined through `bet_picks`, caps via `maxSingleBet`/`maxSelfBet`.)
- [x] Compliance banner per PRD §8.1: "incomplete" warning while under the 5-pick minimum or off the exact total ("Phase 2 must bring you to exactly $40"). (On My Bets and the dashboard, assembled from `checkPhaseMinimums`/`checkTournamentTotal` — never blocking, Q3.)
- [x] Admin compliance view (simple page or documented Studio SQL snippet): who is non-compliant per phase, so admins can chase before closing (Q3 — after the chase, whatever stands, stands). (Took the SQL-snippet option — `docs/admin/phase-compliance.sql`, linked from the README's admin workflow — since `/admin/import` stays the only custom admin UI.)

**Done when:** the full Phase 4 definition-of-done holds — a participant can complete a betting phase without breaking any §7 rule, and knows it.

> **Status (Jul 17, 2026): code complete, verified locally** — unit tests (`npm run test`, incl. the new `lib/my-bets.test.ts`), `npm run build`, `npm run lint`. The in-browser half of "Done when" (the Phase 4 definition-of-done against live Supabase) is **pending only the browser passes** — the prod SQL chain landed Jul 18, 2026 (#12/#22); the sequence is now #24 (Sprint 4 browser verify) → #26 ("Sprint 5: verify My Bets & compliance end-to-end in the prod browser").
