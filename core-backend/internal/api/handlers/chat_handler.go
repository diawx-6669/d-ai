package handlers

import (
	"context"
	"fmt"
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

// ChatProxy проксирует SSE-поток от Python AI-сервиса с таймаутом 25 с.
//
// Маршрут: POST /api/chat (зарегистрирован в main.go как handlers.ChatProxy).
//
// Поведение при ошибках:
//   - таймаут (25 с)  → SSE-событие с JSON-ошибкой + [DONE]
//   - клиент закрыл  → тихий выход
//   - плохой gateway → JSON 502
//   - прочее         → JSON 500
func ChatProxy(c *gin.Context) {
	// Объединяем таймаут прокси с контекстом клиентского запроса:
	// если клиент закрыл соединение — контекст отменяется немедленно.
	ctx, cancel := context.WithTimeout(c.Request.Context(), aiServiceTimeout)
	defer cancel()

	body := c.Request.Body
	defer body.Close()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, aiBase+"/chat", body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("не удалось сформировать запрос к AI-сервису: %v", err),
		})
		return
	}
	req.Header.Set("Content-Type", "application/json")

	// Клиент без глобального таймаута — таймаут управляется контекстом.
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		switch ctx.Err() {
		case context.DeadlineExceeded:
			// Отдаём ошибку в формате SSE, чтобы фронтенд мог её распарсить
			// в потоковом режиме так же, как обычные чанки.
			c.Header("Content-Type", "text/event-stream")
			c.Header("Cache-Control", "no-cache")
			c.Header("X-Accel-Buffering", "no")
			c.Status(http.StatusGatewayTimeout)
			fmt.Fprint(c.Writer, "data: {\"error\":\"AI-сервис не ответил за 25 секунд. Попробуйте позже.\"}\n\n")
			fmt.Fprint(c.Writer, "data: [DONE]\n\n")
			c.Writer.Flush()
		case context.Canceled:
			// Клиент закрыл соединение до ответа — просто выходим.
		default:
			c.JSON(http.StatusBadGateway, gin.H{
				"error": fmt.Sprintf("AI-сервис недоступен: %v", err),
			})
		}
		return
	}
	defer resp.Body.Close()

	// Если upstream вернул не-2xx — читаем тело и отдаём понятный JSON.
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		upstreamBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		c.JSON(http.StatusBadGateway, gin.H{
			"error":           fmt.Sprintf("AI-сервис вернул статус %d", resp.StatusCode),
			"upstream_detail": string(upstreamBody),
		})
		return
	}

	// Прокидываем SSE-заголовки клиенту.
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("X-Accel-Buffering", "no")
	c.Status(http.StatusOK)

	buf := make([]byte, 4096)
	for {
		// Проверяем контекст перед каждым чтением.
		if ctx.Err() != nil {
			fmt.Fprint(c.Writer, "data: {\"error\":\"Таймаут соединения\"}\n\n")
			fmt.Fprint(c.Writer, "data: [DONE]\n\n")
			c.Writer.Flush()
			return
		}

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
			// Сеть упала посередине стрима — шлём финальное событие.
			fmt.Fprintf(c.Writer, "data: {\"error\":\"Соединение с AI-сервисом прервано: %v\"}\n\n", readErr)
			fmt.Fprint(c.Writer, "data: [DONE]\n\n")
			c.Writer.Flush()
			return
		}
	}
}
