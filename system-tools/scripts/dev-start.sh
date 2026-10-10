#!/usr/bin/env bash
#
# Starts the whole stack locally: both Python services, the Go API and Vite.
# Requires Go 1.25+, Python 3.11+ and Node 20+. Ctrl-C stops everything.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export CRAWLER_SERVICE_BASE="${CRAWLER_SERVICE_BASE:-http://127.0.0.1:5001}"
export AI_SERVICE_BASE="${AI_SERVICE_BASE:-http://127.0.0.1:5002}"
# Audit your own machine during development. Never set this in production.
export CRAWLER_ALLOW_PRIVATE="${CRAWLER_ALLOW_PRIVATE:-1}"

pids=()
cleanup() {
  echo ""
  echo "stopping …"
  for pid in "${pids[@]:-}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

venv() {
  local dir="$1"
  if [[ ! -d "$dir/.venv" ]]; then
    echo "  creating venv in $dir"
    python3 -m venv "$dir/.venv"
  fi
  "$dir/.venv/bin/pip" install -q -r "$dir/requirements.txt"
}

echo "d-ai dev environment starting …"

venv crawler-engine
(cd crawler-engine && .venv/bin/python -m src.app) &
pids+=($!)
echo "  crawler-engine  → http://127.0.0.1:5001"

venv ai-assistant
(cd ai-assistant && .venv/bin/python -m src.app) &
pids+=($!)
echo "  ai-assistant    → http://127.0.0.1:5002"

(cd core-backend && PORT="${PORT:-8080}" GIN_MODE=debug go run ./cmd/server) &
pids+=($!)
echo "  core-backend    → http://127.0.0.1:8080"

(cd frontend-ui && npm install --silent && npm run dev) &
pids+=($!)
echo "  frontend-ui     → http://127.0.0.1:3000"

echo ""
echo "  Open http://localhost:3000 and register an account."
echo "  Press Ctrl-C to stop."
wait
