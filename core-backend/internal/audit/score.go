package audit

import (
	"strings"

	"github.com/d-ai/core-backend/internal/models"
)

// Penalty per issue severity. Scores start at 100 and are clamped at 0.
const (
	penaltyCritical = 15
	penaltyWarning  = 7
	penaltyInfo     = 2
)

// Score turns the crawler's findings into a 0-100 number.
func Score(issues []models.Issue) int {
	score := 100
	for _, issue := range issues {
		switch strings.ToLower(issue.Severity) {
		case "critical", "high":
			score -= penaltyCritical
		case "warning", "medium":
			score -= penaltyWarning
		default:
			score -= penaltyInfo
		}
	}
	if score < 0 {
		return 0
	}
	return score
}

// categoryAdvice is the rule-based advice used when the AI service has no API
// key or is unreachable, so an audit is never an empty page.
var categoryAdvice = map[string]string{
	"seo":           "Проверьте <title>, meta description и структуру заголовков: один <h1> на страницу, остальные уровни по порядку.",
	"performance":   "Сожмите изображения, включите gzip/brotli и кеширование статики, вынесите inline-скрипты в отдельные файлы.",
	"security":      "Переведите сайт на HTTPS и добавьте заголовки Strict-Transport-Security, X-Content-Type-Options и Content-Security-Policy.",
	"accessibility": "Добавьте alt к изображениям, проверьте контраст текста и доступность с клавиатуры.",
}

// FallbackRecommendations derives advice from the issue categories that were
// actually found, in a stable order.
func FallbackRecommendations(issues []models.Issue) []string {
	order := []string{"security", "seo", "performance", "accessibility"}
	seen := make(map[string]bool, len(issues))
	for _, issue := range issues {
		seen[strings.ToLower(issue.Category)] = true
	}

	out := []string{}
	for _, category := range order {
		if seen[category] {
			if advice, ok := categoryAdvice[category]; ok {
				out = append(out, advice)
			}
		}
	}
	if len(out) == 0 {
		out = append(out, "Критичных проблем не найдено. Следите за скоростью загрузки и обновляйте метаданные при изменении контента.")
	}
	return out
}
