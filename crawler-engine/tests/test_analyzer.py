from src.crawler import CrawlResult
from src.analyzer import analyze


def _base() -> CrawlResult:
    return CrawlResult(url="https://example.com", status_code=200, title="Test", meta_description="desc")


def test_missing_title():
    r = _base()
    r.title = None
    issues = analyze(r)
    severities = [i.severity for i in issues]
    assert "critical" in severities


def test_no_issues_clean_page():
    r = _base()
    r.headings = {"h1": ["Welcome"]}
    issues = analyze(r)
    assert all(i.severity != "critical" for i in issues)
