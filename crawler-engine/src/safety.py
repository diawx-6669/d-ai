"""
safety.py — target validation for the crawler.

The crawler fetches whatever URL a user types, and in the production image it
runs on the same host as the API. Without these checks a user could point it
at http://127.0.0.1:8080 or a cloud metadata endpoint and read the response
back through the audit report (SSRF). The hostname is resolved here and every
resulting address is checked, which also covers a public name that resolves
to a private address.
"""
from __future__ import annotations

import ipaddress
import os
import socket
from urllib.parse import urlparse, urlunparse

ALLOWED_SCHEMES = ("http", "https")
BLOCKED_SUFFIXES = (".localhost", ".local", ".internal", ".home.arpa")

# 100.64.0.0/10 is carrier-grade NAT, used for internal addressing by some
# container platforms.
EXTRA_BLOCKED_NETS = (ipaddress.ip_network("100.64.0.0/10"),)


class UnsafeTarget(ValueError):
    """The requested URL must not be fetched."""


def allow_private() -> bool:
    """
    Whether private and loopback targets are permitted.

    Off by default. Turn it on with CRAWLER_ALLOW_PRIVATE=1 only for local
    development, when you want to audit a site running on your own machine.
    Never enable it on a public deployment: it re-opens the SSRF hole this
    module exists to close.
    """
    return os.getenv("CRAWLER_ALLOW_PRIVATE", "").strip().lower() in ("1", "true", "yes")


def _proxy_configured(scheme: str) -> bool:
    """
    Whether outbound requests go through an HTTP proxy.

    Behind a proxy the client never resolves the hostname -- the proxy does --
    so a local DNS lookup here proves nothing and would reject every target in
    environments where DNS is not reachable directly. The proxy also cannot
    reach this container's loopback interface, so dropping the lookup does not
    re-open the hole it guards.
    """
    names = ("https_proxy", "HTTPS_PROXY") if scheme == "https" else ("http_proxy", "HTTP_PROXY")
    return any(os.getenv(name, "").strip() for name in names)


def _is_blocked_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        return _is_blocked_ip(ip.ipv4_mapped)
    if (
        ip.is_loopback
        or ip.is_private
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    ):
        return True
    return any(ip in net for net in EXTRA_BLOCKED_NETS if ip.version == net.version)


def _resolve(host: str, port: int) -> list[str]:
    """Return every address *host* resolves to. Patched in tests."""
    try:
        infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise UnsafeTarget(f"домен {host} не найден") from exc
    return [info[4][0] for info in infos]


def normalize_target(raw: str) -> str:
    """Validate and canonicalise a user-supplied URL."""
    raw = (raw or "").strip()
    if not raw:
        raise UnsafeTarget("укажите адрес сайта")
    if "://" not in raw:
        raw = "https://" + raw

    parsed = urlparse(raw)
    if parsed.scheme not in ALLOWED_SCHEMES:
        raise UnsafeTarget("поддерживаются только http и https")

    host = (parsed.hostname or "").rstrip(".").lower()
    if not host:
        raise UnsafeTarget("в адресе нет имени хоста")

    try:
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
    except ValueError as exc:
        raise UnsafeTarget("некорректный порт в адресе") from exc

    # Drop the fragment: it never reaches the server anyway.
    canonical = urlunparse(parsed._replace(fragment=""))

    if allow_private():
        return canonical

    if host == "localhost" or host.endswith(BLOCKED_SUFFIXES):
        raise UnsafeTarget("внутренние адреса недоступны")

    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        literal = None

    if literal is not None:
        addresses = [literal]
    elif _proxy_configured(parsed.scheme):
        addresses = []
    else:
        addresses = [ipaddress.ip_address(addr) for addr in _resolve(host, port)]
        if not addresses:
            raise UnsafeTarget(f"домен {host} не найден")

    for ip in addresses:
        if _is_blocked_ip(ip):
            raise UnsafeTarget("внутренние адреса недоступны")

    return canonical
