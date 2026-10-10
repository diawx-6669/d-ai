import pytest

from src import safety
from src.safety import UnsafeTarget, normalize_target


@pytest.fixture(autouse=True)
def public_dns(monkeypatch):
    """
    Resolve every hostname to a public address.

    The real resolver is patched out so the suite does not depend on DNS (or
    on any particular domain still existing). IP literals skip the resolver
    entirely, so the blocked-address cases below are unaffected.
    """
    monkeypatch.delenv("CRAWLER_ALLOW_PRIVATE", raising=False)
    for name in ("http_proxy", "HTTP_PROXY", "https_proxy", "HTTPS_PROXY"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(safety, "_resolve", lambda host, port: ["93.184.216.34"])


def test_bare_host_gets_https():
    assert normalize_target("example.com") == "https://example.com"


def test_fragment_is_dropped():
    assert normalize_target("https://example.com/page#section") == "https://example.com/page"


def test_query_string_is_preserved():
    assert normalize_target("https://example.com/s?q=1") == "https://example.com/s?q=1"


@pytest.mark.parametrize(
    "url",
    [
        "",
        "   ",
        "ftp://example.com",
        "file:///etc/passwd",
        "javascript:alert(1)",
        "http://localhost:8080",
        "http://127.0.0.1/admin",
        "http://[::1]/",
        "http://169.254.169.254/latest/meta-data/",
        "http://10.1.2.3",
        "http://192.168.0.1",
        "http://172.16.0.1",
        "http://0.0.0.0",
        "http://100.64.0.1",
        "http://[::ffff:127.0.0.1]/",
        "http://api.internal/secret",
        "http://box.local",
    ],
)
def test_unsafe_targets_are_rejected(url):
    with pytest.raises(UnsafeTarget):
        normalize_target(url)


def test_public_name_resolving_to_private_address_is_rejected(monkeypatch):
    monkeypatch.setattr(safety, "_resolve", lambda host, port: ["127.0.0.1"])
    with pytest.raises(UnsafeTarget):
        normalize_target("https://rebind.example.com")


def test_unresolvable_host_is_rejected(monkeypatch):
    def boom(host, port):
        raise UnsafeTarget(f"домен {host} не найден")

    monkeypatch.setattr(safety, "_resolve", boom)
    with pytest.raises(UnsafeTarget):
        normalize_target("https://nope.example.com")


def test_allow_private_opt_in_permits_loopback(monkeypatch):
    monkeypatch.setenv("CRAWLER_ALLOW_PRIVATE", "1")
    assert normalize_target("http://127.0.0.1:8099/page") == "http://127.0.0.1:8099/page"


def test_behind_a_proxy_dns_is_not_required(monkeypatch):
    monkeypatch.setenv("HTTPS_PROXY", "http://proxy.local:3128")
    monkeypatch.setattr(safety, "_resolve", lambda host, port: pytest.fail("resolver must not be called"))
    assert normalize_target("https://example.com") == "https://example.com"
