package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
)

type chatRequest struct {
	Message string      `json:"message"`
	Report  interface{} `json:"report"`
}

type chatResponse struct {
	Reply string `json:"reply"`
}

func ChatHandler(c *gin.Context) {
	var req chatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	// Таймаут 25 секунд — защита от зависания Python-сервиса
	ctx, cancel := context.WithTimeout(c.Request.Context(), 25*time.Second)
	defer cancel()

	pyURL := os.Getenv("PYTHON_SERVICE_URL")
	if pyURL == "" {
		pyURL = "http://localhost:8000"
	}

	payload, err := json.Marshal(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "marshal error"})
		return
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		fmt.Sprintf("%s/chat", pyURL), bytes.NewReader(payload))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create request"})
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			c.JSON(http.StatusGatewayTimeout, gin.H{"error": "AI service timed out (25s)"})
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": "AI service unavailable"})
		return
	}
	defer resp.Body.Close()

	var pyResp chatResponse
	if err := json.NewDecoder(resp.Body).Decode(&pyResp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid response from AI service"})
		return
	}

	c.JSON(http.StatusOK, pyResp)
}
