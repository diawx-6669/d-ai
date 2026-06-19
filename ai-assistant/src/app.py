"""
app.py — Flask microservice for the AI assistant.
"""
import json
from flask import Flask, Response, jsonify, request, stream_with_context
from flask_cors import CORS
from .gemini_client import generate_report, stream_chat

app = Flask(__name__)
CORS(app)


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
        for chunk in stream_chat(history, message):
            yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        yield "data: [DONE]\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002)
