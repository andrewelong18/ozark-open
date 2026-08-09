#!/usr/bin/env bash
# One command drives the whole member journey in a real browser: sign in →
# onboard → get approved → place / edit / remove → reveal at close → payouts.
# No human clicking, no real email.
#
#   bash scripts/e2e-verify.sh            # everything
#   bash scripts/e2e-verify.sh bets-menu  # one spec, by filename fragment
#
# What it owns, in order:
#   1. the local Supabase stack (Docker) — started if it isn't already up
#   2. the schema — every migration, applied by the CLI
#   3. the fixtures — sample menu, dev accounts, then supabase/seed-e2e.sql
#   4. the env the app and the sign-in fixture need, read back off the stack
#   5. playwright, against the pre-installed Chromium
#
# Needs: Docker, node 22+, repo deps installed. Never touches a hosted project —
# the URL it exports is always the local stack's.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

SUPABASE="npx --yes supabase@latest"

# localhost, NOT 127.0.0.1 — /auth/callback redirects to the origin Next derives
# from the request, which normalises to localhost. Starting on 127.0.0.1 sets the
# session cookie on one origin and lands on another, dropping it. See the comment
# in playwright.config.ts.
export E2E_BASE_URL="${E2E_BASE_URL:-http://localhost:3000}"

echo "==> local Supabase stack"
if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^supabase_db_'; then
  # The heavy extras buy this suite nothing: Studio is a human UI, realtime and
  # the rest aren't on any path the app takes.
  $SUPABASE start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime
else
  echo "    already up"
fi

echo "==> reading the stack's env"
STATUS_JSON="$($SUPABASE status -o json)"
read_key() { node -e "process.stdout.write((JSON.parse(process.argv[1])['$1'] ?? ''))" "$STATUS_JSON"; }

export NEXT_PUBLIC_SUPABASE_URL="$(read_key API_URL)"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$(read_key ANON_KEY)"
export SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL"
export SUPABASE_SERVICE_ROLE_KEY="$(read_key SERVICE_ROLE_KEY)"
export SITE_URL="$E2E_BASE_URL"
DB_URL="$(read_key DB_URL)"
# Exported so a spec that deliberately drives the menu through its lifecycle
# (close a bet, publish results) can put the fixture back afterwards, instead of
# leaving the next spec to inherit a settled tournament.
export E2E_DB_URL="$DB_URL"

[ -n "$NEXT_PUBLIC_SUPABASE_URL" ] && [ -n "$SUPABASE_SERVICE_ROLE_KEY" ] || {
  echo "Couldn't read the stack's URL/keys from \`supabase status\`." >&2; exit 1; }

# A stray .env.local would override everything above inside `next dev` and point
# the app somewhere else — most dangerously at a hosted project.
if [ -f "$REPO/.env.local" ] && ! grep -q "$NEXT_PUBLIC_SUPABASE_URL" "$REPO/.env.local"; then
  echo "REFUSING TO RUN: .env.local points somewhere other than the local stack." >&2
  echo "  Move it aside — these specs write accounts and wagers." >&2
  exit 1
fi

echo "==> Supabase-parity grants"
# A hosted Supabase project hands anon/authenticated/service_role table
# privileges through ALTER DEFAULT PRIVILEGES, set up long before any of our
# migrations run. The local image doesn't, so tables created by our migrations
# land with no DML grants and every page renders "No bets published yet" —
# which looks exactly like a rendering bug and isn't one.
#
# This is the same move scripts/local-db-verify.sh makes for the round-trip
# harnesses: teach a bare Postgres to behave like Supabase. It is NOT a schema
# change — RLS is still the gate, grants are only the coarse layer underneath,
# which is precisely how the hosted project is configured.
psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -c "
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
  GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON TABLES TO anon, authenticated, service_role;"

echo "==> fixtures"
run_sql() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }
run_sql -f supabase/seed-sample-phase1.sql && echo "    seed-sample-phase1.sql"
run_sql -f supabase/seed-dev-accounts.sql  && echo "    seed-dev-accounts.sql"
run_sql -f supabase/seed-e2e.sql           && echo "    seed-e2e.sql"

echo "==> playwright (Chromium, one project)"
if [ $# -gt 0 ]; then
  npx playwright test "$@"
else
  npx playwright test
fi

echo "The whole E2E journey passes end to end."
