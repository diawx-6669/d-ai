#!/usr/bin/env bash
# Builds and tests everything the CI would.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "── core-backend ──"
(cd core-backend && gofmt -l . && go vet ./... && go test ./... && go build ./...)

echo "── crawler-engine ──"
(cd crawler-engine \
  && python3 -m venv .venv 2>/dev/null || true \
  && .venv/bin/pip install -q -r requirements-dev.txt \
  && .venv/bin/python -m pytest -q)

echo "── ai-assistant ──"
(cd ai-assistant \
  && python3 -m venv .venv 2>/dev/null || true \
  && .venv/bin/pip install -q -r requirements-dev.txt \
  && .venv/bin/python -m pytest -q)

echo "── frontend-ui ──"
(cd frontend-ui && npm ci && npm run build)

echo ""
echo "all green"
