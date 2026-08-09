#!/usr/bin/env bash
# The full-pool simulation, from an empty database, in one command.
#
#   bash scripts/sim-pool-verify.sh
#
# Spins a throwaway Postgres, applies every migration, imports the 19-bet sample
# menu (the 13-bet Phase 1 seed has no Phase 2 to bet into), loads ~32 simulated
# members with rule-valid wagers, and then checks the money: every wager passes
# lib/validation.ts, and the pari-mutuel split reconciles to the pool at full
# field size.
#
# Same shape and the same throwaway cluster as scripts/local-db-verify.sh — no
# Docker, no Supabase creds, no TCP port, no leftovers.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
[ -n "$PGBIN" ] && [ -x "$PGBIN/initdb" ] || { echo "Postgres server binaries not found — set PGBIN=/path/to/pg/bin" >&2; exit 1; }

WORK="$(mktemp -d)"
DATADIR="$WORK/data"
SOCKDIR="$WORK/sock"
mkdir -p "$DATADIR" "$SOCKDIR"

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
RUNAS "'$PGBIN/createdb' -h '$SOCKDIR' ozark_simpool"

export PGURI="postgresql://$DBUSER@/ozark_simpool?host=$SOCKDIR"
run_sql() { psql "$PGURI" -X -q -v ON_ERROR_STOP=1 "$@"; }

# The fuller auth stub — the sim seed writes real auth.users AND auth.identities
# rows, the same way the dry-run accounts do.
echo "==> stub Supabase auth + storage schema"
run_sql -c "
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (
    instance_id uuid, id uuid PRIMARY KEY, aud text, role text, email text,
    email_confirmed_at timestamptz, last_sign_in_at timestamptz,
    raw_app_meta_data jsonb, raw_user_meta_data jsonb,
    created_at timestamptz, updated_at timestamptz,
    confirmation_token text, email_change text,
    email_change_token_new text, recovery_token text
  );
  CREATE TABLE auth.identities (
    id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    provider_id text, identity_data jsonb, provider text,
    last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz
  );
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
  CREATE ROLE authenticated; CREATE ROLE anon;
  CREATE SCHEMA storage;
  CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean DEFAULT false);
  CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql AS 'SELECT string_to_array(name, ''/'')';"

echo "==> migrations"
for f in "$REPO"/supabase/migrations/*.sql; do
  run_sql -f "$f"
done
echo "    applied $(ls "$REPO"/supabase/migrations/*.sql | wc -l | tr -d ' ') migrations"

# The sample sheet, through the real importer — this is where Phase 2 comes
# from, and where pick→player links get made.
echo "==> import the 19-bet sample menu"
node --experimental-strip-types "$REPO/scripts/import-roundtrip.ts" >/dev/null
echo "    19 bets, 87 picks"

echo "==> ~32 simulated members and their wagers"
run_sql -f "$REPO/supabase/seed-sim-pool.sql"

echo "==> the money, at full field size"
node --experimental-strip-types "$REPO/scripts/sim-pool-verify.ts"

echo "==> teardown is clean"
run_sql -f "$REPO/supabase/seed-sim-pool-teardown.sql"
LEFT="$(psql "$PGURI" -X -At -c "SELECT count(*) FROM public.users WHERE email LIKE '%@sim.ozark.test'")"
[ "$LEFT" = "0" ] || { echo "Teardown left $LEFT simulated accounts behind." >&2; exit 1; }
echo "    0 simulated accounts left"

echo "The full-pool simulation reconciles."
