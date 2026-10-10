package models

import "time"

// Job statuses.
const (
	StatusQueued  = "queued"
	StatusRunning = "running"
	StatusDone    = "done"
	StatusError   = "error"
)

type User struct {
	Username     string    `json:"username"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
}

type AuditRequest struct {
	URL string `json:"url" binding:"required"`
}

type AuditJob struct {
	ID        string    `json:"id"`
	UserID    string    `json:"-"`
	URL       string    `json:"url"`
	Status    string    `json:"status"` // queued | running | done | error
	Error     string    `json:"error,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Metrics holds the raw numbers the crawler measured, so the UI can show
// facts next to the AI's opinions.
type Metrics struct {
	StatusCode       int     `json:"status_code"`
	Title            string  `json:"title"`
	MetaDescription  string  `json:"meta_description"`
	LoadTimeMS       float64 `json:"load_time_ms"`
	PageSizeBytes    int     `json:"page_size_bytes"`
	ImagesWithoutAlt int     `json:"images_without_alt"`
	InlineScripts    int     `json:"inline_scripts"`
	H1Count          int     `json:"h1_count"`
}

type AuditReport struct {
	JobID           string    `json:"job_id"`
	URL             string    `json:"url"`
	Score           int       `json:"score"`
	Summary         string    `json:"summary,omitempty"`
	Issues          []Issue   `json:"issues"`
	Recommendations []string  `json:"recommendations"`
	Ideas           []string  `json:"ideas"`
	Metrics         *Metrics  `json:"metrics,omitempty"`
	AIAvailable     bool      `json:"ai_available"`
	CompletedAt     time.Time `json:"completed_at"`
}

type Issue struct {
	Severity    string `json:"severity"` // critical | warning | info
	Category    string `json:"category"` // seo | performance | security | accessibility
	Description string `json:"description"`
	Line        int    `json:"line,omitempty"`
}
