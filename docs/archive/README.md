# Archive

Point-in-time exports of the bet menu, in the 13-column upload contract of
`docs/PRD.md` §8.2 — so any of them can be fed straight back through
`/admin/import` without touching the database.

These are **not** a substitute for either safety net in `docs/DATA_SAFETY.md`.
Snapshots (the undo button) and `scripts/db-export.sh` (the fire escape) both
restore *all five money tables together*, which is the wrong tool once wagers
exist: rolling back to recover a deleted bet would also roll back every
placement made since. A sheet here is the non-destructive way back to bets that
were cleared — re-upload it, and the importer upserts by `bet_id`/`pick_id`.

| File | What it holds |
|---|---|
| `2026-09-11-bets-before-phase1-refresh.csv` | The 19 bets / 85 picks in place before the Phase 1 menu was cleared and reloaded from Andrew's Sept 11 spreadsheet. Bets 1–7 were Phase 1 open (carrying test picks 30–43 that the reload dropped); 8–13 were hidden Phase 1 prop bets; 14–19 were the staged Phase 2 menu. Snapshot `492605f1-b524-44d8-9836-de141ef37124` covers the same moment. |

**Since Sprint 29 this is the documented way back from a sweep.** An upload now
deletes the bets and picks its sheet no longer lists (PRD §8.2, §12 A24), so
exporting the menu here before a big refresh is the cheap insurance: a snapshot
restore would also roll back every wager placed since, and a sheet here will not.
The exception is a bet whose wagers were *cleared* — a re-upload brings the bet
and its picks back, but the placements are gone and only a snapshot restore has
them.

To restore part of one, delete the rows you don't want and upload the rest.
Watch the `status` column: re-uploading `Hidden` rows republishes them hidden,
which is usually what you want for a staged phase.
