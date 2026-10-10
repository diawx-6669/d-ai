package store

import (
	"context"
	"sort"
	"sync"
	"time"

	"github.com/d-ai/core-backend/internal/models"
)

// memoryStore keeps everything in RAM. Data is lost when the process restarts;
// that is an explicit trade-off so the app still works without a database.
type memoryStore struct {
	mu      sync.RWMutex
	users   map[string]*models.User
	jobs    map[string]*models.AuditJob
	reports map[string]*models.AuditReport
}

func NewMemory() Store {
	return &memoryStore{
		users:   make(map[string]*models.User),
		jobs:    make(map[string]*models.AuditJob),
		reports: make(map[string]*models.AuditReport),
	}
}

func (s *memoryStore) Kind() string               { return "memory" }
func (s *memoryStore) Ping(context.Context) error { return nil }
func (s *memoryStore) Close() error               { return nil }

func (s *memoryStore) CreateUser(_ context.Context, username, hash string) (*models.User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.users[username]; ok {
		return nil, ErrUserExists
	}
	u := &models.User{Username: username, PasswordHash: hash, CreatedAt: time.Now().UTC()}
	s.users[username] = u
	return u, nil
}

func (s *memoryStore) UserByUsername(_ context.Context, username string) (*models.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	u, ok := s.users[username]
	if !ok {
		return nil, ErrNotFound
	}
	copied := *u
	return &copied, nil
}

func (s *memoryStore) CreateJob(_ context.Context, job *models.AuditJob) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	copied := *job
	s.jobs[job.ID] = &copied
	return nil
}

func (s *memoryStore) SetJobStatus(_ context.Context, id, status, errMsg string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	job, ok := s.jobs[id]
	if !ok {
		return ErrNotFound
	}
	job.Status = status
	job.Error = errMsg
	job.UpdatedAt = time.Now().UTC()
	return nil
}

func (s *memoryStore) Job(_ context.Context, userID, id string) (*models.AuditJob, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	job, ok := s.jobs[id]
	if !ok || job.UserID != userID {
		return nil, ErrNotFound
	}
	copied := *job
	return &copied, nil
}

func (s *memoryStore) History(_ context.Context, userID string, limit int) ([]models.AuditJob, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]models.AuditJob, 0, len(s.jobs))
	for _, job := range s.jobs {
		if job.UserID == userID {
			out = append(out, *job)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func (s *memoryStore) SaveReport(_ context.Context, report *models.AuditReport) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	copied := *report
	s.reports[report.JobID] = &copied
	return nil
}

func (s *memoryStore) Report(_ context.Context, jobID string) (*models.AuditReport, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	r, ok := s.reports[jobID]
	if !ok {
		return nil, ErrNotFound
	}
	copied := *r
	return &copied, nil
}
