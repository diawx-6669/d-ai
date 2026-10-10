// Package config reads runtime configuration from the environment.
package config

import (
	"crypto/rand"
	"encoding/hex"
	"os"
	"strings"
)

type Config struct {
	Port        string
	DatabaseURL string
	JWTSecret   []byte
	// JWTSecretGenerated is true when no JWT_SECRET was provided and a random
	// one was generated for this process. Tokens then stop working across
	// restarts, which is worth warning about.
	JWTSecretGenerated bool
	CrawlerBase        string
	AIBase             string
	GinMode            string
}

func Load() (*Config, error) {
	cfg := &Config{
		Port:        env("PORT", "8080"),
		DatabaseURL: strings.TrimSpace(os.Getenv("DATABASE_URL")),
		CrawlerBase: strings.TrimRight(env("CRAWLER_SERVICE_BASE", "http://127.0.0.1:5001"), "/"),
		AIBase:      strings.TrimRight(env("AI_SERVICE_BASE", "http://127.0.0.1:5002"), "/"),
		GinMode:     env("GIN_MODE", "release"),
	}

	secret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	// "change_me_in_production" ships in .env.example; treat it as unset so a
	// real deployment never signs tokens with a public secret.
	if secret == "" || secret == "change_me_in_production" {
		buf := make([]byte, 32)
		if _, err := rand.Read(buf); err != nil {
			return nil, err
		}
		secret = hex.EncodeToString(buf)
		cfg.JWTSecretGenerated = true
	}
	cfg.JWTSecret = []byte(secret)

	return cfg, nil
}

func env(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}
