package models

import "time"

type AuditRequest struct {
	URL string `json:"url" binding:"required,url"`
}

type AuditJob struct {
	ID        string    `json:"id"`
	URL       string    `json:"url"`
	Status    string    `json:"status"` // queued | running | done | error
	CreatedAt time.Time `json:"created_at"`
}

type AuditReport struct {
	JobID           string        `json:"job_id"`
	Score           int           `json:"score"`
	Issues          []Issue       `json:"issues"`
	Recommendations []string      `json:"recommendations"`
	Ideas           []string      `json:"ideas"`
	CompletedAt     time.Time     `json:"completed_at"`
}

type Issue struct {
	Severity    string `json:"severity"` // critical | warning | info
	Category    string `json:"category"` // seo | perf | security | accessibility
	Description string `json:"description"`
	Line        int    `json:"line,omitempty"`
}
