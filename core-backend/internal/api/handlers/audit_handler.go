package handlers

import (
	"net/http"

	"github.com/d-ai/core-backend/internal/db"
	"github.com/d-ai/core-backend/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/lib/pq"
)

// GetAudit возвращает статус задачи и, если готово, полный отчёт.
func GetAudit(c *gin.Context) {
	id := c.Param("id")

	// 1. Достаём AuditJob из БД
	var job models.AuditJob
	err := db.DB.QueryRowContext(c, `
		SELECT id, url, status, created_at
		FROM audit_jobs
		WHERE id = $1
	`, id).Scan(&job.ID, &job.URL, &job.Status, &job.CreatedAt)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "job not found"})
		return
	}

	// 2. Если ещё не готово — отдаём только статус
	if job.Status != "done" {
		c.JSON(http.StatusOK, gin.H{
			"id":         job.ID,
			"url":        job.URL,
			"status":     job.Status, // "queued" | "running" | "error"
			"created_at": job.CreatedAt,
		})
		return
	}

	// 3. Джоб готов — достаём отчёт
	var report models.AuditReport
	err = db.DB.QueryRowContext(c, `
		SELECT job_id, score, recommendations, ideas, completed_at
		FROM audit_reports
		WHERE job_id = $1
	`, id).Scan(
		&report.JobID,
		&report.Score,
		pq.Array(&report.Recommendations),
		pq.Array(&report.Ideas),
		&report.CompletedAt,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "report not found"})
		return
	}

	// 4. Достаём issues из отдельной таблицы
	rows, err := db.DB.QueryContext(c, `
		SELECT severity, category, description, line
		FROM audit_issues
		WHERE job_id = $1
		ORDER BY severity
	`, id)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var issue models.Issue
			rows.Scan(&issue.Severity, &issue.Category, &issue.Description, &issue.Line)
			report.Issues = append(report.Issues, issue)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"id":         job.ID,
		"url":        job.URL,
		"status":     "done",
		"created_at": job.CreatedAt,
		"report":     report,
	})
}
