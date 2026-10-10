package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/d-ai/core-backend/internal/models"
	"github.com/lib/pq"
)

// New tables are called "jobs"/"reports" rather than "audit_jobs"/
// "audit_reports" on purpose: an earlier schema defined those with UUID
// primary keys and foreign keys that no longer match, and CREATE TABLE IF
// NOT EXISTS would silently leave the incompatible definition in place.
const schema = `
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
	status     TEXT NOT NULL,
	error      TEXT NOT NULL DEFAULT '',
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_user_created_idx ON jobs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reports (
	job_id       TEXT PRIMARY KEY REFERENCES jobs (id) ON DELETE CASCADE,
	score        INTEGER NOT NULL,
	payload      JSONB NOT NULL,
	completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`

type postgresStore struct {
	db *sql.DB
}

func NewPostgres(ctx context.Context, connStr string) (Store, error) {
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, fmt.Errorf("open postgres: %w", err)
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)

	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := db.PingContext(pingCtx); err != nil {
		db.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}

	s := &postgresStore{db: db}
	if err := s.migrate(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return s, nil
}

func (s *postgresStore) migrate(ctx context.Context) error {
	migrateCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	_, err := s.db.ExecContext(migrateCtx, schema)
	return err
}

func (s *postgresStore) Kind() string { return "postgres" }

func (s *postgresStore) Ping(ctx context.Context) error { return s.db.PingContext(ctx) }

func (s *postgresStore) Close() error { return s.db.Close() }

func (s *postgresStore) CreateUser(ctx context.Context, username, hash string) (*models.User, error) {
	u := &models.User{Username: username, PasswordHash: hash}
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO users (username, password_hash)
		VALUES ($1, $2)
		RETURNING created_at
	`, username, hash).Scan(&u.CreatedAt)
	if err != nil {
		var pqErr *pq.Error
		if errors.As(err, &pqErr) && pqErr.Code == "23505" {
			return nil, ErrUserExists
		}
		return nil, err
	}
	return u, nil
}

func (s *postgresStore) UserByUsername(ctx context.Context, username string) (*models.User, error) {
	u := &models.User{Username: username}
	err := s.db.QueryRowContext(ctx, `
		SELECT password_hash, created_at FROM users WHERE username = $1
	`, username).Scan(&u.PasswordHash, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return u, nil
}

func (s *postgresStore) CreateJob(ctx context.Context, job *models.AuditJob) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO jobs (id, user_id, url, status, error, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, job.ID, job.UserID, job.URL, job.Status, job.Error, job.CreatedAt, job.UpdatedAt)
	return err
}

func (s *postgresStore) SetJobStatus(ctx context.Context, id, status, errMsg string) error {
	res, err := s.db.ExecContext(ctx, `
		UPDATE jobs SET status = $2, error = $3, updated_at = now() WHERE id = $1
	`, id, status, errMsg)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *postgresStore) Job(ctx context.Context, userID, id string) (*models.AuditJob, error) {
	job := &models.AuditJob{}
	err := s.db.QueryRowContext(ctx, `
		SELECT id, user_id, url, status, error, created_at, updated_at
		FROM jobs WHERE id = $1 AND user_id = $2
	`, id, userID).Scan(
		&job.ID, &job.UserID, &job.URL, &job.Status, &job.Error, &job.CreatedAt, &job.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return job, nil
}

func (s *postgresStore) History(ctx context.Context, userID string, limit int) ([]models.AuditJob, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, user_id, url, status, error, created_at, updated_at
		FROM jobs WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT $2
	`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.AuditJob{}
	for rows.Next() {
		var job models.AuditJob
		if err := rows.Scan(
			&job.ID, &job.UserID, &job.URL, &job.Status, &job.Error, &job.CreatedAt, &job.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, job)
	}
	return out, rows.Err()
}

func (s *postgresStore) SaveReport(ctx context.Context, report *models.AuditReport) error {
	payload, err := json.Marshal(report)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO reports (job_id, score, payload, completed_at)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (job_id) DO UPDATE
		SET score = EXCLUDED.score,
		    payload = EXCLUDED.payload,
		    completed_at = EXCLUDED.completed_at
	`, report.JobID, report.Score, payload, report.CompletedAt)
	return err
}

func (s *postgresStore) Report(ctx context.Context, jobID string) (*models.AuditReport, error) {
	var payload []byte
	err := s.db.QueryRowContext(ctx, `
		SELECT payload FROM reports WHERE job_id = $1
	`, jobID).Scan(&payload)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	report := &models.AuditReport{}
	if err := json.Unmarshal(payload, report); err != nil {
		return nil, err
	}
	return report, nil
}
