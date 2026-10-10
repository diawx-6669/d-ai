package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

const dependencyProbeTimeout = 3 * time.Second

// Health reports whether the backend and its dependencies are up.
//
// It always answers 200 as long as the process can serve traffic: the audit
// pipeline degrades gracefully when the crawler or the AI service is down, so
// a platform health check should not restart the container over it. The body
// says which parts are actually healthy.
func (a *API) Health(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), dependencyProbeTimeout)
	defer cancel()

	storeStatus := "ok"
	if err := a.Store.Ping(ctx); err != nil {
		storeStatus = "unavailable: " + err.Error()
	}

	c.JSON(http.StatusOK, gin.H{
		"status": "ok",
		"store": gin.H{
			"kind":   a.Store.Kind(),
			"status": storeStatus,
		},
		"crawler": probe(ctx, a.CrawlerBase+"/health"),
		"ai":      probe(ctx, a.AIBase+"/health"),
	})
}

func probe(ctx context.Context, url string) string {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "unavailable"
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "unavailable"
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "unhealthy"
	}
	return "ok"
}
