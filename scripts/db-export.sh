#!/usr/bin/env bash
# Take a backup of the tournament database, and prove it's a real one.
#
#   bash scripts/db-export.sh                              # the local stack
#   bash scripts/db-export.sh "$SUPABASE_DB_URL" before-phase-1
#   bash scripts/db-export.sh "$SUPABASE_DB_URL" after-payouts
#
#   $1  connection string        (default: $SUPABASE_DB_URL, else the local
#                                 stack read off `supabase status`)
#   $2  label for the folder     (default: "export")
#
# Sprint 9 / docs/DATA_SAFETY.md. The free Supabase tier has no automated
# backups and this is money data — 32 people's entry fees, every wager, every
# result. There is no undo and no support ticket that gets it back.
#
# What lands in backups/<label>-<UTC timestamp>/:
#
#   full.dump      pg_dump -Fc of the public schema — the restore path
#   schema.sql     the same schema in plain SQL, readable and diffable
#   csv/*.csv      one file per money table, openable in Excel, restorable by
#                  hand. Belt and braces: a custom-format dump is only as good
#                  as the pg_restore that can read it, and this data has to
#                  outlive any particular tool. (snapshots.csv is the exception:
#                  metadata only — see csv_select below.)
#   MANIFEST.txt   row counts AND the pool reconciliation
#
# This is the FLOOR, not the whole story. Sprint 11 added automatic snapshots
# (public.snapshots + scripts/restore-snapshot.ts) for the other failure: not
# "the building burned down" but "someone uploaded the wrong sheet four minutes
# ago". Neither replaces the other — docs/DATA_SAFETY.md covers when to reach
# for which.
#
# The manifest is the point. A backup nobody opened is a folder, not a backup —
# so this one carries the same three numbers the tournament reconciles against
# (entry fees − voided stakes = pool) and refuses to finish if a money table
# came back empty. An export that silently captured nothing is worse than none:
# it's a false sense of safety with a timestamp on it.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

DB_URL="${1:-${SUPABASE_DB_URL:-}}"
LABEL="${2:-export}"

if [ -z "$DB_URL" ]; then
  echo "==> no connection string given — falling back to the local stack"
  if ! DB_URL="$(npx --yes supabase@latest status -o json 2>/dev/null \
      | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).DB_URL??''))")" \
      || [ -z "$DB_URL" ]; then
    cat >&2 <<'MSG'
No database to export.

  * For prod:  bash scripts/db-export.sh "$SUPABASE_DB_URL" before-phase-1
               (Supabase dashboard → Project Settings → Database → Connection
                string. See docs/DATA_SAFETY.md for where the password lives.)
  * For local: start the stack first — `npx supabase start`.
MSG
    exit 1
  fi
fi

# Never print the connection string: it carries the database password, and this
# script's output ends up pasted into issues and chat.
SAFE_HOST="$(printf '%s' "$DB_URL" | sed -E 's#^[^@]*@##; s#[/?].*$##')"
[ -n "$SAFE_HOST" ] || SAFE_HOST="local socket"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$REPO/backups/${LABEL}-${STAMP}"
mkdir -p "$OUT/csv"

echo "==> exporting $SAFE_HOST → backups/${LABEL}-${STAMP}"

psql_q() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -At -c "$1"; }

# Fail early and clearly rather than producing an empty folder.
if ! SERVER_VERSION="$(psql_q 'SHOW server_version;' 2>/dev/null)"; then
  echo "Can't reach the database at $SAFE_HOST — check the connection string." >&2
  exit 1
fi

# ── the money tables ────────────────────────────────────────────────────────
# Ordered parent-first so a hand restore from CSV can be done in file order
# without tripping a foreign key.
TABLES=(
  users
  tournaments
  tournament_participants
  tournament_invites
  bet_categories
  bets
  bet_picks
  bet_placements
  # Sprint 11's save states. No foreign keys, so it can sit last without
  # affecting the parent-first ordering the hand-restore path depends on.
  snapshots
)

# Tables whose CSV is metadata only, and what to select instead of SELECT *.
#
# snapshots.payload is a jsonb dump of every other table on this list, times
# however many snapshots are being kept. Putting that in a CSV produces a file
# with multi-megabyte cells that no spreadsheet will open — which defeats the
# entire reason the CSVs exist alongside full.dump: that a year from now
# "what did Dan actually win" should be answerable by double-clicking a file.
#
# Nothing is lost. The payloads are historical copies of state this export
# already captures in its own right, and full.dump carries them intact for the
# case where you actually want to roll one back. See docs/DATA_SAFETY.md.
csv_select() {
  case "$1" in
    snapshots)
      echo "SELECT id, created_at, trigger, pg_column_size(payload) AS payload_bytes FROM public.snapshots"
      ;;
    *)
      echo "SELECT * FROM public.$1"
      ;;
  esac
}
# The ones whose emptiness means the export failed — i.e. it ran against the
# wrong project, or an empty one. Four is enough to catch that decisively.
#
# bet_placements and tournament_participants are deliberately NOT here: before
# Phase 1 opens — one of the two moments this script exists for — nobody has
# wagered and not everyone is approved, so zero is the truth and a false alarm
# on a real backup is the one outcome worse than no check at all.
MUST_HAVE_ROWS=(users tournaments bets bet_picks)

# A hardcoded list can go stale the moment someone adds a migration, and the
# failure mode is a backup that quietly omits a table. So: ask the database what
# it has, and refuse to run if the list above doesn't cover it. Better to stop
# and be edited than to write a folder that looks complete.
LIVE_TABLES="$(psql_q "SELECT table_name FROM information_schema.tables
                       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
                       ORDER BY table_name;")"
MISSING=""
for live in $LIVE_TABLES; do
  case " ${TABLES[*]} " in
    *" $live "*) ;;
    *) MISSING="$MISSING $live" ;;
  esac
done
if [ -n "$MISSING" ]; then
  echo "EXPORT ABORTED: the database has tables this script doesn't back up —$MISSING" >&2
  echo "Add them to TABLES in scripts/db-export.sh (parent-first) and re-run." >&2
  exit 1
fi

# ── pg_dump ────────────────────────────────────────────────────────────────
# A client older than the server refuses to run rather than produce a subtly
# wrong dump, which is the correct behaviour and an annoying one on a laptop
# whose postgresql-client is behind Supabase's. That is not a reason to abandon
# the export: the CSVs below are a complete copy of every row. Say so loudly
# and carry on.
DUMP_OK=yes
DUMP_NOTE=""
# Prefer the newest pg_dump installed, not whichever one is first on PATH —
# distros keep several under /usr/lib/postgresql/*/bin and PATH usually points
# at the oldest. PGDUMP overrides both.
if [ -z "${PGDUMP:-}" ]; then
  PGDUMP="$(ls -d /usr/lib/postgresql/*/bin/pg_dump 2>/dev/null | sort -V | tail -1)"
  [ -x "${PGDUMP:-}" ] || PGDUMP="$(command -v pg_dump || true)"
fi
if [ -z "$PGDUMP" ]; then
  echo "!!  no pg_dump on this machine — CSV only. docs/DATA_SAFETY.md §Troubleshooting."
  DUMP_OK=no
  DUMP_NOTE="pg_dump not installed"
  CLIENT_VERSION="none"
fi
[ "$DUMP_OK" = yes ] && CLIENT_VERSION="$("$PGDUMP" --version | grep -oE '[0-9]+' | head -1)"
if [ "$DUMP_OK" = yes ] && ! "$PGDUMP" "$DB_URL" --schema=public --format=custom --file="$OUT/full.dump" 2>"$OUT/.dump.err"; then
  DUMP_OK=no
  DUMP_NOTE="$(head -3 "$OUT/.dump.err" | tr '\n' ' ')"
  rm -f "$OUT/full.dump"
  echo "!!  pg_dump failed (client $CLIENT_VERSION vs server $SERVER_VERSION)."
  echo "!!  $DUMP_NOTE"
  echo "!!  Continuing — the CSVs below still hold every row. docs/DATA_SAFETY.md §Troubleshooting."
elif [ "$DUMP_OK" = yes ]; then
  "$PGDUMP" "$DB_URL" --schema=public --schema-only --file="$OUT/schema.sql"
  echo "    full.dump + schema.sql"
fi

# The accounts themselves live in auth.users, which public.users has a foreign
# key to — so a public-only dump restores into a database where every member
# row is orphaned. Best effort, because on a hosted project auth is owned by
# supabase_auth_admin and an ordinary connection often can't read it; when that
# happens Supabase's own backup is the thing that covers it, and the runbook
# says so. Never fatal: the money data is in public.
AUTH_OK=no
if [ "$DUMP_OK" = yes ] && "$PGDUMP" "$DB_URL" --data-only --table=auth.users \
     --file="$OUT/auth-users.sql" 2>/dev/null; then
  AUTH_OK=yes
  echo "    auth-users.sql"
else
  rm -f "$OUT/auth-users.sql"
fi
rm -f "$OUT/.dump.err"

# ── CSVs ───────────────────────────────────────────────────────────────────
for t in "${TABLES[@]}"; do
  psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 \
    -c "\\copy ($(csv_select "$t")) TO '$OUT/csv/$t.csv' WITH (FORMAT csv, HEADER true)"
done
# The payout view too: it's derived, but it's the arithmetic everyone will want
# to check a year from now, frozen as of this instant.
psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 \
  -c "\\copy (SELECT * FROM public.placement_payouts_view) TO '$OUT/csv/placement_payouts_view.csv' WITH (FORMAT csv, HEADER true)"
echo "    csv/ (${#TABLES[@]} tables + placement_payouts_view; snapshots.csv is metadata only)"

# ── the manifest ───────────────────────────────────────────────────────────
{
  echo "Ozark Open database export"
  echo "  label      : $LABEL"
  echo "  taken (UTC): $STAMP"
  echo "  host       : $SAFE_HOST"
  echo "  server     : PostgreSQL $SERVER_VERSION (pg_dump client $CLIENT_VERSION)"
  echo "  full.dump  : $([ "$DUMP_OK" = yes ] && echo "yes (public schema)" || echo "MISSING — $DUMP_NOTE")"
  echo "  auth.users : $([ "$AUTH_OK" = yes ] && echo "yes" || echo "no — see docs/DATA_SAFETY.md §What this does not cover")"
  echo
  echo "Row counts  (snapshots: CSV is metadata only; payloads are in full.dump)"
} > "$OUT/MANIFEST.txt"

FAILED=""
for t in "${TABLES[@]}"; do
  n="$(psql_q "SELECT count(*) FROM public.$t;")"
  printf '  %-24s %s\n' "$t" "$n" >> "$OUT/MANIFEST.txt"
  for must in "${MUST_HAVE_ROWS[@]}"; do
    if [ "$t" = "$must" ] && [ "$n" = "0" ]; then FAILED="$FAILED $t"; fi
  done
done

# The reconciliation, per tournament. Same shape as the number the dry run and
# scripts/sim-pool-verify.sh check against: entry fees − voided stakes = pool.
{
  echo
  echo "Pool reconciliation (per tournament)"
} >> "$OUT/MANIFEST.txt"

psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 >> "$OUT/MANIFEST.txt" <<'SQL'
SELECT
  t.name,
  t.status,
  coalesce(fees.entry_fees, 0)                                     AS entry_fees,
  coalesce(v.voided_stakes, 0)                                     AS voided_stakes,
  coalesce(fees.entry_fees, 0) - coalesce(v.voided_stakes, 0)      AS pool,
  coalesce(w.wagered, 0)                                           AS wagered,
  coalesce(w.live_placements, 0)                                   AS live_placements,
  coalesce(p.pending_picks, 0)                                     AS pending_picks
FROM public.tournaments t
LEFT JOIN LATERAL (
  -- Revoked participants leave the pool entirely, fee and wagers together
  -- (PRD §12 A13) — so the denominator here has to match lib/payouts.ts.
  SELECT sum(tp.entry_fee) AS entry_fees
  FROM public.tournament_participants tp
  WHERE tp.tournament_id = t.id AND tp.revoked_at IS NULL
) fees ON true
LEFT JOIN LATERAL (
  SELECT sum(bp.amount) AS voided_stakes
  FROM public.bet_placements bp
  JOIN public.bet_picks pk ON pk.id = bp.pick_id
  JOIN public.bets b       ON b.id  = pk.bet_id
  JOIN public.tournament_participants tp
    ON tp.user_id = bp.user_id AND tp.tournament_id = b.tournament_id
  WHERE b.tournament_id = t.id
    AND bp.deleted_at IS NULL
    AND tp.revoked_at IS NULL
    AND pk.result = 'void'
) v ON true
LEFT JOIN LATERAL (
  SELECT sum(bp.amount) AS wagered, count(*) AS live_placements
  FROM public.bet_placements bp
  JOIN public.bet_picks pk ON pk.id = bp.pick_id
  JOIN public.bets b       ON b.id  = pk.bet_id
  JOIN public.tournament_participants tp
    ON tp.user_id = bp.user_id AND tp.tournament_id = b.tournament_id
  WHERE b.tournament_id = t.id
    AND bp.deleted_at IS NULL
    AND tp.revoked_at IS NULL
) w ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS pending_picks
  FROM public.bet_picks pk
  JOIN public.bets b ON b.id = pk.bet_id
  WHERE b.tournament_id = t.id AND pk.result = 'pending'
) p ON true
ORDER BY t.year DESC;
SQL

echo
cat "$OUT/MANIFEST.txt"
echo

if [ -n "$FAILED" ]; then
  echo "EXPORT FAILED: these tables came back empty —$FAILED" >&2
  echo "An export that captured nothing is worse than none. Nothing was deleted;" >&2
  echo "check the connection string points at the right project and re-run." >&2
  exit 1
fi

echo "Export complete: backups/${LABEL}-${STAMP}"
[ "$DUMP_OK" = yes ] || echo "  (CSV only — see the pg_dump note above and docs/DATA_SAFETY.md)"
echo "Copy it OFF this machine. A backup on the box you are about to break is not a backup."
