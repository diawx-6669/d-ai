package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// CORS allows cross-origin API calls. In production the frontend is served
// from the same origin by nginx, so this only matters for local development
// (Vite on :3000 calling the API on :8080) and for API clients. No cookies
// are used -- the JWT travels in the Authorization header -- so a wildcard
// origin cannot be abused to make authenticated requests on a user's behalf.
func CORS() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type")
		c.Header("Access-Control-Max-Age", "86400")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
