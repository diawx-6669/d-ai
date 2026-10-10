"""
app.py — Flask microservice for the AI assistant.
"""
from __future__ import annotations

import json
import logging
import time

from flask import Flask, Response, jsonify, request, stream_with_context
from flask_cors import CORS

from .ai_client import MissingAPIKey, generate_report, is_configured, model_name, stream_chat

# Keep this below the proxy's own deadline (60 s in core-backend) so the
# browser gets a proper SSE error event instead of a dropped connection.
CHAT_DEADLINE_SEC = 50

app = Flask(__name__)
CORS(app)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("ai-assistant")


def sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@app.get("/health")
def health():
    return jsonify({
        "status": "ok",
        "configured": is_configured(),
        "model": model_name(),
    })


@app.post("/report")
def report():
    data = request.get_json(force=True, silent=True) or {}
    crawl_data = data.get("crawl_data") or {}
    if not crawl_data:
        return jsonify({"error": "crawl_data is required"}), 400

    try:
        return jsonify(generate_report(crawl_data))
    except MissingAPIKey as exc:
        # 503 and not 500: the caller falls back to rule-based advice.
        return jsonify({"error": str(exc)}), 503
    except Exception as exc:
        log.exception("report generation failed")
        return jsonify({"error": f"AI не смог сформировать отчёт: {exc}"}), 502


@app.post("/chat")
def chat():
    data = request.get_json(force=True, silent=True) or {}
    message = (data.get("message") or "").strip()
    history = data.get("history") or []
    audit_report = data.get("report")

    if not message:
        return jsonify({"error": "Пустой запрос"}), 400
    if not is_configured():
        return jsonify({
            "error": "AI-чат не настроен: на сервере не задан GROQ_API_KEY.",
        }), 503

    def generate():
        # Chunks are forwarded as they arrive. The previous version collected
        # the whole reply with list(...) before sending anything, so nothing
        # actually streamed and a slow answer always hit the timeout.
        started = time.monotonic()
        sent_any = False
        try:
            for chunk in stream_chat(history, message, audit_report):
                yield sse({"chunk": chunk})
                sent_any = True
                if time.monotonic() - started > CHAT_DEADLINE_SEC:
                    yield sse({"error": "Ответ оказался слишком длинным и был прерван по таймауту."})
                    break
            if not sent_any:
                yield sse({"error": "AI вернул пустой ответ. Попробуйте переформулировать."})
        except MissingAPIKey as exc:
            yield sse({"error": str(exc)})
        except Exception as exc:
            log.exception("chat stream failed")
            yield sse({"error": f"Ошибка AI-сервиса: {exc}"})
        finally:
            yield "data: [DONE]\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002)
