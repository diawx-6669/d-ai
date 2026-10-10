package audit

import (
	"strings"
	"testing"
)

func TestNormalizeTargetAcceptsBareHost(t *testing.T) {
	got, err := NormalizeTarget("  example.com/path  ")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "https://example.com/path" {
		t.Fatalf("got %q", got)
	}
}

func TestNormalizeTargetRejects(t *testing.T) {
	cases := []string{
		"",
		"ftp://example.com",
		"http://localhost:8080",
		"http://127.0.0.1/admin",
		"http://169.254.169.254/latest/meta-data/",
		"http://10.0.0.5",
		"http://192.168.1.1",
		"http://[::1]:8080",
		"http://notadomain",
		"http://metadata.internal",
	}
	for _, raw := range cases {
		if got, err := NormalizeTarget(raw); err == nil {
			t.Errorf("NormalizeTarget(%q) = %q, want error", raw, got)
		}
	}
}

func TestNormalizeTargetAllowPrivateOptIn(t *testing.T) {
	t.Setenv("CRAWLER_ALLOW_PRIVATE", "1")
	got, err := NormalizeTarget("http://127.0.0.1:8777/page")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "http://127.0.0.1:8777/page" {
		t.Fatalf("got %q", got)
	}
}

func TestNormalizeTargetStillRejectsBadSchemeWhenPrivateAllowed(t *testing.T) {
	t.Setenv("CRAWLER_ALLOW_PRIVATE", "1")
	if _, err := NormalizeTarget("file:///etc/passwd"); err == nil {
		t.Fatal("expected an error for a file:// target")
	}
}

func TestReasonIsUserFacing(t *testing.T) {
	cases := map[string]string{
		"not a url at all":  "это не похоже на адрес сайта",
		"ftp://example.com": "поддерживаются только http и https",
		"http://127.0.0.1":  "внутренние адреса недоступны",
		"":                  "укажите адрес сайта",
	}
	for raw, want := range cases {
		_, err := NormalizeTarget(raw)
		if err == nil {
			t.Fatalf("NormalizeTarget(%q) unexpectedly succeeded", raw)
		}
		if got := Reason(err); got != want {
			t.Errorf("Reason for %q = %q, want %q", raw, got, want)
		}
		// The internal wrapper must never reach the user.
		if strings.Contains(Reason(err), "invalid target url") {
			t.Errorf("Reason for %q leaked the wrapper: %q", raw, Reason(err))
		}
	}
}
