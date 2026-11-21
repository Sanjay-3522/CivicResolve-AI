#!/usr/bin/env bash
# Serve the production build for E2E: FastAPI on :8000 (fresh temp DB, mock AI) + Next standalone on :3100.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
front="$here/.."
back="$front/../backend"
tmp="$(mktemp -d)"
cp -r "$front/.next/static" "$front/.next/standalone/.next/static"
( cd "$back" && env -u GEMINI_API_KEY ADMIN_API_KEY="${E2E_ADMIN_KEY:-e2e-admin-key-0123456789}" \
    DATABASE_URL="sqlite:///$tmp/e2e.db" UPLOAD_DIR="$tmp/uploads" TZ=UTC \
    python -m uvicorn main:app --host 127.0.0.1 --port 8000 --no-proxy-headers ) &
api=$!
cd "$front/.next/standalone"
HOSTNAME=127.0.0.1 PORT=3100 node server.js &
web=$!
cleanup() {
  kill "$api" "$web" 2>/dev/null || true
  wait "$api" "$web" 2>/dev/null || true
  rm -rf "$tmp"
}
trap cleanup EXIT
trap 'exit 143' TERM INT
# If either service dies, fail the E2E web-server process instead of leaving a
# stranded API server holding port 8000 for the next run.
wait -n "$api" "$web"
exit 1
