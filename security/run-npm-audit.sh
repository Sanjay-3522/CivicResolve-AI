#!/usr/bin/env bash
# Treat npm audit exit=1 (vulnerabilities found) as a report, not a tooling crash.
# The JSON analyzer rejects any unreviewed high/critical advisory and broken reports.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
report="$(mktemp)"
trap 'rm -f "$report"' EXIT
cd "$here/../frontend"
status=0
npm audit --json > "$report" || status=$?
if (( status > 1 )); then
  cat "$report" >&2
  exit "$status"
fi
node "$here/check-npm-audit.mjs" < "$report"
