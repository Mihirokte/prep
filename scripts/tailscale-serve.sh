#!/usr/bin/env bash
# Publish (or withdraw) the Prep phone server on your tailnet over HTTPS.
#
#   bash scripts/tailscale-serve.sh on      # https://<this-mac>.<tailnet>.ts.net:8390
#   bash scripts/tailscale-serve.sh off
#   bash scripts/tailscale-serve.sh status
#
# Only the 8390 listener is touched; whatever Serve already publishes on 443 or 80 stays as it is.
# Tailscale Serve is tailnet-only (not Funnel), and adds the caller's login to each request,
# which is what the Prep server checks.
set -euo pipefail

PORT="${PREP_WEB_PORT:-5390}"
HTTPS_PORT="${PREP_HTTPS_PORT:-8390}"
TS="$(command -v tailscale || true)"
[ -n "$TS" ] || TS=/Applications/Tailscale.app/Contents/MacOS/Tailscale
[ -x "$TS" ] || { echo "tailscale not found" >&2; exit 1; }

case "${1:-status}" in
  on)
    # Never take over a port that Serve already uses for something else.
    taken="$("$TS" serve status | grep -A1 ":$HTTPS_PORT " | grep -v "127.0.0.1:$PORT" | grep -c 'proxy' || true)"
    if [ "$taken" != "0" ]; then
      echo "HTTPS port $HTTPS_PORT is already served for something else; set PREP_HTTPS_PORT to a free port." >&2
      exit 1
    fi
    "$TS" serve --bg --https="$HTTPS_PORT" "http://127.0.0.1:$PORT"
    echo
    "$TS" serve status
    ;;
  off)
    "$TS" serve --https="$HTTPS_PORT" off
    ;;
  status)
    "$TS" serve status
    ;;
  *)
    echo "usage: $0 on|off|status" >&2
    exit 2
    ;;
esac
