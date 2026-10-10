#!/usr/bin/env bash
#
# Starts the four processes that make up the production image and keeps them
# together: nginx on $PORT (the only port the platform sees), the Go API on
# $BACKEND_PORT, and the two Python services on $CRAWLER_PORT / $AI_PORT.
#
# If any one of them exits, the whole container exits non-zero so the platform
# restarts it, rather than leaving a half-dead site serving 502s.
set -euo pipefail

PORT="${PORT:-8000}"
BACKEND_PORT="${BACKEND_PORT:-8080}"
CRAWLER_PORT="${CRAWLER_PORT:-5001}"
AI_PORT="${AI_PORT:-5002}"
export PORT BACKEND_PORT CRAWLER_PORT AI_PORT

log() { printf '%s [entrypoint] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }

# nginx uses the same $VAR syntax as the shell for its own variables ($host,
# $remote_addr, ...), so the substitution list is explicit -- otherwise
# envsubst would blank them out.
envsubst '${PORT} ${BACKEND_PORT} ${CRAWLER_PORT} ${AI_PORT}' \
  < /etc/nginx/templates/d-ai.conf.template \
  > /etc/nginx/conf.d/d-ai.conf
log "nginx will listen on ${PORT}"

pids=()

start() {
  local name="$1"
  shift
  log "starting ${name}"
  "$@" &
  pids+=("$!")
}

shutdown() {
  log "received shutdown signal"
  for pid in "${pids[@]}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  wait || true
  exit 0
}
trap shutdown TERM INT

start crawler-engine gunicorn \
  --chdir /app/crawler \
  --bind "127.0.0.1:${CRAWLER_PORT}" \
  --workers 2 --threads 4 --timeout 90 \
  --access-logfile - --error-logfile - \
  src.app:app

# More threads than the crawler: every open chat holds one for the length of
# the SSE stream.
start ai-assistant gunicorn \
  --chdir /app/ai \
  --bind "127.0.0.1:${AI_PORT}" \
  --workers 2 --threads 8 --timeout 180 \
  --access-logfile - --error-logfile - \
  src.app:app

start core-backend env \
  PORT="${BACKEND_PORT}" \
  CRAWLER_SERVICE_BASE="http://127.0.0.1:${CRAWLER_PORT}" \
  AI_SERVICE_BASE="http://127.0.0.1:${AI_PORT}" \
  /usr/local/bin/d-ai-server

# The pid file goes to /tmp because the image runs as a non-root user that
# cannot write to /run.
start nginx nginx -g "daemon off; pid /tmp/nginx.pid;"

# Wait for the first process to exit, then take the rest down with it.
set +e
wait -n
status=$?
log "a service exited with status ${status}; stopping the container"
for pid in "${pids[@]}"; do
  kill -TERM "$pid" 2>/dev/null || true
done
wait
exit "${status:-1}"
