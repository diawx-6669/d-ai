package handlers

import (
	"errors"
	"net/http"
	"time"

	"github.com/d-ai/core-backend/internal/audit"
	"github.com/d-ai/core-backend/internal/models"
	"github.com/d-ai/core-backend/internal/store"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const historyLimit = 50

// StartAudit creates a job and kicks off the pipeline in the background.
//
// It returns the job id -- the previous version returned only
// {"status":"queued"} with no id, so the frontend polled /api/audit/undefined
// and every audit appeared to hang.
func (a *API) StartAudit(c *gin.Context) {
	var req models.AuditRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Укажите адрес сайта"})
		return
	}

	target, err := audit.NormalizeTarget(req.URL)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": audit.Reason(err)})
		return
	}

	now := time.Now().UTC()
	job := models.AuditJob{
		ID:        uuid.NewString(),
		UserID:    a.userID(c),
		URL:       target,
		Status:    models.StatusQueued,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := a.Store.CreateJob(c.Request.Context(), &job); err != nil {
		a.Log.Error().Err(err).Msg("could not create job")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось создать задачу"})
		return
	}

	a.Runner.Start(job)
	c.JSON(http.StatusAccepted, job)
}

// GetAudit returns the job status and, once finished, the report.
func (a *API) GetAudit(c *gin.Context) {
	job, err := a.Store.Job(c.Request.Context(), a.userID(c), c.Param("id"))
	if errors.Is(err, store.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Задача не найдена"})
		return
	}
	if err != nil {
		a.Log.Error().Err(err).Msg("could not load job")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера, попробуйте позже"})
		return
	}

	payload := gin.H{
		"id":         job.ID,
		"url":        job.URL,
		"status":     job.Status,
		"created_at": job.CreatedAt,
		"updated_at": job.UpdatedAt,
	}
	if job.Error != "" {
		payload["error"] = job.Error
	}

	if job.Status == models.StatusDone {
		report, err := a.Store.Report(c.Request.Context(), job.ID)
		if err != nil {
			// The job says done but the report is missing: report it as a
			// failure instead of leaving the UI polling forever.
			a.Log.Error().Err(err).Str("job_id", job.ID).Msg("report missing for finished job")
			payload["status"] = models.StatusError
			payload["error"] = "Отчёт не найден"
			c.JSON(http.StatusOK, payload)
			return
		}
		payload["report"] = report
	}

	c.JSON(http.StatusOK, payload)
}

// GetHistory returns the authenticated user's recent audits.
func (a *API) GetHistory(c *gin.Context) {
	jobs, err := a.Store.History(c.Request.Context(), a.userID(c), historyLimit)
	if err != nil {
		a.Log.Error().Err(err).Msg("could not load history")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось загрузить историю"})
		return
	}
	if jobs == nil {
		jobs = []models.AuditJob{}
	}
	c.JSON(http.StatusOK, gin.H{"history": jobs})
}

// userID is the subject claim the JWT middleware stored on the context.
func (a *API) userID(c *gin.Context) string {
	if v, ok := c.Get("userID"); ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}
