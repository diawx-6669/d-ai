"""
analyzer.py — Converts a CrawlResult into a list of structured issues.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .crawler import CrawlResult

Severity = Literal["critical", "warning", "info"]
Category = Literal["seo", "performance", "security", "accessibility"]


@dataclass
class Issue:
    severity: Severity
    category: Category
    description: str


def analyze(result: CrawlResult) -> list[Issue]:
    issues: list[Issue] = []

    # — SEO ——————————————————————————————————————————————
    if not result.title:
        issues.append(Issue("critical", "seo", "Page is missing a <title> tag."))
    elif len(result.title) > 60:
        issues.append(Issue("warning", "seo", f"Title is {len(result.title)} chars (recommended ≤60)."))

    if not result.meta_description:
        issues.append(Issue("warning", "seo", "Meta description is missing."))

    h1s = result.headings.get("h1", [])
    if len(h1s) == 0:
        issues.append(Issue("critical", "seo", "No <h1> heading found."))
    elif len(h1s) > 1:
        issues.append(Issue("warning", "seo", f"Multiple <h1> tags found ({len(h1s)})."))

    # — Accessibility ————————————————————————————————————
    if result.images_without_alt:
        n = len(result.images_without_alt)
        issues.append(Issue("warning", "accessibility", f"{n} image(s) missing alt attribute."))

    # — Performance ——————————————————————————————————————
    if result.load_time_ms > 3000:
        issues.append(Issue("critical", "performance", f"Load time {result.load_time_ms:.0f} ms exceeds 3 s."))
    elif result.load_time_ms > 1500:
        issues.append(Issue("warning", "performance", f"Load time {result.load_time_ms:.0f} ms is above 1.5 s."))

    if result.page_size_bytes > 2_000_000:
        kb = result.page_size_bytes // 1024
        issues.append(Issue("warning", "performance", f"Page size {kb} KB exceeds 2 MB."))

    if result.inline_scripts > 5:
        issues.append(Issue("info", "performance", f"{result.inline_scripts} inline <script> blocks — consider externalizing."))

    # — Security ——————————————————————————————————————
    if "https" not in result.url:
        issues.append(Issue("critical", "security", "Site is not served over HTTPS."))

    return issues
