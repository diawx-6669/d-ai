package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/d-ai/core-backend/internal/api/handlers"
	"github.com/d-ai/core-backend/internal/audit"
	"github.com/d-ai/core-backend/internal/config"
	"github.com/d-ai/core-backend/internal/middleware"
	"github.com/d-ai/core-backend/internal/store"
	"github.com/d-ai/core-backend/pkg/logger"
	"github.com/gin-gonic/gin"
)

func main() {
	log := logger.New()
	log.Info().Msg("d-ai core-backend starting …")

	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("could not load configuration")
	}
	gin.SetMode(cfg.GinMode)

	if cfg.JWTSecretGenerated {
		log.Warn().Msg("JWT_SECRET is not set — generated a random one; " +
			"issued tokens will stop working after a restart")
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// A missing DATABASE_URL is a supported mode, not a fatal error: the app
	// falls back to an in-memory store so the site stays usable. A bad URL is
	// still fatal, because that is a broken deployment rather than a choice.
	st, err := store.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal().Err(err).Msg("DATABASE_URL is set but the database is unreachable")
	}
	defer st.Close()

	if st.Kind() == "memory" {
		log.Warn().Msg("DATABASE_URL is not set — using the in-memory store; " +
			"accounts and audits are lost on restart")
	} else {
		log.Info().Str("store", st.Kind()).Msg("database ready")
	}

	runner := audit.NewRunner(st, cfg.CrawlerBase, cfg.AIBase, log)
	api := &handlers.API{
		Store:       st,
		Runner:      runner,
		CrawlerBase: cfg.CrawlerBase,
		AIBase:      cfg.AIBase,
		JWTSecret:   cfg.JWTSecret,
		Log:         log,
	}

	r := gin.New()
	r.Use(gin.Recovery(), middleware.CORS(), middleware.RequestLogger(log))

	r.GET("/health", api.Health)
	r.GET("/api/health", api.Health)

	r.POST("/api/auth/login", api.Login)
	r.POST("/api/auth/register", api.Register)

	authed := r.Group("/api")
	authed.Use(middleware.JWTAuth(cfg.JWTSecret))
	{
		authed.POST("/audit", api.StartAudit)
		authed.GET("/audit/:id", api.GetAudit)
		authed.GET("/history", api.GetHistory)
		authed.POST("/chat", api.ChatProxy)
	}

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
		// No WriteTimeout: /api/chat streams a long-lived SSE response and a
		// write deadline would cut replies off mid-sentence.
	}

	go func() {
		log.Info().Str("port", cfg.Port).Msg("listening")
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal().Err(err).Msg("server failed")
		}
	}()

	<-ctx.Done()
	log.Info().Msg("shutting down …")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("graceful shutdown failed")
	}
}
