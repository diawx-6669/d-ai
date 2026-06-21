package handlers

import (
	"context"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
)

const aiServiceTimeout = 25 * time.Second

var aiBase = func() string {
	if v := os.Getenv("AI_SERVICE_BASE"); v != "" {
		return v
	}
	return "http://localhost:5002"
}()

// ChatProxy проксирует SSE-поток от Python AI-сервиса с таймаутом 25с.
func ChatProxy(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), aiServiceTimeout)
	defer cancel()

	// Читаем тело запроса от клиента
	body := c.Request.Body
	defer body.Close()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, aiBase+"/chat", body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build upstream request"})
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			// Таймаут на стороне Go-прокси
			c.Header("Content-Type", "text/event-stream")
			c.String(http.StatusGatewayTimeout,
				"data: {\"error\":\"AI-сервис не ответил за 25 секунд. Попробуйте позже.\"}\n\ndata: [DONE]\n\n")
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	defer resp.Body.Close()

	// Прокидываем SSE-заголовки клиенту
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("X-Accel-Buffering", "no")
	c.Status(http.StatusOK)

	// Стримим ответ чанками
	buf := make([]byte, 4096)
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if _, writeErr := c.Writer.Write(buf[:n]); writeErr != nil {
				return // клиент отключился
			}
			c.Writer.Flush()
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return
		}
		// Проверяем таймаут контекста между чанками
		if ctx.Err() != nil {
			c.Writer.Write([]byte("data: {\"error\":\"Таймаут соединения\"}\n\ndata: [DONE]\n\n"))
			c.Writer.Flush()
			return
		}
	}
}
