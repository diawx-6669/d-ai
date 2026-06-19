package handlers

import (
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/d-ai/core-backend/internal/db"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// Fallback in-memory user store for local/testing when db.DB is nil.
var (
	localUsers = map[string]string{} // username -> bcrypt hash
	usersMu    sync.Mutex
)

type loginBody struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type registerBody struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// Login validates credentials against the DB and returns a signed JWT.
func Login(c *gin.Context) {
	var body loginBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username and password required"})
		return
	}

	// Fetch the stored password hash from the DB or local store.
	var hashedPassword string
	if db.DB != nil {
		row := db.DB.QueryRow("SELECT password_hash FROM users WHERE username = $1", body.Username)
		if err := row.Scan(&hashedPassword); err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
			return
		}
	} else {
		usersMu.Lock()
		hp, ok := localUsers[body.Username]
		usersMu.Unlock()
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
			return
		}
		hashedPassword = hp
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(body.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	token, err := signToken(body.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not sign token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"token": token})
}

// Register hashes the password and stores the new user in the DB.
func Register(c *gin.Context) {
	var body registerBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username and password required"})
		return
	}

	// Check that the username is not already taken.
	if db.DB != nil {
		var exists bool
		row := db.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE username = $1)", body.Username)
		if err := row.Scan(&exists); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
			return
		}
		if exists {
			c.JSON(http.StatusConflict, gin.H{"error": "username already taken"})
			return
		}
	} else {
		usersMu.Lock()
		_, exists := localUsers[body.Username]
		usersMu.Unlock()
		if exists {
			c.JSON(http.StatusConflict, gin.H{"error": "username already taken"})
			return
		}
	}

	// Hash password with bcrypt (cost 12 is a reasonable default).
	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), 12)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not hash password"})
		return
	}

	// Insert the new user into DB or local store.
	if db.DB != nil {
		_, err = db.DB.Exec(
			"INSERT INTO users (username, password_hash, created_at) VALUES ($1, $2, NOW())",
			body.Username, string(hash),
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create user"})
			return
		}
	} else {
		usersMu.Lock()
		localUsers[body.Username] = string(hash)
		usersMu.Unlock()
	}

	token, err := signToken(body.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not sign token"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"token": token})
}

// signToken is a shared helper so Login and Register use the same JWT logic.
func signToken(username string) (string, error) {
	claims := jwt.MapClaims{
		"sub": username,
		"exp": time.Now().Add(24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(os.Getenv("JWT_SECRET")))
}
