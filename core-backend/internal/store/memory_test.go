package store

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/d-ai/core-backend/internal/models"
)

func TestMemoryUsers(t *testing.T) {
	ctx := context.Background()
	s := NewMemory()

	if _, err := s.CreateUser(ctx, "alice", "hash"); err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	if _, err := s.CreateUser(ctx, "alice", "other"); !errors.Is(err, ErrUserExists) {
		t.Fatalf("duplicate user: got %v, want ErrUserExists", err)
	}

	user, err := s.UserByUsername(ctx, "alice")
	if err != nil || user.PasswordHash != "hash" {
		t.Fatalf("UserByUsername: %v / %+v", err, user)
	}
	if _, err := s.UserByUsername(ctx, "bob"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing user: got %v, want ErrNotFound", err)
	}
}

func TestMemoryJobsAreScopedToOwner(t *testing.T) {
	ctx := context.Background()
	s := NewMemory()

	job := &models.AuditJob{
		ID: "job-1", UserID: "alice", URL: "https://example.com",
		Status: models.StatusQueued, CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	if err := s.CreateJob(ctx, job); err != nil {
		t.Fatalf("CreateJob: %v", err)
	}

	if _, err := s.Job(ctx, "bob", "job-1"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("another user could read the job: %v", err)
	}
	if _, err := s.Job(ctx, "alice", "job-1"); err != nil {
		t.Fatalf("owner could not read the job: %v", err)
	}

	if err := s.SetJobStatus(ctx, "job-1", models.StatusError, "boom"); err != nil {
		t.Fatalf("SetJobStatus: %v", err)
	}
	updated, _ := s.Job(ctx, "alice", "job-1")
	if updated.Status != models.StatusError || updated.Error != "boom" {
		t.Fatalf("status not updated: %+v", updated)
	}

	hist, err := s.History(ctx, "alice", 10)
	if err != nil || len(hist) != 1 {
		t.Fatalf("History: %v / %v", err, hist)
	}
	if other, _ := s.History(ctx, "bob", 10); len(other) != 0 {
		t.Fatalf("history leaked across users: %v", other)
	}
}

func TestMemoryReports(t *testing.T) {
	ctx := context.Background()
	s := NewMemory()

	if _, err := s.Report(ctx, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing report: got %v, want ErrNotFound", err)
	}
	report := &models.AuditReport{JobID: "job-1", Score: 42, CompletedAt: time.Now()}
	if err := s.SaveReport(ctx, report); err != nil {
		t.Fatalf("SaveReport: %v", err)
	}
	got, err := s.Report(ctx, "job-1")
	if err != nil || got.Score != 42 {
		t.Fatalf("Report: %v / %+v", err, got)
	}
}
