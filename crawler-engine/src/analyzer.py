"""
analyzer.py — Converts a CrawlResult into a list of structured issues.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .crawler import CrawlResult

Severity = Literal["critical", "warning", "info"]
Category = Literal["seo", "performance", "security", "accessibility"]

TITLE_MAX_LEN = 60
META_MIN_LEN = 50
META_MAX_LEN = 160
SLOW_MS = 3000
SLUGGISH_MS = 1500
LARGE_PAGE_BYTES = 2_000_000
INLINE_SCRIPT_LIMIT = 5


@dataclass
class Issue:
    severity: Severity
    category: Category
    description: str


def analyze(result: CrawlResult) -> list[Issue]:
    issues: list[Issue] = []

    # — HTTP status ———————————————————————————————————————
    if result.status_code >= 500:
        issues.append(Issue("critical", "performance", f"Сервер ответил {result.status_code}."))
    elif result.status_code >= 400:
        issues.append(Issue("critical", "seo", f"Страница отдаёт {result.status_code} — она недоступна для посетителей и поисковиков."))

    # — SEO ———————————————————————————————————————————————
    if not result.title:
        issues.append(Issue("critical", "seo", "У страницы нет тега <title>."))
    elif len(result.title) > TITLE_MAX_LEN:
        issues.append(Issue("warning", "seo", f"Заголовок страницы — {len(result.title)} символов (рекомендуется до {TITLE_MAX_LEN})."))

    if not result.meta_description:
        issues.append(Issue("warning", "seo", "Не заполнен meta description."))
    elif len(result.meta_description) < META_MIN_LEN:
        issues.append(Issue("info", "seo", f"Meta description очень короткий — {len(result.meta_description)} символов (оптимально {META_MIN_LEN}–{META_MAX_LEN})."))
    elif len(result.meta_description) > META_MAX_LEN:
        issues.append(Issue("info", "seo", f"Meta description длиннее {META_MAX_LEN} символов — поисковик обрежет его в выдаче."))

    h1s = result.headings.get("h1", [])
    if len(h1s) == 0:
        issues.append(Issue("critical", "seo", "На странице нет заголовка <h1>."))
    elif len(h1s) > 1:
        issues.append(Issue("warning", "seo", f"Несколько тегов <h1> на одной странице ({len(h1s)})."))

    # — Accessibility ——————————————————————————————————————
    if result.images_without_alt:
        count = len(result.images_without_alt)
        issues.append(Issue("warning", "accessibility", f"У {count} изображений нет атрибута alt."))

    # — Performance ————————————————————————————————————————
    if result.load_time_ms > SLOW_MS:
        issues.append(Issue("critical", "performance", f"Страница загружалась {result.load_time_ms:.0f} мс — это больше 3 с."))
    elif result.load_time_ms > SLUGGISH_MS:
        issues.append(Issue("warning", "performance", f"Страница загружалась {result.load_time_ms:.0f} мс — это больше 1,5 с."))

    if result.page_size_bytes > LARGE_PAGE_BYTES:
        issues.append(Issue("warning", "performance", f"Размер HTML — {result.page_size_bytes // 1024} КБ, больше 2 МБ."))

    if result.inline_scripts > INLINE_SCRIPT_LIMIT:
        issues.append(Issue("info", "performance", f"{result.inline_scripts} inline-блоков <script> — их стоит вынести в отдельные файлы."))

    # — Security ———————————————————————————————————————————
    if not result.https:
        issues.append(Issue("critical", "security", "Сайт отдаётся не по HTTPS."))

    return issues
