#!/usr/bin/env bash
# dev-start.sh — Start all services locally (requires Go, Python 3.12, Node 20)
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
echo "🛡️  d-ai dev environment starting …"

# Backend
(cd "$ROOT/core-backend" && go run ./cmd/server &)
echo "  ✓ core-backend on :8080"

# Crawler
(cd "$ROOT/crawler-engine" && \
  python -m venv .venv 2>/dev/null && \
  source .venv/bin/activate && \
  pip install -q -r requirements.txt && \
  python -m src.app &)
echo "  ✓ crawler-engine on :5001"

# AI assistant
(cd "$ROOT/ai-assistant" && \
  python -m venv .venv 2>/dev/null && \
  source .venv/bin/activate && \
  pip install -q -r requirements.txt && \
  python -m src.app &)
echo "  ✓ ai-assistant on :5002"

# Frontend
(cd "$ROOT/frontend-ui" && npm install -s && npm run dev &)
echo "  ✓ frontend-ui on :3000"

echo ""
echo "  Open http://localhost:3000  (admin / d-ai-secret)"
echo "  Press Ctrl-C to stop all services."
wait
