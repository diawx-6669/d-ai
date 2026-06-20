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

	// Initialize DB from environment (DATABASE_URL). Fail fast if DB cannot be
	// initialized or migrations cannot be applied. This ensures the service does
	// not run in a degraded in-memory mode in production.
	if err := db.InitFromConnString(os.Getenv("DATABASE_URL")); err != nil {
		log.Fatal().Err(err).Msg("could not initialize DB")
	}
	if err := db.Migrate(); err != nil {
		log.Fatal().Err(err).Msg("db migration failed")
	}
	log.Info().Msg("db migration applied")

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

	// Health endpoint for readiness checks
	r.GET("/health", func(c *gin.Context) {
		if db.DB == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "db not initialized"})
			return
		}
		if err := db.DB.Ping(); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "db ping failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Info().Str("port", port).Msg("Listening")
	if err := r.Run(":" + port); err != nil {
		log.Fatal().Err(err).Msg("Server failed")
	}
}
