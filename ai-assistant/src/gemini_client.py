"""
gemini_client.py — Thin wrapper around the Google Generative AI SDK.
"""
from __future__ import annotations

import os
import textwrap
from typing import Generator

import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

genai.configure(api_key=os.environ["GEMINI_API_KEY"])
_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")


def _model() -> genai.GenerativeModel:
    return genai.GenerativeModel(_MODEL)


def generate_report(crawl_json: dict) -> dict:
    """
    Given structured crawl data, ask Gemini to produce a full audit report.
    Returns a dict with keys: issues, recommendations, ideas.
    """
    prompt = textwrap.dedent(f"""
        You are d-ai, an expert website auditor.
        Below is raw analysis data for a website. Produce a JSON response with exactly
        three keys:
          - "issues"           : list of strings describing problems found (use the data below)
          - "recommendations"  : list of actionable improvement suggestions
          - "ideas"            : list of creative feature/UX ideas that would enhance the site

        Return ONLY valid JSON, no markdown fences.

        CRAWL DATA:
        {crawl_json}
    """)
    model = _model()
    resp = model.generate_content(prompt)
    import json, re
    text = resp.text
    # strip possible markdown fences
    text = re.sub(r"```(?:json)?", "", text).strip().rstrip("`")
    return json.loads(text)


def stream_chat(history: list[dict], user_message: str) -> Generator[str, None, None]:
    """
    Stream a chat reply from Gemini.
    history = [{"role": "user"|"model", "parts": [str]}, …]
    """
    system = (
        "You are d-ai, an expert website auditor and developer assistant. "
        "Answer concisely and technically. Use markdown for code blocks."
    )
    model = _model()
    chat = model.start_chat(history=history)
    resp = chat.send_message(user_message, stream=True)
    for chunk in resp:
        yield chunk.text
