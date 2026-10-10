// Package store holds the persistence layer.
//
// There are two implementations: Postgres (when DATABASE_URL is set) and an
// in-memory one (when it is not). The in-memory store exists so the app is
// fully usable on a host without a provisioned database -- previously the
// server called log.Fatal when DATABASE_URL was missing, which killed the
// whole backend and made every /api/* request return 502 while nginx happily
// kept serving the frontend.
package store

import (
	"context"
	"errors"

	"github.com/d-ai/core-backend/internal/models"
)

var (
	ErrNotFound   = errors.New("not found")
	ErrUserExists = errors.New("username already taken")
)

type Store interface {
	// Kind reports the backing implementation ("postgres" or "memory").
	Kind() string
	Ping(ctx context.Context) error
	Close() error

	CreateUser(ctx context.Context, username, passwordHash string) (*models.User, error)
	UserByUsername(ctx context.Context, username string) (*models.User, error)

	CreateJob(ctx context.Context, job *models.AuditJob) error
	SetJobStatus(ctx context.Context, id, status, errMsg string) error
	// Job returns the job only if it belongs to userID.
	Job(ctx context.Context, userID, id string) (*models.AuditJob, error)
	History(ctx context.Context, userID string, limit int) ([]models.AuditJob, error)

	SaveReport(ctx context.Context, report *models.AuditReport) error
	Report(ctx context.Context, jobID string) (*models.AuditReport, error)
}

// New returns a Postgres store when connStr is non-empty, otherwise an
// in-memory one. A non-empty but unreachable connStr is a configuration
// error and is returned as such -- silently falling back to memory there
// would hide a broken deployment.
func New(ctx context.Context, connStr string) (Store, error) {
	if connStr == "" {
		return NewMemory(), nil
	}
	return NewPostgres(ctx, connStr)
}
