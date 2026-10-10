// Package handlers holds the HTTP layer.
package handlers

import (
	"github.com/d-ai/core-backend/internal/audit"
	"github.com/d-ai/core-backend/internal/store"
	"github.com/rs/zerolog"
)

// API carries the dependencies the handlers need. It replaces the package
// level globals the handlers used before, which made the DB handle and the
// AI base URL impossible to configure or test.
type API struct {
	Store       store.Store
	Runner      *audit.Runner
	CrawlerBase string
	AIBase      string
	JWTSecret   []byte
	Log         zerolog.Logger
}
