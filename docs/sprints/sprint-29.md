# Sprint 29 — The upload deletes what its sheet dropped

> Part of the [Ozark Open roadmap](../ROADMAP.md). **Post-freeze** (Andrew, Sept 12, 2026 — from Pat, the day after the Sept 11 Phase 1 refresh). **Write no new payout math and add no new admin page.** This is the import's missing half, built inside `/admin/import`.

**Goal:** the sheet becomes the menu in both directions. A bet that drops out of the spreadsheet is deleted rather than left live forever — after a human has read what is about to go.

**Target:** Sept 15, 2026 · **Blockers:** none. Sprint 11's pre-import snapshot is the net this one falls into, and it has been live since August.

**Reads:** `lib/import.ts` (`buildImportPlan` — the additive planner this sits beside), `app/api/admin/import/route.ts`, `components/admin/import-form.tsx`, `supabase/migrations/20260717000001_bet_placements.sql` (the FK that shapes the whole design), `supabase/migrations/20260813000000_snapshots.sql` + `20260908000000_snapshot_console.sql`, `docs/PRD.md` §8.2 + §10 + §12 A24, `docs/adr/0001-bet-pick-architecture.md` §7a.

### Why this sprint

Pat, Sept 11, 2026:

> It might be helpful that anytime I upload a sheet it should delete all bets that aren't in the sheet being uploaded. It can warn me that I am about to delete some bets.

`buildImportPlan()` upserts by `bet_id`/`pick_id` and has no concept of a row the sheet stopped mentioning. A Phase 1 refresh that day left 19 stale bets live on the menu — test picks 30–43 among them — and clearing them needed database access plus an archived CSV as the way back (`docs/archive/`). There was no path in the app at all.

### The four calls

Recorded in full in PRD §12 **A24**; in short:

1. **Scope is the phases the sheet mentions**, not the whole tournament. Narrower than Pat's literal words, deliberately: a phase-2 staging sheet uploaded on a phone at 10pm would otherwise offer to delete Phase 1.
2. **Picks are swept too**, not only whole bets — a player dropped from a surviving bet's slate is the same defect one level down.
3. **Rows carrying wagers are kept by default**, listed with their bettors, and cleared only on a separate control.
4. **Clearing hard-deletes the placements**, which reverses PRD §8.2 and §10. The `pre-import` snapshot is the audit trail, and `scripts/import-roundtrip.ts` proves the round trip rather than asserting it.

### Tasks

- [x] `planSweep()` in `lib/import.ts` — phase-scoped, bets and picks, clean/wagered split, fingerprint. 11 unit tests; the phase guard and the wagered split each verified by sabotage.
- [x] `supabase/migrations/20260912000001_import_sweep.sql` — `sweep_bets()`, one transaction, `is_admin()` gate, finalized-tournament refusal, a by-name refusal when wagers are in the way. Both manifests regenerated.
- [x] Two-pass `POST /api/admin/import` — 409 `needsConfirmation` before the snapshot, fingerprint check on the confirm, sweep after the upserts, `swept` / `keptWagered` in the report.
- [x] The confirm panel in `components/admin/import-form.tsx` — two tiers that never share a control, the bettor chase list, and "Import without deleting" as the escape.
- [x] `scripts/import-roundtrip.ts` — the sweep, the FK refusal, the explicit clear, and the snapshot restore bringing bet and wager back.
- [x] Docs: PRD §8.2 / §10 / A24, ADR 0001 §7a, `DATA_MODEL.md` §3.7 + §4.2 + §5, `CLAUDE.md`, `PRE_TOURNAMENT_CHECKLIST.md`, `docs/archive/README.md`.

**Done when:** uploading a sheet with a bet removed stops and names that bet before writing anything; confirming deletes it and its picks; a bet carrying wagers is listed separately, kept by default, and deleted only on its own tap along with its placements; a phase-1 sheet never offers to delete a phase-2 bet; restoring the `pre-import` save state brings a swept bet **and its wagers** back; the reference sheet and every checked-in lifecycle sheet sweep **nothing**; and `npm test` (539) · `tsc` · `npm run build` · `scripts/local-db-verify.sh` · `scripts/dry-run-verify.sh` all pass with the pool unchanged at $393.

### As built (Sept 12, 2026)

Three things worth recording beyond the plan:

1. **The two-pass handshake takes the client's word for exactly one thing** — the fingerprint, whose only job is to prove the menu hasn't moved since the list was drawn. Everything else is recomputed from the re-uploaded file server-side, so an edited request can widen nothing.
2. **Ordering is load-bearing in three places.** The placement read asks for *every* row including soft-deleted ones, because `deleted_at` doesn't release the FK and a live-only read would build a delete set the database refuses. A failed placement read skips the sweep and says so rather than proceeding as though there were no wagers. And the sweep runs *after* the upserts, so a failed sweep leaves a correct menu with rows that should have gone, rather than a menu with holes in it.
3. **The weekend's own sheets are asserted to sweep nothing**, on every upload in `scripts/dry-run-verify.sh`, because a checked-in lifecycle sheet that started sweeping would mean the real weekend was about to lose a menu. All five pass, and the check was proven able to fail (force every bet into the delete set: all five go red). Worth stating precisely what that does **not** prove: removing the phase-scope guard entirely leaves those five checks green, because each lifecycle sheet carries every phase then in the database. Phase scoping is exercised by the unit tests and `scripts/import-roundtrip.ts`, not by the dry run.
4. **The grants manifest also picked up pre-existing drift** — `apply_player_profile_seed()`, added Sept 9 in 2aff293 without regeneration. It is a `SECURITY DEFINER` trigger function on the default `PUBLIC` ACL, the same shape as `handle_new_user()` and `guard_users_self_update()` already in the manifest, so this records existing state rather than a new grant. Filed for review alongside #213.

**Residue:** the prod migration ([#229](https://github.com/andrewelong18/ozark-open/issues/229) — no `SUPABASE_ACCESS_TOKEN` in the build session), the phone-browser pass on the confirm panel ([#230](https://github.com/andrewelong18/ozark-open/issues/230)), and the missing E2E spec for the two-pass handshake ([#231](https://github.com/andrewelong18/ozark-open/issues/231)). The manifest drift noted above is [#232](https://github.com/andrewelong18/ozark-open/issues/232).
