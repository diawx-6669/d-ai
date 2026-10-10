from src.analyzer import analyze
from src.crawler import CrawlResult


def _base() -> CrawlResult:
    return CrawlResult(
        url="https://example.com",
        status_code=200,
        title="Test page",
        meta_description="A description long enough to pass the minimum length check easily.",
        headings={"h1": ["Welcome"]},
        https=True,
    )


def _categories(issues):
    return {i.category for i in issues}


def test_clean_page_has_no_critical_issues():
    assert all(i.severity != "critical" for i in analyze(_base()))


def test_missing_title_is_critical():
    page = _base()
    page.title = None
    assert any(i.severity == "critical" and i.category == "seo" for i in analyze(page))


def test_missing_h1_is_critical():
    page = _base()
    page.headings = {"h1": []}
    assert any("h1" in i.description.lower() for i in analyze(page))


def test_plain_http_is_a_security_issue():
    page = _base()
    page.https = False
    page.url = "http://example.com"
    assert "security" in _categories(analyze(page))


def test_https_in_hostname_does_not_count_as_tls():
    # The old check was `"https" not in url`, so this URL looked secure.
    page = _base()
    page.https = False
    page.url = "http://https.example.com"
    assert "security" in _categories(analyze(page))


def test_error_status_is_reported():
    page = _base()
    page.status_code = 404
    assert any(i.severity == "critical" for i in analyze(page))


def test_slow_page_is_critical():
    page = _base()
    page.load_time_ms = 4200
    assert any(i.category == "performance" and i.severity == "critical" for i in analyze(page))


def test_images_without_alt_are_reported():
    page = _base()
    page.images_without_alt = ["/a.png", "/b.png"]
    assert "accessibility" in _categories(analyze(page))
