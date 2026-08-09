# Data Safety — backing up the tournament database

**The free Supabase tier has no automated backups.** There is no daily snapshot, no
point-in-time recovery, and no support ticket that gets your data back. What's in that database is
32 people's entry fees, every wager they placed, and every result Pat uploaded — money data, with a
Venmo settlement hanging off it.

So the backup is a thing a human runs, at two named moments, and Sprint 9 made it one command.

- **Script:** [`scripts/db-export.sh`](../scripts/db-export.sh)
- **When:** the two moments below. They're steps in
  [`PRE_TOURNAMENT_CHECKLIST.md`](PRE_TOURNAMENT_CHECKLIST.md), not something to remember.

---

## Two tools, two different disasters

Sprint 11 added **snapshots** on top of this. They are not a replacement — they answer a
different question, and reaching for the wrong one wastes the minutes you don't have.

| | The export (Sprint 9) | Snapshots (Sprint 11) |
|---|---|---|
| **Answers** | "The database is gone / corrupt / I need the permanent record." | "The last thing I did was wrong. Put it back." |
| **Covers** | Everything: schema, all tables, the payout view, best-effort accounts. | Five money tables — `tournaments`, `tournament_participants`, `bets`, `bet_picks`, `bet_placements`. |
| **Taken by** | A human, at two named moments. | The app: automatically before **every** import, on a schedule, and on demand from the **Snapshot now** button on `/admin/import`. |
| **Lives** | A folder on your laptop (and wherever you copied it). | A row in the database. |
| **Restore** | `pg_restore` into an empty schema — minutes, and a decision. | `scripts/restore-snapshot.ts <id> --yes` — seconds. |
| **Survives** | The project being deleted. | Nothing that takes the database with it. |

The short version: **snapshots are the undo button, the export is the fire escape.** Snapshots
live in the same database they protect, so they are worthless in exactly the scenario the
export exists for. Keep running the export.

Snapshots are covered in full below, under [Rolling back a bad edit](#rolling-back-a-bad-edit).

---

## The two moments

| When | Label to use | Why this moment |
|---|---|---|
| **Before Phase 1 opens** — the week of, once the menu is uploaded and everyone is approved | `before-phase-1` | The last instant the state is pure setup. If anything goes wrong during the weekend, this is the floor you rebuild from: the roster, the fees, the whole menu, and no wagers to reconcile. |
| **After final payouts** — Saturday night, once `/results` is published | `after-payouts` | The permanent record. Every wager, every result, every payout, frozen. This is the one you keep. |

Exporting more often than that is free and harmless. Between the two, a quick
`bash scripts/db-export.sh "$SUPABASE_DB_URL" thursday-night` after each results upload costs
seconds and buys back a whole round.

---

## Running it

```bash
# Against production
bash scripts/db-export.sh "$SUPABASE_DB_URL" before-phase-1

# Against the local stack (no argument needed — it reads `supabase status`)
bash scripts/db-export.sh
```

**Where the connection string comes from:** Supabase dashboard → your project → *Project Settings*
→ *Database* → *Connection string* → **URI**. It contains the database password, which is
**not** the same as `SUPABASE_ACCESS_TOKEN` or the service-role key and is not in `.env.local`. If
you never wrote it down, reset it on that same page — resetting the database password doesn't sign
anybody out, because members authenticate by magic link, not by that password.

The script never prints the connection string back. It carries the password, and script output ends
up pasted into issues and chat.

### What lands on disk

`backups/<label>-<UTC timestamp>/`, which is gitignored — **money data never gets committed.**

| File | What it is |
|---|---|
| `full.dump` | `pg_dump -Fc` of the `public` schema. The restore path. |
| `schema.sql` | The same schema in plain SQL — readable, diffable, no data. |
| `auth-users.sql` | The accounts, best-effort (see *What this doesn't cover*). |
| `csv/*.csv` | One file per table, plus `placement_payouts_view`. Opens in Excel. Restorable by hand. |
| `MANIFEST.txt` | Row counts **and** the pool reconciliation. |

**`snapshots.csv` is the one exception: metadata only** — `id`, `created_at`, `trigger` and
`payload_bytes`, not the payloads themselves. Each payload is a JSON dump of every other table
on the list, so a CSV of them would have multi-megabyte cells and no spreadsheet would open it
— which defeats the entire reason the CSVs exist. Nothing is lost: the payloads are historical
copies of state this export already captures in its own right, and `full.dump` carries them
intact for the case where you actually want to roll one back.

The CSVs are deliberate redundancy. A custom-format dump is only as good as the `pg_restore` that
can read it, and this data needs to outlive any particular tool — a year from now the question
"what did Dan actually win" should be answerable by opening a file.

---

## Verifying the export — read the manifest

A backup nobody opened is a folder, not a backup. `MANIFEST.txt` exists so that checking takes
fifteen seconds:

```
Row counts
  users                    32
  tournaments               1
  tournament_participants  32
  bets                     13
  bet_picks                57
  bet_placements          256

Pool reconciliation (per tournament)
      name       |  status   | entry_fees | voided_stakes | pool | wagered | live_placements | pending_picks
-----------------+-----------+------------+---------------+------+---------+-----------------+---------------
 Ozark Open 2026 | completed |        425 |            32 |  393 |     425 |             256 |             0
```

Three things to look at, in order:

1. **`pool` is `entry_fees − voided_stakes`** — the same arithmetic `/results` and
   `scripts/sim-pool-verify.sh` run. If it doesn't match what you expect the pool to be, the problem
   is in the database, not in the backup, and you have just caught it early.
2. **`pending_picks` is 0** after the final results upload. Anything else means a result never
   landed, and publishing against it inflates every payout (PRD §8.1 / #108).
3. **The row counts look like a tournament**, not like an empty database.

The script refuses to finish — non-zero exit, loud message — if `users`, `tournaments`, `bets` or
`bet_picks` came back empty. An export that silently captured nothing is worse than no export at
all: it's a false sense of safety with a timestamp on it.

**Then copy the folder off the machine.** Google Drive, iCloud, a Dropbox folder, an email to
yourself — anywhere that isn't the laptop you're about to be troubleshooting on. A backup that lives
only on the box you're about to break is not a backup.

---

## Restoring

Into a Supabase project (the normal case — the `auth` schema is already there):

```bash
# Wipe and rebuild the public schema from the dump.
psql "$SUPABASE_DB_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
pg_restore --no-owner -d "$SUPABASE_DB_URL" backups/<folder>/full.dump
```

`--no-owner` matters: the dump records Supabase's role names, and a restore that insists on them
fails on a project whose roles were created separately.

**Rehearsed, not assumed:** the dump-then-restore round trip was run against PostgreSQL 16 during
Sprint 9 and brought back all 13 bets and 57 picks intact.

### If you only have the CSVs

Restore them in the order the files are listed in `MANIFEST.txt` — it's parent-first, so the foreign
keys hold as you go:

```bash
psql "$URL" -c "\copy public.users FROM 'csv/users.csv' WITH (FORMAT csv, HEADER true)"
# …then tournaments, tournament_participants, tournament_invites,
#    bet_categories, bets, bet_picks, bet_placements
```

`placement_payouts_view.csv` is derived — don't restore it, it rebuilds itself from the tables.

---

## Rolling back a bad edit

The likely disaster of a tournament weekend isn't the database vanishing — it's uploading last
week's sheet, or fat-fingering one cell in Studio at 10pm. Sprint 11 exists for that, and the
recovery is one command instead of an evening of reconstruction.

### What a snapshot is

A row in `public.snapshots`: a timestamp, why it was taken, and a `jsonb` payload holding every
row of `tournaments`, `tournament_participants`, `bets`, `bet_picks` and `bet_placements` —
**including soft-deleted wagers**, because a removed bet is part of the state being saved.
Admin-only at the database, since a payload contains wagers on bets that are still open.

They accrue three ways, and you don't have to do anything for any of them:

- **Before every import.** `/admin/import` takes one before a single row moves. If the snapshot
  fails, the import is refused rather than run without a net.
- **On a schedule**, via Supabase pg_cron (see below).
- **On demand** — the **Snapshot now** button on `/admin/import`. Use it before editing
  anything by hand.

### Rolling one back

```bash
# What can I go back to?
node --experimental-strip-types scripts/restore-snapshot.ts --list

# Go back to one. The id is printed by the import report and the Snapshot now button.
node --experimental-strip-types scripts/restore-snapshot.ts <id> "$SUPABASE_DB_URL" --yes
```

**This overwrites current state.** Everything written to those five tables since the snapshot
was taken is discarded — *including wagers people placed in the meantime*. On a Friday
afternoon that could be real money someone typed in. The script prints how old the snapshot is
and how many rows it's about to discard before it does anything, and it refuses to run without
`--yes`. Read those numbers.

What it does **not** touch: accounts, the invite list, avatars, or the bet categories. Rolling
back a bad bet import never costs you the roster.

### Checking it worked

Same discipline as the export manifest — the restore prints one, and exits non-zero if the
numbers disagree:

```
Row counts (restored vs the save state)
  ✓ tournaments                  1
  ✓ tournament_participants     14
  ✓ bets                        19
  ✓ bet_picks                   87
  ✓ bet_placements              56

Pool reconciliation (per tournament)
      name       | status | entry_fees | voided_stakes | pool | pending_picks
-----------------+--------+------------+---------------+------+---------------
 Ozark Open 2026 | active |        425 |            32 |  393 |             0
```

If the pool isn't what you expect after a restore, the snapshot itself was taken at a moment
you didn't mean — restore a different one; nothing is destroyed by looking.

The whole round trip — snapshot, deliberately mangle a bet and a placement, restore, compare a
checksum over all five tables — runs on every `bash scripts/local-db-verify.sh`.

### The schedule

Scheduled snapshots run on **Supabase pg_cron**, inside the database, so the app holds no
service-role key and no cron secret. Enabling it is a one-time dashboard step (Database →
Extensions → `pg_cron`), then:

```sql
SELECT cron.schedule(
  'ozark-snapshot', '0 */6 * * *',
  $job$ SELECT public.take_snapshot('cron', 50) $job$
);
```

Changing the interval later is one statement, never a deploy:

```sql
SELECT cron.alter_job(<jobid>, schedule => '0 * * * *');   -- hourly, for the weekend
```

Retention is the second argument, and `SNAPSHOT_RETENTION` controls it for the app-triggered
ones. The default of 50 is deliberately generous — a payload for a 32-person pool is a few
hundred KB.

---

## What this doesn't cover

**The accounts.** Members live in `auth.users`, and `public.users.id` is a foreign key to it. The
script makes a best-effort `auth-users.sql`, but on a hosted project that schema is owned by
`supabase_auth_admin` and an ordinary connection usually can't read it — `MANIFEST.txt` says which
way it went. When it says `no`, understand what you have: restoring `public` into a database with an
empty `auth.users` leaves every member row orphaned and every RLS policy inert.

That's survivable at this scale — magic-link sign-in recreates an account, and the display names,
fees and wagers are all in the export keyed by the same UUIDs — but it is not a one-command restore.
If the accounts matter, use Supabase's own dashboard backup, or `supabase db dump --linked`, which
runs with the credentials that can read `auth`.

**Storage.** Avatar images live in the `avatars` bucket, not in Postgres, and aren't in the export.
Losing them costs everyone their picture and nothing else.

**The Google Sheet.** Leaderboard standings are mirrored read-only from Pat's workbook (Sprint 8).
The app is not the system of record and there's nothing here to back up — Pat's workbook is the
original.

---

## Troubleshooting

**`pg_dump: aborting because of server version mismatch`** — your `pg_dump` is older than the
server. The script says so, drops `full.dump`, and **carries on**, because the CSVs still hold every
row; the manifest records the miss. To get the dump too, point at a newer client:

```bash
PGDUMP=/usr/lib/postgresql/17/bin/pg_dump bash scripts/db-export.sh "$SUPABASE_DB_URL" before-phase-1
```

The script already prefers the newest `pg_dump` under `/usr/lib/postgresql/*/bin` over whatever is
first on `PATH`, which on most machines is the oldest one installed.

**`EXPORT ABORTED: the database has tables this script doesn't back up`** — a migration added a
table and the export would have quietly skipped it. Add it to `TABLES` in the script, parent-first,
and re-run. This check exists so a backup can't go stale in silence. *(It fired for real when
Sprint 11 added `snapshots`, which is exactly what it's for.)*

**A restore says `RESTORE VERIFICATION FAILED`** — the transaction committed but the tables
don't match the payload. Don't carry on as though they do. The likeliest cause is a snapshot
written before a migration that changed one of the five tables; take a fresh export first, then
compare `MANIFEST.txt` against the payload's counts to see which table disagrees.

**`Can't reach the database`** — the connection string is wrong, or the project is paused. A free
Supabase project sleeps after inactivity; open the dashboard, wait for it to wake, and try again.
Waking it is also step 1 of the pre-tournament checklist for exactly this reason.

**`EXPORT FAILED: these tables came back empty`** — nothing was deleted; the export just ran against
the wrong database. Check the connection string points at the tournament project.
