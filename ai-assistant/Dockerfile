FROM python:3.12-slim AS build
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
COPY requirements.txt .
RUN python -m venv /opt/venv && /opt/venv/bin/pip install -r requirements.txt

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PATH="/opt/venv/bin:$PATH"
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --no-create-home --shell /usr/sbin/nologin d-ai
COPY --from=build /opt/venv /opt/venv
WORKDIR /app
COPY src ./src
COPY prompts ./prompts
USER d-ai
EXPOSE 5002
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:5002/health > /dev/null || exit 1
# Threads, not just workers: each open chat holds one for the whole SSE stream.
CMD ["gunicorn", "src.app:app", "--bind", "0.0.0.0:5002", "--workers", "2", "--threads", "8", "--timeout", "180", "--access-logfile", "-"]
