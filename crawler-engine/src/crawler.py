"""
crawler.py — Fetches and parses target websites for the d-ai audit engine.
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup


@dataclass
class CrawlResult:
    url: str
    status_code: int
    title: Optional[str]
    meta_description: Optional[str]
    headings: dict[str, list[str]] = field(default_factory=dict)
    images_without_alt: list[str] = field(default_factory=list)
    broken_links: list[str] = field(default_factory=list)
    inline_scripts: int = 0
    inline_styles: int = 0
    external_stylesheets: list[str] = field(default_factory=list)
    page_size_bytes: int = 0
    load_time_ms: float = 0.0
    html_raw: str = ""


def crawl(url: str, timeout: int = 30) -> CrawlResult:
    """Fetch *url* and return a structured CrawlResult."""
    headers = {"User-Agent": "d-ai/1.0 (+https://github.com/d-ai)"}
    t0 = time.perf_counter()

    resp = requests.get(url, headers=headers, timeout=timeout, allow_redirects=True)
    load_ms = (time.perf_counter() - t0) * 1000
    soup = BeautifulSoup(resp.text, "lxml")

    result = CrawlResult(
        url=resp.url,
        status_code=resp.status_code,
        title=soup.title.string.strip() if soup.title else None,
        meta_description=_meta(soup, "description"),
        page_size_bytes=len(resp.content),
        load_time_ms=round(load_ms, 2),
        html_raw=resp.text,
    )

    # Headings
    for tag in ("h1", "h2", "h3"):
        result.headings[tag] = [h.get_text(strip=True) for h in soup.find_all(tag)]

    # Images without alt
    result.images_without_alt = [
        img.get("src", "") for img in soup.find_all("img") if not img.get("alt")
    ]

    # Inline counts
    result.inline_scripts = len(soup.find_all("script", src=False))
    result.inline_styles = len(soup.find_all("style"))

    # External stylesheets
    result.external_stylesheets = [
        link["href"]
        for link in soup.find_all("link", rel="stylesheet")
        if link.get("href")
    ]

    return result


def _meta(soup: BeautifulSoup, name: str) -> Optional[str]:
    tag = soup.find("meta", attrs={"name": name})
    return tag["content"].strip() if tag and tag.get("content") else None
