# Sprint 1 — Bet/Pick Schema Rework & Menu Rebuild (Phase 3 rework)

> Part of the [Ozark Open roadmap](../ROADMAP.md). One sprint = one sitting; don't start while blockers are open.

**Goal:** the database and `/bets` page match ADR 0001 — bets have picks, and the menu renders the sample sheet's Phase 1 faithfully.
**Reads:** PRD §6, §8 · `DATA_MODEL.md` §3.4–3.6 · ADR 0001.
**Target:** ~Jul 24 · **Blockers:** Sprint 0.

- [x] Migration (clean rebuild — no production bet data exists): rework `bets` to the new shape (`sheet_bet_id`, `title`, `phase`, `round`, `status` hidden/open/closed, `total_probability`; drop `american_odds`/`outcome`/`bet_number`); create `bet_picks` per DATA_MODEL §3.6; drop `bet_subjects`; re-seed `bet_categories` with the five categories (`allows_multiple_picks` flags); rename `tournaments.min/max_bets_per_round` → `min/max_picks_per_phase`; drop the hardcoded `entry_fee BETWEEN 20 AND 50` CHECK (keep `> 0`); RLS per DATA_MODEL §5 (picks readable when parent bet not hidden). — `20260717000000_bet_pick_rework.sql`; applied cleanly on a scratch Postgres (all four migrations in order, RLS hidden-bet gating verified). **Applied in the prod SQL editor Jul 18, 2026 (#12).**
- [x] Rebuild `/bets`: group **phase → round → category**, bet cards showing title + `total_probability`, pick rows showing label / american / fractional / probability **verbatim from the DB** (sheet-supplied — delete the `lib/odds.ts` display converters); `hidden` bets excluded; pick result badge rendered **only when result ≠ `pending`**. — new `PickRow` component; `lib/odds.ts` and the old `BetRow` deleted; style guide updated.
- [x] Hand-seed the Phase 1 menu from `docs/import/bets-sample.xlsx` (SQL insert or Studio; the automated importer is Sprint 2) and link picks to the seeded users' `player_user_id` where names match. — `supabase/seed-sample-phase1.sql`, generated verbatim from the sheet (13 bets / 57 picks), idempotent, with a re-runnable name-match link `UPDATE` (most players haven't logged in yet — see the follow-up issue). **Applied in the prod SQL editor Jul 18, 2026 (#12 — 13 bets / 57 picks confirmed).**
- [ ] `npm run build` + verify on prod. — build + lint pass Jul 17; PR merged + prod SQL applied Jul 18, 2026 (#12 — 13 bets/57 picks confirmed) — `/bets` render verify pending (#31).

**Done when:** the sample sheet's Phase 1 (13 bets, 57 picks) renders on `/bets` in production, grouped phase → round → category, with odds displayed exactly as the sheet formats them.
