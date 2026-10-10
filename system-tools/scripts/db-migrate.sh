#!/usr/bin/env bash
#
# Applies the schema by hand. Normally unnecessary: the backend runs the same
# statements at startup when DATABASE_URL is set.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
: "${DATABASE_URL:?set DATABASE_URL first}"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/system-tools/sql/001_init.sql"
echo "schema applied"
