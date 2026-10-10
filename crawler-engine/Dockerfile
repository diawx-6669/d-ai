FROM python:3.12-slim AS build
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc libxml2-dev libxslt1-dev \
 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN python -m venv /opt/venv && /opt/venv/bin/pip install -r requirements.txt

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PATH="/opt/venv/bin:$PATH"
RUN apt-get update \
 && apt-get install -y --no-install-recommends libxml2 libxslt1.1 curl \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --no-create-home --shell /usr/sbin/nologin d-ai
COPY --from=build /opt/venv /opt/venv
WORKDIR /app
COPY src ./src
USER d-ai
EXPOSE 5001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:5001/health > /dev/null || exit 1
CMD ["gunicorn", "src.app:app", "--bind", "0.0.0.0:5001", "--workers", "2", "--threads", "4", "--timeout", "90", "--access-logfile", "-"]
