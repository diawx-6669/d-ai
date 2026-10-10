package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/d-ai/core-backend/internal/store"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog"
)

func newChatRouter(aiBase string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	api := &API{Store: store.NewMemory(), AIBase: aiBase, Log: zerolog.Nop()}
	r := gin.New()
	r.POST("/api/chat", api.ChatProxy)
	return r
}

func chatRequest(r *gin.Engine, payload any) *httptest.ResponseRecorder {
	raw, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/chat", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// Regression test: the proxy used to hand an unsized reader to
// http.NewRequest, so the upstream request went out chunked with no
// Content-Length and the WSGI server upstream saw an empty body -- the chat
// answered as if the user had sent nothing.
func TestChatProxyForwardsTheBodyWithAContentLength(t *testing.T) {
	type received struct {
		body          []byte
		contentLength int64
		encoding      string
	}
	got := make(chan received, 1)

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		got <- received{
			body:          body,
			contentLength: r.ContentLength,
			encoding:      r.Header.Get("Transfer-Encoding"),
		}
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "data: {\"chunk\":\"ok\"}\n\ndata: [DONE]\n\n")
	}))
	defer upstream.Close()

	w := chatRequest(newChatRouter(upstream.URL), map[string]any{
		"message": "привет",
		"history": []map[string]string{{"role": "user", "content": "раньше"}},
		"report":  map[string]any{"score": 55},
	})

	if w.Code != http.StatusOK {
		t.Fatalf("got %d, body %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "data: [DONE]") {
		t.Fatalf("the stream was not forwarded: %q", w.Body.String())
	}

	up := <-got
	if up.contentLength <= 0 {
		t.Errorf("upstream saw ContentLength %d, want a positive value", up.contentLength)
	}
	if up.encoding == "chunked" {
		t.Error("upstream request was chunked; the AI service cannot read such a body")
	}

	var parsed map[string]any
	if err := json.Unmarshal(up.body, &parsed); err != nil {
		t.Fatalf("upstream body was not valid JSON (%q): %v", up.body, err)
	}
	for _, key := range []string{"message", "history", "report"} {
		if _, ok := parsed[key]; !ok {
			t.Errorf("upstream body is missing %q: %v", key, parsed)
		}
	}
	if parsed["message"] != "привет" {
		t.Errorf("message arrived as %v", parsed["message"])
	}
}

func TestChatProxyTurnsUpstreamErrorsIntoJSON(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
		fmt.Fprint(w, `{"error":"AI-чат не настроен"}`)
	}))
	defer upstream.Close()

	w := chatRequest(newChatRouter(upstream.URL), map[string]any{"message": "hi"})
	if w.Code != http.StatusBadGateway {
		t.Fatalf("got %d, want 502; body %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "не настроен") {
		t.Fatalf("the upstream message was not passed through: %s", w.Body.String())
	}
}

func TestChatProxyReportsAnUnreachableService(t *testing.T) {
	// Nothing is listening on this address.
	w := chatRequest(newChatRouter("http://127.0.0.1:1"), map[string]any{"message": "hi"})
	if w.Code != http.StatusBadGateway {
		t.Fatalf("got %d, want 502; body %s", w.Code, w.Body.String())
	}
}
