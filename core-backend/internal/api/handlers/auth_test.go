package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/d-ai/core-backend/internal/store"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog"
	"golang.org/x/crypto/bcrypt"
)

func newTestAPI() (*API, *gin.Engine) {
	gin.SetMode(gin.TestMode)
	api := &API{
		Store:     store.NewMemory(),
		JWTSecret: []byte("test-secret"),
		Log:       zerolog.Nop(),
	}
	r := gin.New()
	r.POST("/api/auth/register", api.Register)
	r.POST("/api/auth/login", api.Login)
	return api, r
}

func postJSON(r *gin.Engine, path string, body any) *httptest.ResponseRecorder {
	raw, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func decodeToken(t *testing.T, body io.Reader) string {
	t.Helper()
	var out struct {
		Token string `json:"token"`
		Error string `json:"error"`
	}
	if err := json.NewDecoder(body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return out.Token
}

func TestRegisterThenLogin(t *testing.T) {
	_, r := newTestAPI()

	w := postJSON(r, "/api/auth/register", map[string]string{"username": "alice", "password": "sup3rsecret"})
	if w.Code != http.StatusCreated {
		t.Fatalf("register: got %d, body %s", w.Code, w.Body.String())
	}
	if decodeToken(t, w.Body) == "" {
		t.Fatal("register returned no token")
	}

	w = postJSON(r, "/api/auth/login", map[string]string{"username": "alice", "password": "sup3rsecret"})
	if w.Code != http.StatusOK {
		t.Fatalf("login: got %d, body %s", w.Code, w.Body.String())
	}
	if decodeToken(t, w.Body) == "" {
		t.Fatal("login returned no token")
	}
}

func TestRegisterRejectsShortPasswordAndDuplicates(t *testing.T) {
	_, r := newTestAPI()

	if w := postJSON(r, "/api/auth/register", map[string]string{"username": "bob", "password": "short"}); w.Code != http.StatusBadRequest {
		t.Fatalf("short password: got %d", w.Code)
	}
	postJSON(r, "/api/auth/register", map[string]string{"username": "bob", "password": "longenough1"})
	if w := postJSON(r, "/api/auth/register", map[string]string{"username": "bob", "password": "longenough1"}); w.Code != http.StatusConflict {
		t.Fatalf("duplicate username: got %d", w.Code)
	}
}

func TestLoginRejectsBadCredentials(t *testing.T) {
	_, r := newTestAPI()
	postJSON(r, "/api/auth/register", map[string]string{"username": "alice", "password": "sup3rsecret"})

	if w := postJSON(r, "/api/auth/login", map[string]string{"username": "alice", "password": "wrong-one"}); w.Code != http.StatusUnauthorized {
		t.Fatalf("wrong password: got %d", w.Code)
	}
	if w := postJSON(r, "/api/auth/login", map[string]string{"username": "ghost", "password": "whatever1"}); w.Code != http.StatusUnauthorized {
		t.Fatalf("unknown user: got %d", w.Code)
	}
}

// The constant-time path for unknown users only does real work if the
// placeholder hash is a valid bcrypt digest.
func TestDummyHashIsValidBcrypt(t *testing.T) {
	if err := bcrypt.CompareHashAndPassword(dummyHash, []byte("anything")); err != bcrypt.ErrMismatchedHashAndPassword {
		t.Fatalf("dummyHash is not a usable bcrypt hash: %v", err)
	}
}
