// Package audit drives a single website audit: crawl the page, score what the
// crawler found, then ask the AI service for prose on top.
package audit

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/d-ai/core-backend/internal/models"
	"github.com/d-ai/core-backend/internal/store"
	"github.com/rs/zerolog"
)

const (
	crawlTimeout = 45 * time.Second
	aiTimeout    = 40 * time.Second
	jobTimeout   = 2 * time.Minute
)

type Runner struct {
	store       store.Store
	crawlerBase string
	aiBase      string
	client      *http.Client
	log         zerolog.Logger
}

func NewRunner(st store.Store, crawlerBase, aiBase string, log zerolog.Logger) *Runner {
	return &Runner{
		store:       st,
		crawlerBase: crawlerBase,
		aiBase:      aiBase,
		client:      &http.Client{Timeout: crawlTimeout},
		log:         log,
	}
}

// crawlResponse mirrors the JSON returned by crawler-engine POST /crawl.
type crawlResponse struct {
	URL              string              `json:"url"`
	StatusCode       int                 `json:"status_code"`
	Title            string              `json:"title"`
	MetaDescription  string              `json:"meta_description"`
	Headings         map[string][]string `json:"headings"`
	ImagesWithoutAlt []string            `json:"images_without_alt"`
	InlineScripts    int                 `json:"inline_scripts"`
	InlineStyles     int                 `json:"inline_styles"`
	PageSizeBytes    int                 `json:"page_size_bytes"`
	LoadTimeMS       float64             `json:"load_time_ms"`
	Issues           []models.Issue      `json:"issues"`
	Error            string              `json:"error"`
}

// aiReportResponse mirrors ai-assistant POST /report.
type aiReportResponse struct {
	Summary         string   `json:"summary"`
	Recommendations []string `json:"recommendations"`
	Ideas           []string `json:"ideas"`
	Error           string   `json:"error"`
}

// Start launches the job in the background. The caller has already persisted
// the job with status "queued".
func (r *Runner) Start(job models.AuditJob) {
	go func() {
		// Deliberately detached from the HTTP request context: the request
		// that started the audit returns immediately, so inheriting its
		// context would cancel the job the moment the response was written.
		ctx, cancel := context.WithTimeout(context.Background(), jobTimeout)
		defer cancel()
		r.run(ctx, job)
	}()
}

func (r *Runner) run(ctx context.Context, job models.AuditJob) {
	log := r.log.With().Str("job_id", job.ID).Str("url", job.URL).Logger()

	if err := r.store.SetJobStatus(ctx, job.ID, models.StatusRunning, ""); err != nil {
		log.Error().Err(err).Msg("could not mark job running")
		return
	}

	crawl, err := r.crawl(ctx, job.URL)
	if err != nil {
		log.Warn().Err(err).Msg("crawl failed")
		r.fail(ctx, job.ID, fmt.Sprintf("не удалось проанализировать сайт: %v", err))
		return
	}

	report := &models.AuditReport{
		JobID:           job.ID,
		URL:             crawl.URL,
		Issues:          crawl.Issues,
		Score:           Score(crawl.Issues),
		Recommendations: []string{},
		Ideas:           []string{},
		Metrics: &models.Metrics{
			StatusCode:       crawl.StatusCode,
			Title:            crawl.Title,
			MetaDescription:  crawl.MetaDescription,
			LoadTimeMS:       crawl.LoadTimeMS,
			PageSizeBytes:    crawl.PageSizeBytes,
			ImagesWithoutAlt: len(crawl.ImagesWithoutAlt),
			InlineScripts:    crawl.InlineScripts,
			H1Count:          len(crawl.Headings["h1"]),
		},
		CompletedAt: time.Now().UTC(),
	}
	if report.Issues == nil {
		report.Issues = []models.Issue{}
	}

	// The AI pass is a bonus, not a requirement: without an API key the audit
	// still returns real, measured findings plus rule-based advice.
	if ai, err := r.aiReport(ctx, crawl); err != nil {
		log.Warn().Err(err).Msg("ai report unavailable, falling back to rule-based advice")
		report.Recommendations = FallbackRecommendations(crawl.Issues)
	} else {
		report.AIAvailable = true
		report.Summary = ai.Summary
		report.Recommendations = ai.Recommendations
		report.Ideas = ai.Ideas
		if len(report.Recommendations) == 0 {
			report.Recommendations = FallbackRecommendations(crawl.Issues)
		}
	}

	if err := r.store.SaveReport(ctx, report); err != nil {
		log.Error().Err(err).Msg("could not save report")
		r.fail(ctx, job.ID, "не удалось сохранить отчёт")
		return
	}
	if err := r.store.SetJobStatus(ctx, job.ID, models.StatusDone, ""); err != nil {
		log.Error().Err(err).Msg("could not mark job done")
		return
	}
	log.Info().Int("score", report.Score).Int("issues", len(report.Issues)).Msg("audit finished")
}

func (r *Runner) fail(ctx context.Context, jobID, msg string) {
	if err := r.store.SetJobStatus(ctx, jobID, models.StatusError, msg); err != nil {
		r.log.Error().Err(err).Str("job_id", jobID).Msg("could not mark job failed")
	}
}

func (r *Runner) crawl(ctx context.Context, target string) (*crawlResponse, error) {
	var out crawlResponse
	if err := r.postJSON(ctx, r.crawlerBase+"/crawl", map[string]string{"url": target}, crawlTimeout, &out); err != nil {
		return nil, err
	}
	if out.Error != "" {
		return nil, fmt.Errorf("%s", out.Error)
	}
	return &out, nil
}

func (r *Runner) aiReport(ctx context.Context, crawl *crawlResponse) (*aiReportResponse, error) {
	var out aiReportResponse
	payload := map[string]any{"crawl_data": crawl}
	if err := r.postJSON(ctx, r.aiBase+"/report", payload, aiTimeout, &out); err != nil {
		return nil, err
	}
	if out.Error != "" {
		return nil, fmt.Errorf("%s", out.Error)
	}
	return &out, nil
}

func (r *Runner) postJSON(ctx context.Context, url string, body any, timeout time.Duration, out any) error {
	raw, err := json.Marshal(body)
	if err != nil {
		return err
	}

	reqCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, url, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	// Cap the response so a huge or hostile upstream body cannot exhaust memory.
	data, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		// Upstream errors are JSON {"error": "..."}; surface the message when
		// we can parse it, otherwise report the status.
		var errBody struct {
			Error string `json:"error"`
		}
		if json.Unmarshal(data, &errBody) == nil && errBody.Error != "" {
			return fmt.Errorf("%s", errBody.Error)
		}
		return fmt.Errorf("upstream returned %d", resp.StatusCode)
	}
	return json.Unmarshal(data, out)
}
