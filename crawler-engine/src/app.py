"""
app.py — Flask microservice exposing the crawler over HTTP.
"""
from flask import Flask, jsonify, request
from .crawler import crawl
from .analyzer import analyze

app = Flask(__name__)


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/crawl")
def crawl_endpoint():
    data = request.get_json(force=True)
    url = data.get("url", "").strip()
    if not url:
        return jsonify({"error": "url is required"}), 400

    result = crawl(url)
    issues = analyze(result)

    return jsonify({
        "url": result.url,
        "status_code": result.status_code,
        "title": result.title,
        "meta_description": result.meta_description,
        "headings": result.headings,
        "images_without_alt": result.images_without_alt,
        "inline_scripts": result.inline_scripts,
        "page_size_bytes": result.page_size_bytes,
        "load_time_ms": result.load_time_ms,
        "issues": [{"severity": i.severity, "category": i.category, "description": i.description} for i in issues],
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001)
