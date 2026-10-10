package handlers

import (
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/d-ai/core-backend/internal/store"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

const (
	tokenTTL          = 24 * time.Hour
	minPasswordLength = 8
	maxPasswordLength = 72 // bcrypt silently ignores anything past 72 bytes
	maxUsernameLength = 32
)

type credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// A fixed hash to compare against when the user does not exist, so that
// "unknown user" and "wrong password" take the same time to answer.
var dummyHash = []byte("$2a$12$VBSTLlNQWaG2.D9BXZD3y.8fQ8iy5S5TpBU/a1SzEBEJdfRmmttNa")

func (a *API) Login(c *gin.Context) {
	var body credentials
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Укажите имя пользователя и пароль"})
		return
	}
	body.Username = strings.TrimSpace(body.Username)
	if body.Username == "" || body.Password == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Укажите имя пользователя и пароль"})
		return
	}

	user, err := a.Store.UserByUsername(c.Request.Context(), body.Username)
	if errors.Is(err, store.ErrNotFound) {
		bcrypt.CompareHashAndPassword(dummyHash, []byte(body.Password))
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Неверный логин или пароль"})
		return
	}
	if err != nil {
		a.Log.Error().Err(err).Msg("login: store lookup failed")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера, попробуйте позже"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(body.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Неверный логин или пароль"})
		return
	}

	token, err := a.signToken(user.Username)
	if err != nil {
		a.Log.Error().Err(err).Msg("login: could not sign token")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось выдать токен"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token, "username": user.Username})
}

func (a *API) Register(c *gin.Context) {
	var body credentials
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Укажите имя пользователя и пароль"})
		return
	}
	body.Username = strings.TrimSpace(body.Username)

	if msg := validateCredentials(body); msg != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
	if err != nil {
		a.Log.Error().Err(err).Msg("register: hashing failed")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сервера, попробуйте позже"})
		return
	}

	user, err := a.Store.CreateUser(c.Request.Context(), body.Username, string(hash))
	if errors.Is(err, store.ErrUserExists) {
		c.JSON(http.StatusConflict, gin.H{"error": "Это имя пользователя уже занято"})
		return
	}
	if err != nil {
		a.Log.Error().Err(err).Msg("register: could not create user")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось создать пользователя"})
		return
	}

	token, err := a.signToken(user.Username)
	if err != nil {
		a.Log.Error().Err(err).Msg("register: could not sign token")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось выдать токен"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"token": token, "username": user.Username})
}

func validateCredentials(body credentials) string {
	switch {
	case body.Username == "":
		return "Укажите имя пользователя"
	case utf8.RuneCountInString(body.Username) > maxUsernameLength:
		return "Имя пользователя не длиннее 32 символов"
	case len(body.Password) < minPasswordLength:
		return "Пароль должен быть не короче 8 символов"
	case len(body.Password) > maxPasswordLength:
		return "Пароль не длиннее 72 символов"
	}
	return ""
}

func (a *API) signToken(username string) (string, error) {
	now := time.Now()
	claims := jwt.MapClaims{
		"sub": username,
		"iat": now.Unix(),
		"exp": now.Add(tokenTTL).Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(a.JWTSecret)
}
