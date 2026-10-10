-- d-ai schema.
--
-- The Go backend applies this automatically at startup (see
-- internal/store/postgres.go); this file is kept for reference and for
-- provisioning a database by hand.

CREATE TABLE IF NOT EXISTS users (
	id            BIGSERIAL PRIMARY KEY,
	username      TEXT UNIQUE NOT NULL,
	password_hash TEXT NOT NULL,
	created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
	id         TEXT PRIMARY KEY,
	user_id    TEXT NOT NULL,
	url        TEXT NOT NULL,
	status     TEXT NOT NULL,            -- queued | running | done | error
	error      TEXT NOT NULL DEFAULT '',
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_user_created_idx ON jobs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reports (
	job_id       TEXT PRIMARY KEY REFERENCES jobs (id) ON DELETE CASCADE,
	score        INTEGER NOT NULL,
	payload      JSONB NOT NULL,         -- the full report as served by the API
	completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
