#!/usr/bin/env bash
# Launch FastAPI (private, 127.0.0.1:8000) and the Next.js standalone server
# (public, 0.0.0.0:$PORT). If either process exits, stop the other and exit
# non-zero so Cloud Run restarts the container.
set -uo pipefail

PORT="${PORT:-8080}"
APP_ROOT="${APP_ROOT:-/app}"

cd "$APP_ROOT/backend"
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --no-proxy-headers &
API_PID=$!

cd "$APP_ROOT/frontend"
HOSTNAME=0.0.0.0 PORT="$PORT" node server.js &
WEB_PID=$!

shutdown() {
  kill -TERM "$API_PID" "$WEB_PID" 2>/dev/null
  wait
}
trap 'shutdown; exit 0' TERM INT

wait -n "$API_PID" "$WEB_PID"
STATUS=$?
echo "start.sh: a child process exited (status $STATUS); shutting down" >&2
shutdown
exit $(( STATUS == 0 ? 1 : STATUS ))
