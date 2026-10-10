package audit

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"strings"
)

// ErrInvalidTarget wraps every rejection from NormalizeTarget. The wrapped
// message is written for the person who typed the URL, so handlers can show
// it as-is rather than translating error strings.
var ErrInvalidTarget = errors.New("invalid target url")

func invalid(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalidTarget, fmt.Sprintf(format, args...))
}

// Reason returns the user-facing part of an ErrInvalidTarget, without the
// internal wrapper prefix.
func Reason(err error) string {
	msg := err.Error()
	const prefix = "invalid target url: "
	if strings.HasPrefix(msg, prefix) {
		return strings.TrimPrefix(msg, prefix)
	}
	return msg
}

// NormalizeTarget validates a user-supplied URL and returns its canonical
// form. A bare host like "example.com" is accepted and upgraded to https.
//
// It also refuses to point the crawler at loopback or private addresses.
// The crawler runs next to the backend on localhost, so without this check a
// user could ask it to fetch http://127.0.0.1:8080 or a cloud metadata
// endpoint and read back the response (SSRF).
func NormalizeTarget(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", invalid("укажите адрес сайта")
	}
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}

	u, err := url.Parse(raw)
	if err != nil {
		return "", invalid("это не похоже на адрес сайта")
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", invalid("поддерживаются только http и https")
	}

	host := u.Hostname()
	if host == "" {
		return "", invalid("в адресе нет имени сайта")
	}
	if strings.ContainsAny(host, " \t") {
		return "", invalid("в адресе есть пробелы")
	}
	if _, err := net.LookupPort("tcp", u.Port()); u.Port() != "" && err != nil {
		return "", invalid("некорректный порт в адресе")
	}

	if !allowPrivate() {
		if !strings.Contains(host, ".") && !isIP(host) {
			return "", invalid("%q не похоже на доменное имя", host)
		}
		if isBlockedHost(host) {
			return "", invalid("внутренние адреса недоступны")
		}
	}

	u.Fragment = ""
	return u.String(), nil
}

// allowPrivate mirrors the crawler's CRAWLER_ALLOW_PRIVATE switch, so a
// developer auditing a site on their own machine is not blocked by this
// layer while the crawler would have allowed it. Off by default; never turn
// it on for a public deployment.
func allowPrivate() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("CRAWLER_ALLOW_PRIVATE"))) {
	case "1", "true", "yes":
		return true
	}
	return false
}

func isIP(host string) bool {
	return net.ParseIP(host) != nil
}

// isBlockedHost reports whether host resolves to an address the crawler must
// not touch. The crawler re-checks this after its own DNS lookup, which is
// what actually closes the DNS-rebinding window; this pass rejects the
// obvious cases early so the user gets a clear error instead of a failed job.
func isBlockedHost(host string) bool {
	lower := strings.ToLower(strings.TrimSuffix(host, "."))
	if lower == "localhost" || strings.HasSuffix(lower, ".localhost") ||
		strings.HasSuffix(lower, ".local") || strings.HasSuffix(lower, ".internal") {
		return true
	}
	if ip := net.ParseIP(lower); ip != nil {
		return isBlockedIP(ip)
	}
	// Resolution failures are left to the crawler, which reports a real error.
	addrs, err := net.LookupIP(lower)
	if err != nil {
		return false
	}
	for _, ip := range addrs {
		if isBlockedIP(ip) {
			return true
		}
	}
	return false
}

func isBlockedIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() ||
		ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsMulticast() {
		return true
	}
	// 100.64.0.0/10 (carrier NAT, used by some container platforms).
	if v4 := ip.To4(); v4 != nil && v4[0] == 100 && v4[1] >= 64 && v4[1] <= 127 {
		return true
	}
	return false
}
