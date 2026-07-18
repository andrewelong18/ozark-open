# Sprint 11 — Bet-State Snapshots & Rollback (Bonus)

> Part of the [Ozark Open roadmap](../ROADMAP.md). **Bonus wish-list sprint (added Jul 18, 2026)** — an enhancement, never an MVP blocker. Work it only when no MVP sprint (0–9) is waiting; Sprint 9's manual `pg_dump`/CSV export stays the MVP data-safety floor regardless.

**Goal:** automatic point-in-time save states of the money data, so a bad import or fat-fingered Studio edit is rolled back instead of reconstructed by hand.
**Target:** as time allows before the Aug 28 freeze — most valuable if live during the tournament itself · **Blockers:** Sprint 3's placements schema applied in prod (done Jul 18, 2026). Vercel Cron setup is a dashboard step — file it as an issue when shipping, per the sprint workflow.

**Reads:** `DATA_MODEL.md` §2 (which tables hold money state), `README.md` (admin workflow, where the restore runbook lands).

**Keep it boring:** snapshots are JSON dumps of whole tables; restore is a script an admin runs. No restore UI, no diffing, no partial rollback.

- [ ] Migration: `snapshots` table — `id`, `created_at`, `trigger` (`'cron' | 'manual' | 'pre-import'`), `payload jsonb`. Payload is a full dump of `bets`, `bet_picks`, `bet_placements` (including soft-deleted rows), `tournaments`, and `tournament_participants`. Admin-only RLS, all operations.
- [ ] Snapshot function + admin-gated API route that writes one. Wire a manual **"Snapshot now"** button into `/admin/import`, and take one **automatically before every import applies** — that's the riskiest moment.
- [ ] Scheduled snapshots: Vercel Cron hitting the route. The interval is Andrew's call and lives in config (the cron schedule / an env var), so changing it is a dashboard edit, not a deploy.
- [ ] Retention: keep the last N (env var, generous default — jsonb dumps of a 32-person pool are tiny; pruning is one delete at snapshot time).
- [ ] `scripts/restore-snapshot.ts`: given a snapshot id, restores those five tables in one transaction (truncate + reinsert). Add a short runbook to `README.md`: when to use it, and that it **overwrites current state** with the save state.
- [ ] Verify: take a snapshot → deliberately mangle a bet and a placement in Studio → restore → state matches the snapshot exactly.

**Done when:** snapshots accrue on schedule and before every import, and a deliberate bad edit is fully reversed by running the restore script with a snapshot id.
