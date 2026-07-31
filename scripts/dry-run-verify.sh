#!/usr/bin/env bash
# Rehearses the entire dry run against a throwaway local Postgres, so nothing
# is discovered for the first time while Pat is sitting there.
#
# Same throwaway-cluster recipe as scripts/local-db-verify.sh, with a fuller
# auth stub: the dry-run seed inserts real auth.users and auth.identities rows
# (that is how the simulated accounts become login-able), so the two-column
# stub the other harness uses isn't enough here.
#
# Usage: bash scripts/dry-run-verify.sh
# Needs: postgresql-16 server binaries + psql, node 22+, npm install done.
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
RUNAS "'$PGBIN/createdb' -h '$SOCKDIR' ozark_dryrun"

export PGURI="postgresql://$DBUSER@/ozark_dryrun?host=$SOCKDIR"
run_sql() { psql "$PGURI" -X -q -v ON_ERROR_STOP=1 "$@"; }

echo "==> stub Supabase auth schema (enough for the sim-account seed)"
run_sql -c "
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (
    instance_id uuid,
    id uuid PRIMARY KEY,
    aud text, role text, email text,
    email_confirmed_at timestamptz,
    last_sign_in_at timestamptz,
    raw_app_meta_data jsonb, raw_user_meta_data jsonb,
    created_at timestamptz, updated_at timestamptz,
    confirmation_token text, email_change text,
    email_change_token_new text, recovery_token text
  );
  CREATE TABLE auth.identities (
    id uuid PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    provider_id text, identity_data jsonb, provider text,
    last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz
  );
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
  CREATE ROLE authenticated; CREATE ROLE anon;"

echo "==> stub Supabase storage schema"
run_sql -c "
  CREATE SCHEMA storage;
  CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean DEFAULT false);
  CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql AS 'SELECT string_to_array(name, ''/'')';"

echo "==> migrations"
for f in "$REPO"/supabase/migrations/*.sql; do
  run_sql -f "$f"
done
echo "    applied $(ls "$REPO"/supabase/migrations/*.sql | wc -l) migrations"

echo "==> stand in for the three real production accounts"
run_sql -c "
  INSERT INTO auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at)
  VALUES
    ('00000000-0000-0000-0000-000000000000','873b4df3-6077-4cbe-8d32-cd9a6fc475e5','authenticated','authenticated','andrewelong18@gmail.com', now(), now(), now()),
    ('00000000-0000-0000-0000-000000000000','e7da7b0e-d945-46fc-af29-78277204ccc3','authenticated','authenticated','esswein93@gmail.com',      now(), now(), now()),
    ('00000000-0000-0000-0000-000000000000','45e8790b-4a4d-412a-8edb-6dcec6fea5ce','authenticated','authenticated','pleicht17@gmail.com',      now(), now(), now());
  UPDATE public.users SET is_admin = true, onboarded_at = now(), display_name = v.name
    FROM (VALUES
      ('andrewelong18@gmail.com','Andrew Long'),
      ('esswein93@gmail.com','Steve Esswein'),
      ('pleicht17@gmail.com','Pat Leicht')
    ) AS v(email, name)
   WHERE public.users.email = v.email;
  INSERT INTO public.tournament_participants (user_id, tournament_id, entry_fee, is_player)
  SELECT u.id, t.id, 20, true FROM public.users u
    CROSS JOIN (SELECT id FROM public.tournaments WHERE year = 2026) t;"

echo "==> generate the dry-run sheets"
node --experimental-strip-types "$REPO/scripts/make-dry-run-sheets.ts" >/dev/null

echo "==> walk the full lifecycle"
node --experimental-strip-types "$REPO/scripts/dry-run-verify.ts"
