package db

import (
	"database/sql"
	"errors"
	_ "github.com/lib/pq"
)

// DB is the global database handle used across handlers.
// It may be nil if the server is started without a configured database.
var DB *sql.DB

// InitFromConnString opens a Postgres connection from the provided connection string.
// If connStr is empty, this is a no-op.
func InitFromConnString(connStr string) error {
	if connStr == "" {
		return nil
	}
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return err
	}
	if err := db.Ping(); err != nil {
		db.Close()
		return err
	}
	DB = db
	return nil
}

// Migrate ensures required tables exist. Returns an error if DB is not initialized.
func Migrate() error {
	if DB == nil {
		return errors.New("db not initialized")
	}
	_, err := DB.Exec(`
		CREATE TABLE IF NOT EXISTS users (
			id SERIAL PRIMARY KEY,
			username TEXT UNIQUE NOT NULL,
			password_hash TEXT NOT NULL,
			created_at TIMESTAMPTZ DEFAULT now()
		)
	`)
	return err
}
