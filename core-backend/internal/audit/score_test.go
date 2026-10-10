package audit

import (
	"strings"
	"testing"

	"github.com/d-ai/core-backend/internal/models"
)

func repeat(issue models.Issue, n int) []models.Issue {
	out := make([]models.Issue, n)
	for i := range out {
		out[i] = issue
	}
	return out
}

func TestScore(t *testing.T) {
	cases := []struct {
		name   string
		issues []models.Issue
		want   int
	}{
		{"clean", nil, 100},
		{"one critical", []models.Issue{{Severity: "critical"}}, 85},
		{"mixed", []models.Issue{{Severity: "critical"}, {Severity: "warning"}, {Severity: "info"}}, 76},
		{"clamped at zero", repeat(models.Issue{Severity: "critical"}, 10), 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := Score(tc.issues); got != tc.want {
				t.Fatalf("Score() = %d, want %d", got, tc.want)
			}
		})
	}
}

func TestFallbackRecommendations(t *testing.T) {
	got := FallbackRecommendations([]models.Issue{
		{Category: "seo"}, {Category: "security"}, {Category: "seo"},
	})
	if len(got) != 2 {
		t.Fatalf("got %d recommendations: %v", len(got), got)
	}
	// Security first, regardless of the order the issues arrived in.
	if !strings.Contains(got[0], "HTTPS") {
		t.Fatalf("expected security advice first, got %q", got[0])
	}

	if empty := FallbackRecommendations(nil); len(empty) != 1 {
		t.Fatalf("expected one fallback line for a clean site, got %v", empty)
	}
}
