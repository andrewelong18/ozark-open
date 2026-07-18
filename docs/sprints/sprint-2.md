# Sprint 2 — Spreadsheet Ingestion (`/admin/import`)

> Part of the [Ozark Open roadmap](../ROADMAP.md). One sprint = one sitting; don't start while blockers are open.

**Goal:** admins publish and update the entire menu — bets, picks, odds, statuses, results — by uploading the spreadsheet. The one custom admin page (ADR 0001 §7).
**Reads:** PRD §8.2 · DATA_MODEL §3.5–3.6 · ADR 0001 §§7–8, 11.
**Target:** ~Jul 31 · **Blockers:** Sprint 1.

- [x] `/admin/import` page + API route, gated on `is_admin`; accepts `.xlsx` and `.csv`.
- [x] Parser + column-contract validation (the 13 PRD §8.2 columns; helper columns ignored; unsorted rows fine; enum values checked for `status`/`round`/`category`/`result`; duplicate `bet_id`/`pick_id` detection). A file with contract errors is rejected whole — no partial imports.
- [x] Upsert: bets keyed on (`tournament_id`, `sheet_bet_id`), picks on (`bet_id`, `sheet_pick_id`). Uploads never touch `bet_placements`.
- [x] Pick→player name-matching: strip stroke suffixes (`(E)`, `(-5)`), match against `users.display_name`, set `player_user_id`; leave NULL when unmatched.
- [x] Import report: bets/picks created vs. updated, unmatched pick names, and a warning when a pick's odds changed while it has live placements (wire fully once placements exist in Sprint 3; harmless per PRD §7.1 but the admin should know).
- [x] Round-trip test: upload `bets-sample.xlsx` → DB matches the sheet; upload it again → report shows zero changes (idempotent). *(Verified Jul 17, 2026 on a local Postgres via `scripts/import-roundtrip.ts`, importing over the Phase 1 seed: 6 bets / 30 picks created, 13/57 seeded rows unchanged, re-import zero changes.)*

**Done when:** an admin uploads the sample sheet twice from the browser — first upload creates the full menu, second reports no changes — and `/bets` reflects it without a redeploy.
**Status (Jul 18, 2026): code complete, round-trip verified locally; prod SQL applied Jul 18, 2026 (#12 — migration + seed, 13 bets / 57 picks). The in-browser Done when is pending** the browser upload test (#19) — nothing blocks it on the database side now; #15 (admin flags) is partial (only Andrew so far, which is enough to run it).
