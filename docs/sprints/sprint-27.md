# Sprint 27 — Admin save-state console

> Part of the [Ozark Open roadmap](../ROADMAP.md). **Post-freeze** (Andrew, Sept 7, 2026 — second dry run with Pat). **This sprint reverses a decision the snapshots migration states in capital letters**, and adds the first destructive button in the app. Read `supabase/migrations/20260813000000_snapshots.sql` and `scripts/restore-snapshot.ts` end to end before writing a line.

**Goal:** Pat can see every save state and roll back to one **from his phone**, instead of somebody finding a laptop with `psql` on it at 10pm on a Saturday.

**Target:** Sept 15, 2026 — before the tournament, not after. This is the safety net the other two sprints get to fall into · **Blockers:** none. Independent of 26 and 28.

**Reads:** `supabase/migrations/20260813000000_snapshots.sql` (the whole file — its header is the decision being overturned), `scripts/restore-snapshot.ts` (the transaction being ported, especially the `restoreSql` block), `lib/snapshots.ts`, `docs/DATA_SAFETY.md`, `supabase/migrations/20260902000001_placement_total_guard.sql` (the guard the restore stands down), `components/admin/import-form.tsx:22-65` (the button being extracted).

### Why this sprint

Pat's words:

> We should add a new page within Admin that is all about snapshots. It should list all of the most recent snapshots with a timestamp for each, ordered newest to oldest. It should include count of bet placements. There should be a button to restore any given snapshot in which it should execute the code to replace the current state with that snapshot save state. It should confirm I want to replace so that I don't fat finger it unintentionally.

Sprint 11 built the save states and deliberately stopped short of a UI:

> **KEEP IT BORING** (the sprint's own words): a snapshot is a JSON dump of whole tables; restore is a script an admin runs. **No restore UI**, no diffing, no partial rollback, no undo stack.

That was right when the restore was a developer's tool. It is wrong now: Sprint 23 spent a whole sprint on the premise that **Pat can run the tournament without database access**, and this is the one remaining hole in it — the tool for the single most likely tournament-weekend disaster (uploading last week's sheet, fat-fingering a cell) is the one tool he cannot reach.

- [x] **Migration: `snapshot_index()` and `restore_snapshot()`** ([#196](https://github.com/andrewelong18/ozark-open/issues/196)). Both `SECURITY DEFINER` with `SET search_path = ''` and the same internal admin gate `take_snapshot()` uses — `auth.uid() IS NOT NULL AND NOT public.is_admin()` raises `42501`, so a JWT-less direct connection (pg_cron, Studio, psql) still gets through by design. `REVOKE ALL … FROM PUBLIC, anon; GRANT EXECUTE … TO authenticated`. Also widen the `trigger` CHECK to admit `'pre-restore'`.
  - **`snapshot_index(p_limit)` is an RPC, not a PostgREST select**, for two reasons that are not stylistic: `jsonb_array_length` can't be expressed in a `select`, and `payload` is hundreds of KB per row, so counting client-side would ship megabytes to a phone. **The listing must never select `payload`.** It returns the five table counts (bet placements is the one Pat named), `pg_column_size(payload)`, `created_at` and `trigger`.
  - **`restore_snapshot(p_id)` is a faithful port of the script's `restoreSql`.** A plpgsql body is one implicit transaction, so it is atomic the way the script's explicit `BEGIN`/`COMMIT` is. Every line in that block has a reason and most were learned from a bug: `set_config('ozark.restoring', 'on', true)` stands down the entry-fee guard (a snapshot can legitimately hold an over-cap row from the very race that trigger prevents, and a guard that refused to put it back would break the undo button on exactly the disaster it exists for); `tournament_invites` is stashed in a temp table and put back, because it `CASCADE`s off `tournaments` and is **not in the payload** — the thing the Sprint 11 plan didn't anticipate; `jsonb_populate_recordset` on the way back means **no column is named anywhere**, so a future migration can't desync either end.
- [x] **A `pre-restore` snapshot, taken first, inside the same transaction.** The undo button gets its own undo. If the restore fails, everything rolls back and no stray snapshot is left behind; if it succeeds, the row survives (`public.snapshots` is not one of the five tables). **Watch the retention prune** — `take_snapshot()` deletes past `p_keep`, so pass a keep generous enough that it cannot evict the snapshot being restored.
- [x] **`/admin/snapshots` — the page.** `app/admin/snapshots/page.tsx` (`requireAdminPage()`, calls `snapshot_index()`, `LoadError` on failure — a list that renders empty because the read failed is indistinguishable from having no save states, which is #132's exact shape) plus `components/admin/snapshots-console.tsx`. Rows carry an absolute `America/Chicago` timestamp and a relative age (reuse `formatRelativeTime` / `formatTimestamp` from `lib/format.ts` — don't write a third one), the trigger, the bet-placement count with visual weight, and the rest quieter. Extract `SnapshotButton` from `components/admin/import-form.tsx` into its own component and use it on both pages. Add the sixth `ADMIN_PAGES` entry in `components/profile/profile-tabs.tsx:193` — that list is the only route into any admin page.
- [x] **The confirmation, per Andrew's call (Sept 7):** the panel shows the snapshot's age and what the save state holds vs. what the database holds now — the same `(N will be discarded)` / `(N will come back)` deltas the script prints — and a text input requiring the literal word `RESTORE` before the destructive button enables. Two things the copy must say plainly: **every wager placed since the snapshot is gone**, and **the `tournaments` row is restored too**, so a restore rewinds the phase clock and can un-post the leaderboard. Afterwards, print the manifest and the `pre-restore` id with the words "if this was a mistake, restore that one".
- [x] **`scripts/snapshot-restore-roundtrip.ts`, wired into `local-db-verify.sh`.** Seed → snapshot → mutate → restore through the RPC → assert all five tables match the save state, a `pre-restore` row exists, a non-admin JWT is refused with `42501`, and `tournament_invites` survived. **Prove that last check can fail** by deleting the invite stash and watching it go red — Sprint 11's invite check was vacuous for exactly this reason (it compared 0 to 0).
- [x] **Record the reversal** as PRD §12 **A21**, amend the migration's own "no restore UI" comment, and rewrite `docs/DATA_SAFETY.md` so the console is the primary undo path and the script is what works when the app is down. Note the known limit there too: `public.users` is not in the payload, so a restore after an account deletion would FK-violate and roll back cleanly. Accounts aren't deleted in practice — say so rather than widening the payload this close to the tournament.

**Done when:** `/admin/snapshots` lists save states newest-first with a bet-placement count on each; a restore takes a `pre-restore` snapshot, requires the typed word, and reports a manifest naming the snapshot you could undo it with; the new round trip passes inside `bash scripts/local-db-verify.sh` and has been proven able to fail; and `bash scripts/dry-run-verify.sh` still ends `$425 − $32 = $393` with 0 pending.

### Out of scope (don't build)

- **Diffing two snapshots, partial restore, an undo stack.** Boring stays boring — that part of Sprint 11's instruction is still right.
- **Retiring `scripts/restore-snapshot.ts`.** It is the path that works when the app itself is down, which is one of the two disasters this whole system exists for.
- **Changing the pg_cron schedule**, or moving scheduling back into the app. Keeping a service-role key out of the runtime is why it lives in the database.
- **Adding `users` to the snapshot payload.** Named as a limit above; widening the payload is a Sprint 11 decision to revisit outside a tournament week.

---

### Shipped — Sept 8, 2026

**Verified locally:** `npm test` 485 · `tsc --noEmit` · `lint` · `next build` ·
`bash scripts/local-db-verify.sh` end to end including the new 30-check round trip ·
`bash scripts/dry-run-verify.sh` end to end, pool unchanged at **$425 − $32 = $393** with 0
pending. `npm run test:e2e` unrun for want of Docker ([#172](https://github.com/andrewelong18/ozark-open/issues/172)) — no new specs were written, so nothing new is unexecuted.

**Proven able to fail**, which is the part that mattered — this project has been bitten twice
(Sprint 11's vacuous invite check, Sprint 26's fixture that couldn't distinguish its own axis).
Four sabotages, each run and each reverted:

| Sabotage | Went red |
|---|---|
| `tournament_invites` stash removed from `restore_snapshot()` | 2 checks — "the invites are still standing going into the restore", "tournament_invites came back — 2 before, 0 after" |
| `set_config('ozark.restoring', 'on', true)` removed | "an over-cap wager restores — the guard stood down" |
| `take_snapshot('pre-restore', NULL)` changed to keep=1 | "the snapshot it restored still exists" |
| `describeDelta`'s sign inverted | 2 of the 5 new unit tests |
| One `WHERE true` dropped from `restore_snapshot()` *(added Sept 11, 2026 — see the defect below)* | "no plpgsql/sql function in public holds a WHERE-less DELETE or UPDATE", naming the function and the statement |

**Three decisions taken during the build**, none of them in the plan as written:

1. **The invites are stashed as `jsonb`, not in a temp table** (#196 asked for a temp table). Under
   `SET search_path = ''` a temp table needs `pg_temp` qualification, and plpgsql plan caching
   makes a same-name temp table across two calls in one session a live hazard. The jsonb form also
   names **no column at all**, where the temp table still needs a `WHERE` on `tournament_id` — so
   it is *more* faithful to the property #196 is protecting, not less.
2. **The orphan-account pre-check is derived from `pg_constraint`**, not from a list of columns.
   The plan flagged "names three columns" as an accepted cost; deriving it removed the cost and
   covers a sixth FK to `users` automatically if one is ever added.
3. **The pre-restore snapshot passes a NULL keep** rather than a large one. `take_snapshot()`
   already treats null as "prune nothing", so the retention hazard is structurally impossible
   rather than merely unlikely. The payload is also read into a local before anything else, so
   nothing a future prune does can touch a restore in flight.

**PRD §12 A21 was already written** at scoping time (`dabfda9`) and read true against what
shipped; one clause was added naming the `public.users` limit that bounds the reversal.

**Docs the sprint invalidated and this series fixed**, beyond the three it named: `README.md`'s
"rolling back is one command" recipe, `DATA_MODEL.md`'s note that only the script sets
`ozark.restoring`, `CLAUDE.md`'s "the custom admin surface is five pages", and the import
report's "Undo this import" block, which printed a CLI command needing a laptop to an admin on a
phone.

**Residue:** [#204](https://github.com/andrewelong18/ozark-open/issues/204) (phone-browser pass on
`/admin/snapshots`) and [#205](https://github.com/andrewelong18/ozark-open/issues/205) — the policy
manifest has no coverage of function `EXECUTE` grants **at all**, which this sprint's two new
`SECURITY DEFINER` functions made worth naming: for several of them the `REVOKE … FROM anon` *is*
the whole boundary, and today nothing but a hand-written round-trip check would notice a bad
`GRANT`. ~~The prod migration is still to apply.~~ **It was applied** — the defect below proves
it, since the failing statement is the seventh in a function whose first six ran in production.

### Defect found in production — Sept 11, 2026

**The restore button was dead from the day it shipped.** Pat pressed **Restore this** on a
two-day-old save state and got `The restore did not happen: DELETE requires a WHERE clause`.
Nothing was lost — the body is one transaction, so it rolled back whole, `pre-restore` state
included — but for three days the app's only undo button had never worked, and every check in this
file was green.

`restore_snapshot()` cleared the five money tables with six unqualified `DELETE`s. Supabase
preloads **`pg-safeupdate`** on the `authenticator` LOGIN role that PostgREST connects as: a
`post_parse_analyze_hook` rejecting any `CMD_DELETE`/`CMD_UPDATE` whose `jointree->quals` is NULL.
It is a **parse-tree** check, it fires for statements **inside plpgsql**, and `SECURITY DEFINER`
does not bypass it — definer rights change the privilege context, not which libraries the session
loaded. Fixed by `20260911000000_restore_snapshot_where_clause.sql`: the same body with six
`WHERE true`, which the planner folds away and which names no column.

**The honest reading of this sprint's "Done when".** It was satisfied by a harness that is
structurally blind to the only difference that mattered. `scripts/snapshot-restore-roundtrip.ts`
was written *because* the RPC path "shares no code" with the script — and then reached it the same
way the script does, over `psql` as the database owner, imitating the role with
`SET ROLE authenticated`. `session_preload_libraries` resolves at **connect** time for the **login**
role, so `SET ROLE` never loads the extension. Thirty checks could not have caught this, and
"a faithful port of the script's transaction" was exactly the wrong thing to aim for on one line:
the port was faithful, and the original was only ever exercised as the database owner.

Two consequences, both taken:

1. **The blindness is now hazard 8 in that harness** — asserted against the *installed*
   `pg_proc.prosrc` rather than the migration files, since `20260908000000` still contains the bare
   deletes and migrations are immutable. A volatility assertion was drafted alongside it and then
   **removed**: the sabotage showed Postgres refuses `DELETE is not allowed in a non-volatile
   function` on a psql connection exactly as over PostgREST, so checks 3-7 already catch a
   volatility marker on the first restore. It would have been a check that only fires where
   another already has — counted, and guarding nothing. Establishing that by sabotage rather than
   assuming it either way is the same discipline as the rest of this table.
2. **`PRE_TOURNAMENT_CHECKLIST.md` now has a restore rehearsal** in *Week of*. The root cause
   underneath the SQL is that nobody had pressed the button in production. Restore is the only
   admin control with no other way to exercise it.

**Filed not fixed:** [#223](https://github.com/andrewelong18/ozark-open/issues/223) — the
*behavioural* version of hazard 8, which means loading `pg-safeupdate` into the verify cluster on a
real `authenticator` login role. It needs a PGDG package that is not in the Ubuntu archive, so it
would make the CI `database` job depend on a third-party apt repo, and a "skip if missing" variant
is worse than nothing here. [#222](https://github.com/andrewelong18/ozark-open/issues/222) carries
the prod application, which the authoring session could not do (no `SUPABASE_ACCESS_TOKEN`).

**No new PRD §12 entry.** A21 still describes the intended design correctly; this was a defect in
its implementation, not a decision. Had the fix been `TRUNCATE` or disabling `safeupdate`
role-wide, it would have needed one — the migration header says so, so the next person can see why
it didn't.
