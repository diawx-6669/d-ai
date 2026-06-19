package db

import "database/sql"

// DB is the global database handle used across handlers.
// It's initialized elsewhere (or can be wired up in main) — a nil value is
// acceptable for build-time if runtime wiring happens in entrypoint.
var DB *sql.DB
