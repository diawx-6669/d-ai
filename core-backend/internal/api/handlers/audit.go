package handlers

import (
	"net/http"
	"time"

	"github.com/d-ai/core-backend/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// StartAudit enqueues a new website audit job.
func StartAudit(c *gin.Context) {
	var req models.AuditRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	job := models.AuditJob{
		ID:        uuid.New().String(),
		URL:       req.URL,
		Status:    "queued",
		CreatedAt: time.Now().UTC(),
	}

	// TODO: push job to worker queue (Redis / channel)
	c.JSON(http.StatusAccepted, job)
}

// GetAudit fetches the result of a completed audit.
func GetAudit(c *gin.Context) {
	id := c.Param("id")
	// TODO: fetch from repository
	c.JSON(http.StatusOK, gin.H{"id": id, "status": "pending"})
}

// GetHistory returns the authenticated user's past audits.
func GetHistory(c *gin.Context) {
	// TODO: fetch from repository scoped to userID from JWT
	c.JSON(http.StatusOK, gin.H{"history": []interface{}{}})
}
