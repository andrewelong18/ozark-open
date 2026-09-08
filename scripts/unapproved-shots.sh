#!/usr/bin/env bash
# Photograph the three member pages as an UNAPPROVED member sees them.
#
#   bash scripts/unapproved-shots.sh            # → docs/screenshots/unapproved/
#   bash scripts/unapproved-shots.sh /some/dir
#
# A thin wrapper over scripts/e2e-verify.sh, same as scripts/mobile-shots.sh:
# that script already owns the Supabase stack, the schema, the fixtures and the
# env, and the fixtures are what put pending@ozark.test in the un-approved state
# these shots are of (onboarded, no tournament_participants row).
#
# Writes full-page PNGs from e2e/unapproved-shots.spec.ts, at desktop and phone
# width, on the `chromium` project.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DIR="${1:-$REPO/docs/screenshots/unapproved}"

rm -rf "$DIR"
mkdir -p "$DIR"

echo "==> capturing the approval-pending state into $DIR"
UNAPPROVED_SHOTS_DIR="$DIR" bash "$REPO/scripts/e2e-verify.sh" unapproved-shots

echo
echo "Captured:"
ls -1 "$DIR"
