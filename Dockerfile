# Single-image build for Render: nginx + the Go API + both Python services.
#
# The previous version only shipped the Go binary and the React bundle, so in
# production nothing was listening on 5001/5002 and every audit and chat
# request failed with "service unavailable".

# ── Stage 1: Go API ────────────────────────────────────────────────────────
FROM golang:1.25-alpine AS backend-build
WORKDIR /src
COPY core-backend/go.mod core-backend/go.sum ./
RUN go mod download
COPY core-backend/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

# ── Stage 2: React bundle ──────────────────────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /src
COPY frontend-ui/package.json frontend-ui/package-lock.json ./
RUN npm ci
COPY frontend-ui/ ./
RUN npm run build

# ── Stage 3: Python dependencies ───────────────────────────────────────────
# Built separately so the compiler toolchain lxml needs does not end up in
# the runtime image.
FROM python:3.12-slim AS python-build
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc libxml2-dev libxslt1-dev \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /wheels
COPY crawler-engine/requirements.txt crawler.txt
COPY ai-assistant/requirements.txt ai.txt
RUN python -m venv /opt/venv \
 && /opt/venv/bin/pip install --upgrade pip \
 && /opt/venv/bin/pip install -r crawler.txt -r ai.txt

# ── Stage 4: runtime ───────────────────────────────────────────────────────
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONPATH=/app \
    GIN_MODE=release \
    BACKEND_PORT=8080 \
    CRAWLER_PORT=5001 \
    AI_PORT=5002 \
    PORT=8000

# libxml2/libxslt are the runtime halves of the lxml wheel; gettext provides
# envsubst, used to render the nginx config once $PORT is known.
RUN apt-get update \
 && apt-get install -y --no-install-recommends nginx gettext-base libxml2 libxslt1.1 curl \
 && rm -rf /var/lib/apt/lists/* \
 && rm -f /etc/nginx/sites-enabled/default

COPY --from=python-build /opt/venv /opt/venv
COPY --from=backend-build /out/server /usr/local/bin/d-ai-server
COPY --from=frontend-build /src/dist /usr/share/nginx/html

WORKDIR /app
COPY crawler-engine/src /app/crawler/src
COPY ai-assistant/src /app/ai/src
COPY ai-assistant/prompts /app/ai/prompts

# Shipped as a template with a literal ${PORT}; rendered at startup.
COPY nginx.conf.template /etc/nginx/templates/d-ai.conf.template
COPY system-tools/scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# nginx must be able to write its own temp files as a non-root user.
RUN useradd --system --create-home --shell /usr/sbin/nologin d-ai \
 && mkdir -p /var/cache/nginx /var/log/nginx /var/lib/nginx /run/nginx \
 && chown -R d-ai:d-ai /var/cache/nginx /var/log/nginx /var/lib/nginx /run/nginx /etc/nginx/conf.d
USER d-ai

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/health" > /dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
