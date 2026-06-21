"""
app.py — Flask microservice for the AI assistant.
"""
import json
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from flask import Flask, Response, jsonify, request, stream_with_context
from flask_cors import CORS
from .gemini_client import generate_report, stream_chat

app = Flask(__name__)
CORS(app)

CHAT_TIMEOUT_SEC = 25  # должен быть меньше таймаута на фронте (30s)
_executor = ThreadPoolExecutor(max_workers=4)


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/report")
def report():
    data = request.get_json(force=True)
    crawl_data = data.get("crawl_data", {})
    try:
        result = generate_report(crawl_data)
        return jsonify(result)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.post("/chat")
def chat():
    data = request.get_json(force=True)
    history = data.get("history", [])
    message = data.get("message", "")

    def generate():
        # Собираем все чанки в отдельном потоке с таймаутом
        chunk_queue = []
        error_holder = []

        def collect():
            try:
                for chunk in stream_chat(history, message):
                    chunk_queue.append(chunk)
                    yield  # просто маркер прогресса — не используется
            except Exception as e:
                error_holder.append(str(e))

        future = _executor.submit(lambda: list(stream_chat(history, message)))

        try:
            chunks = future.result(timeout=CHAT_TIMEOUT_SEC)
            for chunk in chunks:
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        except FuturesTimeoutError:
            future.cancel()
            yield f"data: {json.dumps({'error': 'Сервер не успел ответить за 25 секунд. Попробуйте позже.'})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002)
