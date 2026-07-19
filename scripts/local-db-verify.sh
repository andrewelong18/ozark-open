#!/usr/bin/env bash
# One-command local DB verification: spins up a throwaway Postgres cluster,
# applies every migration + the Phase 1 seed over the stub Supabase auth
# schema, runs the three round-trip harnesses (import, placement RLS,
# payout view), and smoke-tests the admin chase SQL. No Supabase creds,
# no TCP port (unix socket only), no leftovers — the cluster is deleted
# on exit. This is the recipe from the round-trip scripts' headers, scripted.
#
# Usage: bash scripts/local-db-verify.sh
# Needs: postgresql-16 server binaries + psql, node 22+, repo deps installed.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
[ -n "$PGBIN" ] && [ -x "$PGBIN/initdb" ] || { echo "Postgres server binaries not found — set PGBIN=/path/to/pg/bin" >&2; exit 1; }

WORK="$(mktemp -d)"
DATADIR="$WORK/data"
SOCKDIR="$WORK/sock"
mkdir -p "$DATADIR" "$SOCKDIR"

# postgres refuses to run as root — hand the cluster to the postgres user then.
if [ "$(id -u)" = 0 ]; then
  RUNAS() { su postgres -c "$*"; }
  chown -R postgres:postgres "$WORK"
  chmod 755 "$WORK"
  DBUSER=postgres
else
  RUNAS() { bash -c "$*"; }
  DBUSER="$(whoami)"
fi

cleanup() {
  RUNAS "'$PGBIN/pg_ctl' -D '$DATADIR' stop -m immediate" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

RUNAS "'$PGBIN/initdb' -D '$DATADIR' -A trust" >/dev/null
RUNAS "'$PGBIN/pg_ctl' -D '$DATADIR' -l '$WORK/pg.log' -o \"-c listen_addresses='' -k '$SOCKDIR'\" start" >/dev/null
RUNAS "'$PGBIN/createdb' -h '$SOCKDIR' ozark_roundtrip"

export PGURI="postgresql://$DBUSER@/ozark_roundtrip?host=$SOCKDIR"
run_sql() { psql "$PGURI" -X -q -v ON_ERROR_STOP=1 "$@"; }

echo "==> stub Supabase auth schema"
run_sql -c "
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
  CREATE ROLE authenticated; CREATE ROLE anon;"

echo "==> stub Supabase storage schema (avatars bucket migration)"
run_sql -c "
  CREATE SCHEMA storage;
  CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean DEFAULT false);
  CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql AS 'SELECT string_to_array(name, ''/'')';"

echo "==> migrations + Phase 1 seed"
for f in "$REPO"/supabase/migrations/*.sql; do
  run_sql -f "$f"
  echo "    applied $(basename "$f")"
done
run_sql -f "$REPO/supabase/seed-sample-phase1.sql"
echo "    applied seed-sample-phase1.sql"

echo "==> round trips (import → placement RLS → payout view)"
node --experimental-strip-types "$REPO/scripts/import-roundtrip.ts"
node --experimental-strip-types "$REPO/scripts/placement-roundtrip.ts"
node --experimental-strip-types "$REPO/scripts/payout-view-roundtrip.ts"

echo "==> admin chase SQL smoke (docs/admin/phase-compliance.sql)"
psql "$PGURI" -X -v ON_ERROR_STOP=1 -f "$REPO/docs/admin/phase-compliance.sql"

echo "All local DB verification passed."
