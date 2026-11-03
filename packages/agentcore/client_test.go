package agentcore

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"golang.org/x/mod/sumdb/note"
)

// controlPlane is a fake control plane that checks every request the way GOpenCDR's api does:
// the assertion verifies under the agent's key, and its claims name this origin, the method, the
// path and the body exactly as received.
type controlPlane struct {
	t      *testing.T
	key    *Key
	server *httptest.Server
	hits   atomic.Int32
	route  func(w http.ResponseWriter, r *http.Request, header map[string]any, claims Claims, body []byte)
}

func newControlPlane(t *testing.T, key *Key) *controlPlane {
	cp := &controlPlane{t: t, key: key}
	cp.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cp.hits.Add(1)
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Error(err)
			return
		}
		if r.Header.Get("Content-Encoding") != "" {
			t.Errorf("request carries Content-Encoding %q", r.Header.Get("Content-Encoding"))
		}
		if r.URL.RawQuery != "" {
			t.Errorf("request carries a query %q", r.URL.RawQuery)
		}
		header, claims := decodeAssertion(t, key, r.Header.Get("Authorization"))
		switch {
		case claims.Audience != cp.server.URL:
			t.Errorf("aud %s, want %s", claims.Audience, cp.server.URL)
		case claims.Method != r.Method || claims.Path != r.URL.Path:
			t.Errorf("claims name %s %s, request is %s %s", claims.Method, claims.Path, r.Method, r.URL.Path)
		case claims.BodySHA256 != BodyHash(body):
			t.Error("bodySha256 is not the body received")
		}
		cp.route(w, r, header, claims, body)
	}))
	t.Cleanup(cp.server.Close)
	return cp
}

func (cp *controlPlane) client(issuer string) *Client {
	return &Client{
		Origin:    cp.server.URL,
		Signer:    &Signer{Key: cp.key, Scheme: gopencdrMirror, Audience: cp.server.URL, Issuer: issuer},
		UserAgent: "agentcore-test/0.0.0",
	}
}

func problem(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Problem{Type: "urn:gocdr:problem:" + code, Title: "t", Status: status, Code: code})
}

func TestClientEnrolSignsWithTheNewKey(t *testing.T) {
	_, key := readMirrorVectors(t)
	cp := newControlPlane(t, key)
	cp.route = func(w http.ResponseWriter, r *http.Request, header map[string]any, claims Claims, body []byte) {
		if header["jwk"] == nil || header["kid"] != nil || claims.Issuer != "" {
			t.Errorf("enrolment header %v, iss %q", header, claims.Issuer)
		}
		if string(body) != `{"token":"gcdr_enrol_Vq8Lm2Tx9Rk4Hn7Wc1Zp6Jd3Fb5Gs0Ye","agentVersion":"1.4.3"}` {
			t.Errorf("body %s", body)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = io.WriteString(w, `{"mirrorId":"cmr0mirror6k1m4p8x2q5w7z","keyId":"`+key.ID()+`"}`)
	}
	var out struct {
		MirrorID string `json:"mirrorId"`
		KeyID    string `json:"keyId"`
	}
	body := struct {
		Token        string `json:"token"`
		AgentVersion string `json:"agentVersion"`
	}{"gcdr_enrol_Vq8Lm2Tx9Rk4Hn7Wc1Zp6Jd3Fb5Gs0Ye", "1.4.3"}
	if err := cp.client("").Enrol(context.Background(), "/api/v1/mirrors/enrolments", body, &out); err != nil {
		t.Fatal(err)
	}
	if out.MirrorID != "cmr0mirror6k1m4p8x2q5w7z" || out.KeyID != key.ID() {
		t.Errorf("answer %+v", out)
	}
}

func TestClientFetchBundleWithETag(t *testing.T) {
	_, key := readMirrorVectors(t)
	skey, vkey, err := note.GenerateKey(rand.Reader, testNoteName)
	if err != nil {
		t.Fatal(err)
	}
	signer, _ := note.NewSigner(skey)
	signed, err := note.Sign(&note.Note{Text: "{\"serial\":5}\n"}, signer)
	if err != nil {
		t.Fatal(err)
	}
	cp := newControlPlane(t, key)
	cp.route = func(w http.ResponseWriter, r *http.Request, header map[string]any, claims Claims, body []byte) {
		if header["kid"] != key.ID() || claims.Issuer != "cmr0mirror6k1m4p8x2q5w7z" {
			t.Errorf("header %v, iss %q", header, claims.Issuer)
		}
		w.Header().Set("ETag", `"5"`)
		if r.Header.Get("If-None-Match") == `"5"` {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write(signed)
	}
	c := cp.client("cmr0mirror6k1m4p8x2q5w7z")
	first, err := c.FetchBundle(context.Background(), "/api/v1/mirrors/self/bundle", "")
	if err != nil {
		t.Fatal(err)
	}
	if first.NotModified || first.ETag != `"5"` {
		t.Fatalf("first fetch %+v", first)
	}
	v, _ := NewBundleVerifier(vkey)
	b, err := v.Open(first.Note)
	if err != nil || b.Serial != 5 {
		t.Fatalf("the fetched note: %v", err)
	}
	second, err := c.FetchBundle(context.Background(), "/api/v1/mirrors/self/bundle", first.ETag)
	if err != nil {
		t.Fatal(err)
	}
	if !second.NotModified || second.Note != nil || second.ETag != `"5"` {
		t.Fatalf("second fetch %+v", second)
	}
}

func TestClientRefusalsCarryTheProblemAndRetryAfter(t *testing.T) {
	_, key := readMirrorVectors(t)
	cp := newControlPlane(t, key)
	cp.route = func(w http.ResponseWriter, r *http.Request, _ map[string]any, _ Claims, _ []byte) {
		switch r.URL.Path {
		case "/api/v1/mirrors/self/bundle":
			w.Header().Set("Retry-After", "30")
			problem(w, http.StatusServiceUnavailable, "mirror.bundle_pending")
		case "/api/v1/mirrors/self/reports":
			w.Header().Set("Retry-After", time.Now().Add(20*time.Minute).UTC().Format(http.TimeFormat))
			problem(w, http.StatusTooManyRequests, "request.rate_limited")
		}
	}
	c := cp.client("cmr0mirror6k1m4p8x2q5w7z")

	_, err := c.FetchBundle(context.Background(), "/api/v1/mirrors/self/bundle", "")
	var se *StatusError
	if !errors.As(err, &se) || se.StatusCode != 503 || se.Code() != "mirror.bundle_pending" || se.RetryAfter != 30*time.Second {
		t.Fatalf("503: %v", err)
	}
	if d := PollDelay(5*time.Minute, 0, err); d != 5*time.Minute {
		t.Errorf("a Retry-After shorter than the interval moved the poll to %s", d)
	}
	if d := PollDelay(10*time.Second, 0, err); d != 30*time.Second {
		t.Errorf("a Retry-After of 30s left the poll at %s", d)
	}

	err = c.PostJSON(context.Background(), "/api/v1/mirrors/self/reports", map[string]int{"n": 1}, nil)
	if !errors.As(err, &se) || se.StatusCode != 429 || se.Code() != "request.rate_limited" {
		t.Fatalf("429: %v", err)
	}
	if se.RetryAfter < 19*time.Minute || se.RetryAfter > 20*time.Minute {
		t.Errorf("an HTTP-date Retry-After read as %s", se.RetryAfter)
	}
	if d := PollDelay(5*time.Minute, time.Minute, err); d != se.RetryAfter {
		t.Errorf("poll delay %s, want the Retry-After %s", d, se.RetryAfter)
	}
}

func TestClientPostJSONAcceptsNoContent(t *testing.T) {
	_, key := readMirrorVectors(t)
	cp := newControlPlane(t, key)
	cp.route = func(w http.ResponseWriter, _ *http.Request, _ map[string]any, _ Claims, body []byte) {
		if string(body) != `{"a":"<b>&"}` {
			t.Errorf("body %s, want it unescaped as signed", body)
		}
		w.WriteHeader(http.StatusNoContent)
	}
	if err := cp.client("cmr0mirror6k1m4p8x2q5w7z").PostJSON(context.Background(), "/api/v1/mirrors/self/reports", map[string]string{"a": "<b>&"}, nil); err != nil {
		t.Fatal(err)
	}
}

func TestClientRefusesAQueryBeforeSending(t *testing.T) {
	_, key := readMirrorVectors(t)
	cp := newControlPlane(t, key)
	cp.route = func(http.ResponseWriter, *http.Request, map[string]any, Claims, []byte) {}
	c := cp.client("cmr0mirror6k1m4p8x2q5w7z")
	if _, err := c.FetchBundle(context.Background(), "/api/v1/mirrors/self/bundle?wait=30", ""); err == nil {
		t.Fatal("a path with a query was sent")
	}
	if cp.hits.Load() != 0 {
		t.Error("the control plane was reached")
	}
}

func TestNewHTTPClientLeavesFromTheLocalAddress(t *testing.T) {
	seen := make(chan string, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host, _, _ := net.SplitHostPort(r.RemoteAddr)
		seen <- host
	}))
	defer server.Close()

	resp, err := NewHTTPClient(netip.MustParseAddr("127.0.0.1")).Get(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	_ = resp.Body.Close()
	if host := <-seen; host != "127.0.0.1" {
		t.Errorf("the request left from %s", host)
	}

	// An address this host does not hold cannot be bound, which shows the dialer binds at all.
	_, err = NewHTTPClient(netip.MustParseAddr("192.0.2.1")).Get(server.URL)
	if err == nil || !strings.Contains(err.Error(), "192.0.2.1") {
		t.Errorf("binding to an address the host does not hold: %v", err)
	}
}

func TestRetryAfterIgnoresWhatItCannotRead(t *testing.T) {
	now := time.Date(2026, 10, 2, 14, 5, 0, 0, time.UTC)
	for v, want := range map[string]time.Duration{
		"":                              0,
		"soon":                          0,
		"-5":                            0,
		"120":                           2 * time.Minute,
		"Fri, 02 Oct 2026 14:06:00 GMT": time.Minute,
		"Fri, 02 Oct 2026 14:04:00 GMT": 0,
	} {
		h := http.Header{}
		if v != "" {
			h.Set("Retry-After", v)
		}
		if got := RetryAfter(h, now); got != want {
			t.Errorf("Retry-After %q: %s, want %s", v, got, want)
		}
	}
}

func TestClientDoesNotFollowRedirects(t *testing.T) {
	_, key := readMirrorVectors(t)
	cp := newControlPlane(t, key)
	cp.route = func(w http.ResponseWriter, r *http.Request, _ map[string]any, _ Claims, _ []byte) {
		http.Redirect(w, r, "/api/v1/mirrors/self/elsewhere", http.StatusFound)
	}
	c := cp.client("cmr0mirror6k1m4p8x2q5w7z")
	c.HTTP = NewHTTPClient(netip.Addr{})
	_, err := c.FetchBundle(context.Background(), "/api/v1/mirrors/self/bundle", "")
	var se *StatusError
	if !errors.As(err, &se) || se.StatusCode != http.StatusFound {
		t.Fatalf("got %v, want the 302 itself", err)
	}
	if cp.hits.Load() != 1 {
		t.Errorf("%d requests reached the control plane, want 1", cp.hits.Load())
	}
}

func TestClientFetchReturnsTheRawBodyWithinItsCap(t *testing.T) {
	_, key := readMirrorVectors(t)
	zone := []byte("$ORIGIN example.\n@ 3600 IN SOA a. b. 7 1 1 1 1\n")
	cp := newControlPlane(t, key)
	cp.route = func(w http.ResponseWriter, r *http.Request, header map[string]any, claims Claims, body []byte) {
		switch r.URL.Path {
		case "/api/v1/mirrors/self/zones/example/7":
			w.Header().Set("ETag", `"z7"`)
			if r.Header.Get("If-None-Match") == `"z7"` {
				w.WriteHeader(http.StatusNotModified)
				return
			}
			_, _ = w.Write(zone)
		default:
			problem(w, http.StatusNotFound, "request.not_found")
		}
	}
	c := cp.client("cmr0mirror6k1m4p8x2q5w7z")
	ctx := context.Background()
	got, err := c.Fetch(ctx, "/api/v1/mirrors/self/zones/example/7", "", 1024)
	if err != nil || got.Status != http.StatusOK || string(got.Body) != string(zone) || got.ETag != `"z7"` {
		t.Fatalf("fetch = %+v, %v", got, err)
	}
	same, err := c.Fetch(ctx, "/api/v1/mirrors/self/zones/example/7", got.ETag, 1024)
	if err != nil || same.Status != http.StatusNotModified || same.Body != nil || same.ETag != `"z7"` {
		t.Fatalf("conditional fetch = %+v, %v", same, err)
	}
	if _, err := c.Fetch(ctx, "/api/v1/mirrors/self/zones/example/7", "", int64(len(zone)-1)); err == nil {
		t.Fatal("a body over the cap came back")
	}
	var se *StatusError
	if _, err := c.Fetch(ctx, "/api/v1/mirrors/self/zones/missing/1", "", 1024); !errors.As(err, &se) || se.Code() != "request.not_found" {
		t.Fatalf("a refusal = %v", err)
	}
	if _, err := c.Fetch(ctx, "/api/v1/mirrors/self/zones/example/7", "", 0); err == nil {
		t.Fatal("a fetch without a cap went out")
	}
}
