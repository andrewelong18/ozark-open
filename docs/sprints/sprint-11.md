# Sprint 11 — Bet-State Snapshots & Rollback (Bonus)

> Part of the [Ozark Open roadmap](../ROADMAP.md). **Bonus wish-list sprint (added Jul 18, 2026)** — an enhancement, never an MVP blocker. Work it only when no MVP sprint (0–9) is waiting; Sprint 9's manual `pg_dump`/CSV export stays the MVP data-safety floor regardless.

**Goal:** automatic point-in-time save states of the money data, so a bad import or fat-fingered Studio edit is rolled back instead of reconstructed by hand.
**Target:** as time allows before the Aug 28 freeze — most valuable if live during the tournament itself · **Blockers:** Sprint 3's placements schema applied in prod (done Jul 18, 2026). Vercel Cron setup is a dashboard step — file it as an issue when shipping, per the sprint workflow.

**Reads:** `DATA_MODEL.md` §2 (which tables hold money state), `README.md` (admin workflow, where the restore runbook lands).

**Keep it boring:** snapshots are JSON dumps of whole tables; restore is a script an admin runs. No restore UI, no diffing, no partial rollback.

- [x] Migration: `snapshots` table — `id`, `created_at`, `trigger` (`'cron' | 'manual' | 'pre-import'`), `payload jsonb`. Payload is a full dump of `bets`, `bet_picks`, `bet_placements` (including soft-deleted rows), `tournaments`, and `tournament_participants`. Admin-only RLS, all operations. *(`supabase/migrations/20260813000000_snapshots.sql`. Payload uses `to_jsonb(t)` rather than a column list, so a later migration is captured automatically instead of producing snapshots that restore to an older shape.)*
- [x] Snapshot function + admin-gated API route that writes one. Wire a manual **"Snapshot now"** button into `/admin/import`, and take one **automatically before every import applies** — that's the riskiest moment. *(`public.take_snapshot()`, `app/api/admin/snapshot/route.ts`, `lib/snapshots.ts` as the one shared path. The pre-import snapshot sits after the contract check and before the first write; **a snapshot failure aborts the import** rather than running it without a net, and the import report prints the id as a ready-to-paste undo command.)*
- [x] ~~Scheduled snapshots: Vercel Cron hitting the route.~~ **Amended Aug 9, 2026 (Andrew): Supabase pg_cron, not Vercel Cron.** The interval still lives in config, so changing it is a dashboard edit and not a deploy — the checkbox's actual requirement is unchanged. *Why:* a Vercel Cron request carries no user session, so the route would have needed a `CRON_SECRET` **and** a `SUPABASE_SERVICE_ROLE_KEY` — the first service-role key this project has ever held, introduced for a nightly backup. pg_cron runs inside the database, where the job is already trusted, and `take_snapshot`'s gate admits a caller with no JWT for exactly that reason. Enabling the extension is a dashboard step, so the `cron.schedule` call ships as a commented block at the foot of the migration and as [#141](https://github.com/andrewelong18/ozark-open/issues/141).
- [x] Retention: keep the last N (env var, generous default — jsonb dumps of a 32-person pool are tiny; pruning is one delete at snapshot time). *(`SNAPSHOT_RETENTION`, default 50, pruned inside `take_snapshot()`. `snapshotRetention()` is pure and unit-tested: an unset, empty, non-numeric, zero or negative value all fall back rather than reaching the database, where a zero would ask it to prune everything including the row just written.)*
- [x] `scripts/restore-snapshot.ts`: given a snapshot id, restores those five tables in one transaction (~~truncate~~ **delete** + reinsert). Add a short runbook to `README.md`: when to use it, and that it **overwrites current state** with the save state. *(Delete-and-reinsert, not truncate — `tournament_invites` has an `ON DELETE CASCADE` to `tournaments` and is not in the payload, so a truncate would destroy the hand-typed expected roster as a side effect of rolling back a bad bet import. `jsonb_populate_recordset` means no column is named anywhere in the script. Refuses without `--yes`, prints how much is about to be discarded, and finishes with a self-verifying manifest in `db-export.sh`'s shape. Runbook in `README.md` §"Recipe: undo a bad import or a bad edit" and in full in `docs/DATA_SAFETY.md`.)*
- [x] Verify: take a snapshot → deliberately mangle a bet and a placement in ~~Studio~~ **a throwaway cluster** → restore → state matches the snapshot exactly. *(`scripts/snapshot-roundtrip.ts`, run by `scripts/local-db-verify.sh` on every invocation — 19 checks, all green. Mangles six things: retitles and reopens a bet, reprices a pick and marks it hit, edits a stake, soft-deletes a live wager, invents a phantom pick, moves an entry fee. The assertion is an **md5 over all five tables**, not a per-row spot check — a restore that fixed the visible damage while dropping a soft-deleted placement would pass the latter. Run on a cluster rather than by hand in Studio so the answer stays true instead of being true once in August.)*

**Done when:** snapshots accrue on schedule and before every import, and a deliberate bad edit is fully reversed by running the restore script with a snapshot id.
→ **Met Aug 9, 2026,** with one caveat named honestly: the *before every import* and *on demand*
halves are proven end to end (`POST /api/admin/import` returns 200 against a real Supabase stack
in `npm run test:e2e`, which it could not do if the snapshot had failed), and the restore is
proven by `snapshot-roundtrip.ts`. The **on schedule** half is code-complete and cannot be
demonstrated from this environment: pg_cron is a hosted-Supabase extension and there are no prod
credentials here. It is one dashboard action, written out verbatim in
[#141](https://github.com/andrewelong18/ozark-open/issues/141).

Baseline held throughout: `npm test` 351 (345 + 6 new) · `tsc` clean · `build` clean · `lint` one
known warning (#129) · `local-db-verify` green including the new round trip · `sim-pool-verify`
reconciles · `dry-run-verify` end to end at $425 − $32 = $393, 0 pending, 56 picks linked ·
`test:e2e` 37 passed / 3 skipped.

**Not done, deliberately:** the prod migration ([#142](https://github.com/andrewelong18/ozark-open/issues/142))
— no `SUPABASE_ACCESS_TOKEN` and no database password in this environment.
