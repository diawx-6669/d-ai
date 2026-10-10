package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// JWTAuth validates the bearer token and stores the subject as "userID".
//
// The secret is injected rather than read from the environment on every
// request, and the accepted algorithm is pinned to HS256 so a token can never
// be presented with a different (or absent) signing method.
func JWTAuth(secret []byte) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Нужна авторизация"})
			return
		}
		raw := strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))

		token, err := jwt.Parse(raw, func(*jwt.Token) (interface{}, error) {
			return secret, nil
		}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Сессия истекла, войдите заново"})
			return
		}

		subject, err := token.Claims.GetSubject()
		if err != nil || subject == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Некорректный токен"})
			return
		}

		c.Set("userID", subject)
		c.Next()
	}
}
