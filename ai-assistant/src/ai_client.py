"""
ai_client.py — thin wrapper around an OpenAI-compatible chat API (Groq by
default).

The client is created lazily. The previous version built it at import time
from os.environ["GROQ_API_KEY"], so a missing key raised KeyError while the
module was being imported -- gunicorn then failed to boot and the whole AI
service was dead rather than merely degraded.
"""
from __future__ import annotations

import json
import os
import re
import textwrap
from typing import Generator, Iterable

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

DEFAULT_MODEL = "llama-3.3-70b-versatile"
DEFAULT_BASE_URL = "https://api.groq.com/openai/v1"

SYSTEM_PROMPT = (
    "You are d-ai, an expert website auditor and developer assistant. "
    "Answer concisely and technically. Use markdown for code blocks. "
    "Reply in the language the user wrote in."
)

MAX_HISTORY_MESSAGES = 20
MAX_MESSAGE_CHARS = 8000


class MissingAPIKey(RuntimeError):
    """Raised when no API key is configured."""


def api_key() -> str | None:
    """
    Return the configured key.

    GEMINI_API_KEY is deliberately not accepted: this service talks to an
    OpenAI-compatible endpoint (Groq by default), where a Google key only
    produces a confusing 401 while the health check claims to be configured.
    """
    for name in ("GROQ_API_KEY", "AI_API_KEY"):
        value = os.getenv(name, "").strip()
        if value:
            return value
    return None


def model_name() -> str:
    return os.getenv("GROQ_MODEL", "").strip() or os.getenv("AI_MODEL", "").strip() or DEFAULT_MODEL


_client: OpenAI | None = None


def client() -> OpenAI:
    global _client
    if _client is None:
        key = api_key()
        if not key:
            raise MissingAPIKey(
                "AI-сервис не настроен: не задан GROQ_API_KEY. "
                "Аудит работает и без него, чат — нет."
            )
        _client = OpenAI(
            api_key=key,
            base_url=os.getenv("AI_BASE_URL", "").strip() or DEFAULT_BASE_URL,
        )
    return _client


def is_configured() -> bool:
    return api_key() is not None


def _extract_json(text: str) -> dict:
    """Parse a JSON object out of a model reply, tolerating markdown fences."""
    cleaned = re.sub(r"```(?:json)?", "", text).strip().strip("`").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Fall back to the outermost {...} block.
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not match:
            raise
        return json.loads(match.group(0))


def _as_str_list(value: object, limit: int = 12) -> list[str]:
    if isinstance(value, str):
        return [value]
    if not isinstance(value, Iterable):
        return []
    out: list[str] = []
    for item in value:
        if isinstance(item, str) and item.strip():
            out.append(item.strip())
        elif isinstance(item, dict):
            text = item.get("description") or item.get("text") or item.get("title")
            if isinstance(text, str) and text.strip():
                out.append(text.strip())
        if len(out) >= limit:
            break
    return out


def generate_report(crawl_data: dict) -> dict:
    """
    Turn structured crawl data into prose: a summary, recommendations, ideas.

    The measured issues come from the crawler and are not asked for here --
    the backend owns those and they must stay structured.
    """
    prompt = textwrap.dedent(
        f"""
        You are d-ai, an expert website auditor. Below is machine-collected
        analysis data for one web page.

        Return ONLY a valid JSON object, no markdown fences, with exactly
        these keys:
          "summary"         : one short paragraph describing the state of the page
          "recommendations" : array of 3-6 concrete, actionable fixes
          "ideas"           : array of 2-5 ideas that would improve the site

        Write the values in Russian.

        CRAWL DATA:
        {json.dumps(crawl_data, ensure_ascii=False)[:12000]}
        """
    )

    resp = client().chat.completions.create(
        model=model_name(),
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        response_format={"type": "json_object"},
    )

    data = _extract_json(resp.choices[0].message.content or "")
    summary = data.get("summary")
    return {
        "summary": summary.strip() if isinstance(summary, str) else "",
        "recommendations": _as_str_list(data.get("recommendations")),
        "ideas": _as_str_list(data.get("ideas")),
    }


def _normalise_history(history: object) -> list[dict]:
    """
    Accept the several history shapes the frontend has used over time:
    {"role","content"} and the Gemini-style {"role":"model","parts":[...]}.
    """
    if not isinstance(history, list):
        return []

    out: list[dict] = []
    for item in history[-MAX_HISTORY_MESSAGES:]:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        role = "assistant" if role in ("model", "assistant") else "user"

        content = item.get("content")
        if content is None:
            parts = item.get("parts")
            if isinstance(parts, list) and parts:
                content = parts[0]
        if isinstance(content, list) and content:
            content = content[0]
        if not isinstance(content, str) or not content.strip():
            continue

        out.append({"role": role, "content": content[:MAX_MESSAGE_CHARS]})
    return out


def _report_context(report: object) -> str | None:
    """Render the current audit report as context for the chat, if present."""
    if not isinstance(report, dict) or not report:
        return None
    keep = {k: report[k] for k in ("url", "score", "issues", "recommendations", "metrics") if k in report}
    if not keep:
        return None
    return (
        "Текущий отчёт аудита, о котором спрашивает пользователь "
        f"(JSON):\n{json.dumps(keep, ensure_ascii=False)[:6000]}"
    )


def stream_chat(history: object, user_message: str, report: object = None) -> Generator[str, None, None]:
    """Yield reply chunks from the model as they arrive."""
    messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]

    context = _report_context(report)
    if context:
        messages.append({"role": "system", "content": context})

    messages.extend(_normalise_history(history))
    messages.append({"role": "user", "content": user_message[:MAX_MESSAGE_CHARS]})

    stream = client().chat.completions.create(
        model=model_name(),
        messages=messages,
        stream=True,
    )

    for chunk in stream:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta
