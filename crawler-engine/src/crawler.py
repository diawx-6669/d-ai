"""
crawler.py — Fetches and parses target websites for the d-ai audit engine.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Optional

import requests
from bs4 import BeautifulSoup

from .safety import normalize_target

log = logging.getLogger(__name__)

USER_AGENT = "d-ai/1.0 (+https://github.com/diawx-6669/d-ai)"

# Parse at most this much HTML. A multi-megabyte page would otherwise make
# BeautifulSoup chew through memory on a small container.
MAX_BYTES = 5 * 1024 * 1024


class CrawlError(RuntimeError):
    """The page could not be fetched."""


@dataclass
class CrawlResult:
    url: str
    status_code: int
    title: Optional[str]
    meta_description: Optional[str]
    headings: dict[str, list[str]] = field(default_factory=dict)
    images_without_alt: list[str] = field(default_factory=list)
    inline_scripts: int = 0
    inline_styles: int = 0
    external_stylesheets: list[str] = field(default_factory=list)
    page_size_bytes: int = 0
    load_time_ms: float = 0.0
    https: bool = False
    truncated: bool = False


def _pick_parser() -> str:
    """Prefer lxml, fall back to the stdlib parser if it is not installed."""
    try:
        import lxml  # noqa: F401
    except ImportError:
        return "html.parser"
    return "lxml"


def crawl(url: str, timeout: int = 30) -> CrawlResult:
    """Fetch *url* and return a structured CrawlResult."""
    target = normalize_target(url)
    started = time.perf_counter()

    try:
        resp = requests.get(
            target,
            headers={"User-Agent": USER_AGENT, "Accept": "text/html,*/*"},
            timeout=timeout,
            allow_redirects=True,
            stream=True,
        )
        body = resp.raw.read(MAX_BYTES + 1, decode_content=True) or b""
    except requests.exceptions.SSLError as exc:
        raise CrawlError(f"ошибка TLS-сертификата: {exc}") from exc
    except requests.exceptions.ConnectTimeout as exc:
        raise CrawlError("сайт не ответил на подключение вовремя") from exc
    except requests.exceptions.ReadTimeout as exc:
        raise CrawlError(f"сайт не ответил за {timeout} с") from exc
    except requests.exceptions.TooManyRedirects as exc:
        raise CrawlError("слишком много перенаправлений") from exc
    except requests.exceptions.ConnectionError as exc:
        # The underlying urllib3 message is a wall of nested exception text;
        # it belongs in the log, not in the user's report.
        log.warning("connection error for %s: %s", target, exc)
        raise CrawlError("сайт не отвечает — проверьте адрес") from exc
    except requests.RequestException as exc:
        log.warning("request failed for %s: %s", target, exc)
        raise CrawlError("не удалось загрузить страницу") from exc
    finally:
        load_ms = (time.perf_counter() - started) * 1000

    truncated = len(body) > MAX_BYTES
    body = body[:MAX_BYTES]

    # A redirect chain can leave the allow-list; re-check where we ended up.
    final_url = resp.url
    normalize_target(final_url)

    encoding = resp.encoding or resp.apparent_encoding or "utf-8"
    html = body.decode(encoding, errors="replace")
    soup = BeautifulSoup(html, _pick_parser())

    result = CrawlResult(
        url=final_url,
        status_code=resp.status_code,
        title=soup.title.get_text(strip=True) if soup.title else None,
        meta_description=_meta(soup, "description"),
        page_size_bytes=len(body),
        load_time_ms=round(load_ms, 2),
        https=final_url.lower().startswith("https://"),
        truncated=truncated,
    )

    for tag in ("h1", "h2", "h3"):
        result.headings[tag] = [h.get_text(strip=True) for h in soup.find_all(tag)]

    result.images_without_alt = [
        img.get("src", "") for img in soup.find_all("img") if not img.get("alt")
    ][:50]

    result.inline_scripts = len(soup.find_all("script", src=False))
    result.inline_styles = len(soup.find_all("style"))
    result.external_stylesheets = [
        link["href"] for link in soup.find_all("link", rel="stylesheet") if link.get("href")
    ][:50]

    return result


def _meta(soup: BeautifulSoup, name: str) -> Optional[str]:
    tag = soup.find("meta", attrs={"name": name})
    if tag and tag.get("content"):
        return tag["content"].strip()
    return None
