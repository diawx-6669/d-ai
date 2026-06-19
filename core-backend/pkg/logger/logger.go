package logger

import (
	"os"

	"github.com/rs/zerolog"
)

func New() zerolog.Logger {
	return zerolog.New(zerolog.ConsoleWriter{Out: os.Stdout}).
		With().
		Timestamp().
		Logger()
}
