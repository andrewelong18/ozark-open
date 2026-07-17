# Sprint 3 — Placements Schema & Validation (Phase 4a)

> Part of the [Ozark Open roadmap](../ROADMAP.md). One sprint = one sitting; don't start while blockers are open.

**Goal:** the `bet_placements` table exists with correct RLS, and every §7 rule is encoded server-side.
**Reads:** PRD §7, §8.1 · DATA_MODEL §3.7.
**Target:** early Aug · **Blockers:** Sprint 1 (schema); do after Sprint 2 so testing has real menu data.

- [x] Migration: `bet_placements` per DATA_MODEL §3.7 — `pick_id` FK, `odds_at_placement int NOT NULL` (snapshot of the **pick's** odds — PRD §7.1), `requires_admin_review boolean NOT NULL DEFAULT false`, `deleted_at timestamptz` (soft delete), UNIQUE (`user_id`, `pick_id`).
- [x] RLS: users insert/update/soft-delete own rows while the parent bet is `open`; others' placements visible only once the bet is `closed`; admins read all; all reads filter `deleted_at IS NULL`. *(Two deliberate deviations from the last clause, discovered under test: the **own-rows** read can't filter `deleted_at` — Postgres checks an UPDATE's new row against SELECT policies, so the filter rejects the soft delete itself and hides the row from the revive path — and the **admin** read includes soft-deleted rows since that history exists for dispute resolution (§3.7). Other users never see soft-deleted rows; own/admin app queries filter in code.)*
- [x] `lib/validation.ts`: pure functions for every rule in PRD §7 + §8.1, parameterized by the `tournaments` row (no hardcoded limits): whole dollars ≥ $1; single-bet cap per placement; 5–10 **pick-placements per phase** (each wagered pick counts); running total across both phases ≤ entry fee (exact-equal checked at Phase 2 close); self-pick cap across the tournament; **one pick per Match/Group Match** (`allows_multiple_picks`); **opponent hard-block** (bettor is a `player_user_id` in the bet but places on a different pick).
- [x] Unit-test the validation functions against the worked examples in PRD §5/§7 ($40-entry and $20-entry cases, multi-pick counting, opponent rejection).

**Done when:** validation tests pass and the migration applies cleanly to prod.
**Status (Jul 17, 2026): code complete — the prod half of "Done when" is pending.** All 32 validation tests pass (`npm run test`). The migration applies cleanly on the full local migration chain (throwaway Postgres 16, all five migrations in order, Sprint 2 round-trip harness still green on top), and an RLS smoke test verified constraints, the `updated_at` trigger, soft delete/revive, closed-bet visibility, and admin reads per-user. Applying the migration to prod is manual (no Supabase creds here) and must run **after** #12's rework SQL — tracked in its own issue.
