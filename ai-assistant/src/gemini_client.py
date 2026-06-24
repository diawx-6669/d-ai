"""
gemini_client.py — Thin wrapper around the Groq API (OpenAI-compatible).
"""
from __future__ import annotations

import json
import os
import re
import textwrap
from typing import Generator

from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

_client = OpenAI(
    api_key=os.environ["GROQ_API_KEY"],
    base_url="https://api.groq.com/openai/v1",
)


def generate_report(crawl_json: dict) -> dict:
    """
    Given structured crawl data, ask the model to produce a full audit report.
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

    resp = _client.chat.completions.create(
        model=_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
    )

    text = resp.choices[0].message.content
    # strip possible markdown fences just in case
    text = re.sub(r"```(?:json)?", "", text).strip().rstrip("`")
    return json.loads(text)


def stream_chat(history: list[dict], user_message: str) -> Generator[str, None, None]:
    """
    Stream a chat reply from Groq.
    history = [{"role": "user"|"assistant", "content": str}, …]

    Note: Groq/OpenAI uses "assistant" role (not "model" like Gemini).
    If your existing history uses "model", convert it before passing here.
    """
    system_message = {
        "role": "system",
        "content": (
            "You are d-ai, an expert website auditor and developer assistant. "
            "Answer concisely and technically. Use markdown for code blocks."
        ),
    }

    # Normalise Gemini-style "model" role -> "assistant" just in case
    normalised_history = [
        {"role": "assistant" if m["role"] == "model" else m["role"],
         "content": m["content"] if isinstance(m["content"], str) else m["content"][0]}
        for m in history
    ]

    messages = [system_message] + normalised_history + [
        {"role": "user", "content": user_message}
    ]

    stream = _client.chat.completions.create(
        model=_MODEL,
        messages=messages,
        stream=True,
    )

    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta
