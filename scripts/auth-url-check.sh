#!/usr/bin/env bash
#
# auth-url-check.sh — assert prod's magic links point at ozark-open.com.
#
# Read-only. Nothing here changes anything; scripts/prod-auth-config.sh is the
# one that writes (see docs/AGENT_AUTOMATION.md).
#
# Why it exists: the magic-link email builds its URL from the Supabase project's
# Site URL, which is a dashboard setting no test or build can see. It sat on the
# old .vercel.app address for weeks while the app itself served ozark-open.com,
# so members were mailed a link to a domain they'd never been given. The failure
# is invisible from inside the repo — hence a check that reaches out and looks.
#
# Usage:
#   export SUPABASE_ACCESS_TOKEN=sbp_...    # same token the MCP uses
#   bash scripts/auth-url-check.sh

set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-rbjqqzjqhsbcotqfrwhb}"
CANONICAL_ORIGIN="https://ozark-open.com"

: "${SUPABASE_ACCESS_TOKEN:?set SUPABASE_ACCESS_TOKEN (Supabase dashboard -> Account -> Access Tokens)}"

curl -sS "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  > /tmp/ozark-auth-config.json

CANONICAL_ORIGIN="$CANONICAL_ORIGIN" python3 - <<'PY'
import json, os, sys

canonical = os.environ["CANONICAL_ORIGIN"]
with open("/tmp/ozark-auth-config.json", encoding="utf-8") as f:
    cfg = json.load(f)

site_url = (cfg.get("site_url") or "").rstrip("/")
allow_list = [u.strip() for u in (cfg.get("uri_allow_list") or "").split(",") if u.strip()]

problems = []
if site_url != canonical:
    problems.append(
        f"site_url is {site_url or '(unset)'} — the emailed link is built from this, "
        f"so it must be {canonical}"
    )
if not any(u.startswith(canonical) for u in allow_list):
    problems.append(
        f"redirect allow-list has no {canonical} entry, so the app's emailRedirectTo "
        f"is rejected: {allow_list}"
    )

print(f"site_url:   {site_url or '(unset)'}")
print("allow_list:")
for u in allow_list:
    print(f"  {u}")

if problems:
    print("\nFAIL", file=sys.stderr)
    for p in problems:
        print(f"  - {p}", file=sys.stderr)
    print(
        "\nFix: SITE_URL / URI_ALLOW_LIST via scripts/prod-auth-config.sh --apply",
        file=sys.stderr,
    )
    sys.exit(1)

print("\nOK — magic links point at the canonical domain.")
PY
