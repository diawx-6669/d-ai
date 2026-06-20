package main

import (
	"os"

	"github.com/d-ai/core-backend/internal/api/handlers"
	"github.com/d-ai/core-backend/internal/db"
	"github.com/d-ai/core-backend/internal/middleware"
	"github.com/d-ai/core-backend/pkg/logger"
	"github.com/gin-gonic/gin"
)

func main() {
	log := logger.New()
	log.Info().Msg("🛡️  d-ai core-backend starting …")

	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(middleware.CORS())
	r.Use(middleware.RequestLogger(log))

	// Initialize DB from environment (DATABASE_URL). If initialization fails
	// we log a warning and continue — handlers have an in-memory fallback.
	if err := db.InitFromConnString(os.Getenv("DATABASE_URL")); err != nil {
		log.Warn().Err(err).Msg("could not initialize DB; continuing with in-memory store")
	} else {
		if err := db.Migrate(); err != nil {
			log.Error().Err(err).Msg("db migration failed")
		} else {
			log.Info().Msg("db migration applied")
		}
	}

	// Public routes
	r.POST("/api/auth/login", handlers.Login)
	r.POST("/api/auth/register", handlers.Register)

	// Protected routes
	auth := r.Group("/api")
	auth.Use(middleware.JWTAuth())
	{
		auth.POST("/audit", handlers.StartAudit)
		auth.GET("/audit/:id", handlers.GetAudit)
		auth.GET("/history", handlers.GetHistory)
		auth.GET("/ws", handlers.WebSocketHandler)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Info().Str("port", port).Msg("Listening")
	if err := r.Run(":" + port); err != nil {
		log.Fatal().Err(err).Msg("Server failed")
	}
}
