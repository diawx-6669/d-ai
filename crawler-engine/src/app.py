"""
app.py — Flask microservice exposing the crawler over HTTP.
"""
from __future__ import annotations

import logging
import os

from flask import Flask, jsonify, request

from .analyzer import analyze
from .crawler import CrawlError, crawl
from .safety import UnsafeTarget

DEFAULT_TIMEOUT = int(os.getenv("CRAWLER_TIMEOUT", "30"))

app = Flask(__name__)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("crawler-engine")


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/crawl")
def crawl_endpoint():
    data = request.get_json(force=True, silent=True) or {}
    url = (data.get("url") or "").strip()
    if not url:
        return jsonify({"error": "url is required"}), 400

    try:
        result = crawl(url, timeout=DEFAULT_TIMEOUT)
    except UnsafeTarget as exc:
        return jsonify({"error": str(exc)}), 400
    except CrawlError as exc:
        # 502: the target site is the problem, not this service.
        return jsonify({"error": str(exc)}), 502
    except Exception as exc:
        log.exception("crawl failed for %s", url)
        return jsonify({"error": f"внутренняя ошибка краулера: {exc}"}), 500

    issues = analyze(result)

    return jsonify({
        "url": result.url,
        "status_code": result.status_code,
        "title": result.title,
        "meta_description": result.meta_description,
        "headings": result.headings,
        "images_without_alt": result.images_without_alt,
        "inline_scripts": result.inline_scripts,
        "inline_styles": result.inline_styles,
        "external_stylesheets": result.external_stylesheets,
        "page_size_bytes": result.page_size_bytes,
        "load_time_ms": result.load_time_ms,
        "https": result.https,
        "truncated": result.truncated,
        "issues": [
            {"severity": i.severity, "category": i.category, "description": i.description}
            for i in issues
        ],
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("CRAWLER_PORT", "5001")))
