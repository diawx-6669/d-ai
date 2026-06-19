#!/usr/bin/env bash
# db-migrate.sh — Apply SQL migrations via psql.
set -e
source "$(dirname "$0")/../../.env" 2>/dev/null || true
PGPASSWORD="${PGPASSWORD:-postgres}" psql "$DATABASE_URL" -f "$(dirname "$0")/../sql/001_init.sql"
echo "Migration applied."
