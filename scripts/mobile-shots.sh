#!/usr/bin/env bash
# Photograph the app at phone width.
#
#   bash scripts/mobile-shots.sh before    # → docs/mobile/before/
#   bash scripts/mobile-shots.sh after     # → docs/mobile/after/
#
# A thin wrapper over scripts/e2e-verify.sh, which already owns the Supabase
# stack, the schema, the fixtures and the env — the shots have to be taken
# against the same seeded data both times or the pair isn't a comparison.
#
# Writes full-page PNGs from e2e/mobile-shots.spec.ts on the `mobile` project
# (Pixel 7). Those are committed: a green geometry assertion is not a look, and
# the whole point of the mobile pass is what it looks like in a hand.
set -euo pipefail

LABEL="${1:-after}"
case "$LABEL" in
  before|after) ;;
  *) echo "usage: bash scripts/mobile-shots.sh before|after" >&2; exit 1 ;;
esac

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$REPO/docs/mobile/$LABEL"

rm -rf "$DIR"
mkdir -p "$DIR"

echo "==> capturing '$LABEL' into docs/mobile/$LABEL"
MOBILE_SHOTS_DIR="$DIR" bash "$REPO/scripts/e2e-verify.sh" --project=mobile mobile-shots

echo
echo "Captured:"
ls -1 "$DIR"
