FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

COPY . .

ENV FLASK_APP=src/app.py
ENV PYTHONPATH=/app

CMD ["gunicorn", "src.app:app", "--bind", "0.0.0.0:5002", "--workers", "1", "--timeout", "60"]
