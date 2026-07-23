#!/usr/bin/env bash
#
# prod-auth-config.sh — apply Supabase Auth settings the MCP server can't reach.
#
# The Supabase MCP server covers the database (apply_migration / execute_sql),
# storage and logs, but NOT Auth dashboard settings. Those live behind the
# Supabase Management API, which this script wraps so the agent (or you) can
# retire the "click around the Auth dashboard" chores:
#
#   #16  custom SMTP (Resend)         — kills the dev-only rate limit before the dry run
#   #17  session lifetime             — keep logins alive from the Sept dry run through the tournament
#   #70  magic-link email template    — switch the hosted template to the token_hash flow
#
# Everything here works on the FREE Supabase plan with a personal access token.
# Nothing is committed: values come from the environment, secrets never touch git.
#
# Usage:
#   export SUPABASE_ACCESS_TOKEN=sbp_...        # same token the MCP uses (free-tier PAT)
#   # then set only the vars for the change you want (see blocks below), and:
#   bash scripts/prod-auth-config.sh            # DRY RUN — prints the JSON, sends nothing
#   bash scripts/prod-auth-config.sh --apply    # actually PATCHes prod auth config
#
# Re-runnable: it PATCHes, so it only touches the fields you set this run.

set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-rbjqqzjqhsbcotqfrwhb}"
API="https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth"

APPLY=0
[[ "${1:-}" == "--apply" ]] && APPLY=1

: "${SUPABASE_ACCESS_TOKEN:?set SUPABASE_ACCESS_TOKEN (Supabase dashboard -> Account -> Access Tokens; free tier is fine)}"

# Build the PATCH body from whichever vars are set. Each block is independent —
# set none and it's a no-op you can use to read your intent back.
python3 - "$@" <<'PY' > /tmp/ozark-auth-body.json
import json, os
body = {}

# --- #17 session lifetime -------------------------------------------------
# SESSION_TIMEBOX_HOURS=0 disables the hard time-box (recommended: a login in
# the Sept dry run survives to tournament day). Leave INACTIVITY off too.
if "SESSION_TIMEBOX_HOURS" in os.environ:
    body["sessions_timebox"] = int(os.environ["SESSION_TIMEBOX_HOURS"]) or None
if "SESSION_INACTIVITY_HOURS" in os.environ:
    body["sessions_inactivity_timeout"] = int(os.environ["SESSION_INACTIVITY_HOURS"]) or None

# --- #16 custom SMTP (Resend) --------------------------------------------
# Set all five to switch off the dev-only built-in mailer.
if "SMTP_HOST" in os.environ:
    body["smtp_admin_email"] = os.environ.get("SMTP_SENDER_EMAIL", "")
    body["smtp_host"]        = os.environ["SMTP_HOST"]           # smtp.resend.com
    body["smtp_port"]        = os.environ.get("SMTP_PORT", "465")
    body["smtp_user"]        = os.environ.get("SMTP_USER", "resend")
    body["smtp_pass"]        = os.environ["SMTP_PASS"]           # the Resend API key
    body["smtp_sender_name"] = os.environ.get("SMTP_SENDER_NAME", "Ozark Open Sportsbook")
    body["external_email_enabled"] = True

# --- #70 magic-link template (token_hash flow) ---------------------------
# MAGIC_LINK_HTML_PATH points at supabase/templates/magic_link.html.
if "MAGIC_LINK_HTML_PATH" in os.environ:
    with open(os.environ["MAGIC_LINK_HTML_PATH"], encoding="utf-8") as f:
        body["mailer_templates_magic_link_content"] = f.read()
    body["mailer_subjects_magic_link"] = os.environ.get(
        "MAGIC_LINK_SUBJECT", "Sign in to the Ozark Open Sportsbook")

# --- site URL / redirect allow-list (needed by the template & #9 domain) --
if "SITE_URL" in os.environ:
    body["site_url"] = os.environ["SITE_URL"]
if "URI_ALLOW_LIST" in os.environ:
    body["uri_allow_list"] = os.environ["URI_ALLOW_LIST"]  # comma-separated

print(json.dumps(body, indent=2))
PY

BODY="$(cat /tmp/ozark-auth-body.json)"

if [[ "$BODY" == "{}" ]]; then
  echo "No auth fields set — nothing to do. Set the vars for the change you want (see the header)." >&2
  exit 0
fi

echo "Project: ${PROJECT_REF}"
echo "PATCH ${API}"
echo "Body:"
echo "$BODY"

if [[ "$APPLY" -eq 0 ]]; then
  echo
  echo "DRY RUN — nothing sent. Re-run with --apply to write these to prod auth config." >&2
  exit 0
fi

curl -sS -X PATCH "$API" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$BODY" | python3 -m json.tool
echo
echo "Applied. Verify a magic-link round-trip on a phone before the dry run." >&2
