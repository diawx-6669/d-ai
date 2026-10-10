package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	aiServiceTimeout = 60 * time.Second
	maxChatBodyBytes = 256 << 10 // 256 KiB is plenty for a message plus a report
)

// chatClient has no Timeout of its own: a streaming response must be allowed
// to stay open, so the deadline lives on the request context instead.
var chatClient = &http.Client{}

// ChatProxy streams the AI service's SSE response back to the browser.
//
// Errors are reported as SSE events once the stream has started (the browser
// is already reading a stream and cannot switch to a JSON body), and as plain
// JSON before that.
func (a *API) ChatProxy(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), aiServiceTimeout)
	defer cancel()

	// The body is buffered rather than streamed upstream. Handing an unsized
	// io.Reader to http.NewRequest leaves ContentLength unknown, so Go sends
	// the request chunked -- and the WSGI server upstream then reports no
	// body at all, which is how the chat silently received an empty message.
	// 256 KiB is small enough to hold in memory.
	body, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, maxChatBodyBytes))
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "Слишком длинный запрос"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": "Не удалось прочитать запрос"})
		return
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.AIBase+"/chat", bytes.NewReader(body))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось обратиться к AI-сервису"})
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.ContentLength = int64(len(body))

	resp, err := chatClient.Do(req)
	if err != nil {
		switch ctx.Err() {
		case context.DeadlineExceeded:
			c.JSON(http.StatusGatewayTimeout, gin.H{
				"error": "AI-сервис не ответил за 60 секунд. Попробуйте позже.",
			})
		case context.Canceled:
			// The browser went away before the upstream answered.
		default:
			a.Log.Warn().Err(err).Msg("ai service unreachable")
			c.JSON(http.StatusBadGateway, gin.H{"error": "AI-сервис недоступен. Попробуйте позже."})
		}
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		detail, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		var upstream struct {
			Error string `json:"error"`
		}
		msg := fmt.Sprintf("AI-сервис вернул статус %d", resp.StatusCode)
		if json.Unmarshal(detail, &upstream) == nil && upstream.Error != "" {
			msg = upstream.Error
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": msg})
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")
	c.Status(http.StatusOK)

	flusher, canFlush := c.Writer.(http.Flusher)
	buf := make([]byte, 4096)
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if _, writeErr := c.Writer.Write(buf[:n]); writeErr != nil {
				return // client disconnected
			}
			if canFlush {
				flusher.Flush()
			}
		}
		if readErr == io.EOF {
			return
		}
		if readErr != nil {
			if ctx.Err() == context.Canceled {
				return // client disconnected
			}
			a.Log.Warn().Err(readErr).Msg("ai stream interrupted")
			fmt.Fprint(c.Writer, "data: {\"error\":\"Соединение с AI-сервисом прервано\"}\n\n")
			fmt.Fprint(c.Writer, "data: [DONE]\n\n")
			if canFlush {
				flusher.Flush()
			}
			return
		}
	}
}
