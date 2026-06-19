#!/usr/bin/env bash
# build-all.sh — Build all Docker images.
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
echo "🛡️  d-ai — building Docker images …"
docker build -t d-ai/core-backend:latest    "$ROOT/core-backend"
docker build -t d-ai/crawler-engine:latest  "$ROOT/crawler-engine"
docker build -t d-ai/ai-assistant:latest    "$ROOT/ai-assistant"
docker build -t d-ai/frontend-ui:latest     "$ROOT/frontend-ui"
echo "All images built successfully."
