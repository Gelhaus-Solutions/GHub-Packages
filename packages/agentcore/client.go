package agentcore

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/rand/v2"
	"mime"
	"net"
	"net/http"
	"net/netip"
	"strconv"
	"strings"
	"time"
)

// maxErrorBody caps what the client reads of a refusal.
const maxErrorBody = 64 << 10

// MaxBundleWait is the longest a bundle fetch asks the control plane to hold it for a newer
// bundle (RFC 7240's Prefer: wait). The assertion is checked when the request arrives, so a held
// request outlives its 60 seconds without harm.
const MaxBundleWait = 60 * time.Second

// Client talks to one control plane: every request is signed, carries no query string and no
// Content-Encoding, and its body is sent exactly as it was hashed.
type Client struct {
	// Origin is the control plane's origin, such as https://cdr.gplatform.org. Requests go to
	// Origin plus their path; the signer's audience is normally the same origin.
	Origin string
	Signer *Signer
	// HTTP sends the requests; nil means a client from NewHTTPClient with no local address.
	HTTP *http.Client
	// UserAgent names the agent and its version, such as gocdr-mirror/1.4.3.
	UserAgent string
}

// NewHTTPClient returns an HTTP client for the agent. With a valid local address every
// connection leaves from it, so a report can prove the agent answers on that address; the zero
// Addr lets the system choose.
func NewHTTPClient(local netip.Addr) *http.Client {
	dialer := &net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}
	if local.IsValid() {
		dialer.LocalAddr = &net.TCPAddr{IP: local.AsSlice(), Zone: local.Zone()}
	}
	transport := &http.Transport{
		Proxy:               http.ProxyFromEnvironment,
		DialContext:         dialer.DialContext,
		ForceAttemptHTTP2:   true,
		MaxIdleConns:        4,
		IdleConnTimeout:     90 * time.Second,
		TLSHandshakeTimeout: 10 * time.Second,
		// A held bundle fetch answers only when the bundle changes or its wait runs out.
		ResponseHeaderTimeout: 30*time.Second + MaxBundleWait,
	}
	if local.IsValid() {
		// A proxy would make the connection leave from the proxy, which proves nothing.
		transport.Proxy = nil
	}
	return &http.Client{
		Transport: transport,
		Timeout:   60*time.Second + MaxBundleWait,
		// A signed request names its path, so a redirect could only be refused at its target, or
		// carry the assertion somewhere it was not meant for. A 3xx is returned as a StatusError.
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
}

// Problem is an RFC 9457 problem+json body, with the stable code the Gelhaus Open control planes
// add to every refusal.
type Problem struct {
	Type     string `json:"type"`
	Title    string `json:"title"`
	Status   int    `json:"status"`
	Code     string `json:"code"`
	Detail   string `json:"detail,omitempty"`
	Instance string `json:"instance,omitempty"`
	TraceID  string `json:"traceId,omitempty"`
}

// StatusError is a response the agent did not expect: a refusal, a rate limit, or a control
// plane that is not ready. RetryAfter is what the Retry-After header asked for, zero if none.
type StatusError struct {
	Method     string
	Path       string
	StatusCode int
	RetryAfter time.Duration
	// Problem is the problem+json body, nil when the response carried none.
	Problem *Problem
}

func (e *StatusError) Error() string {
	msg := fmt.Sprintf("agentcore: %s %s answered %d", e.Method, e.Path, e.StatusCode)
	if e.Problem != nil && e.Problem.Code != "" {
		msg += " " + e.Problem.Code
		if e.Problem.Detail != "" {
			msg += ": " + e.Problem.Detail
		}
	}
	if e.RetryAfter > 0 {
		msg += fmt.Sprintf(" (retry after %s)", e.RetryAfter)
	}
	return msg
}

// Code returns the problem code, or the empty string.
func (e *StatusError) Code() string {
	if e.Problem == nil {
		return ""
	}
	return e.Problem.Code
}

// Enrol posts an enrolment request: body, marshalled once and sent exactly as signed, with an
// assertion that names the agent's new public key. The answer is decoded into out.
func (c *Client) Enrol(ctx context.Context, path string, body, out any) error {
	raw, err := encodeJSON(body)
	if err != nil {
		return err
	}
	resp, err := c.do(ctx, http.MethodPost, path, raw, nil, true)
	if err != nil {
		return err
	}
	return decodeJSONResponse(resp, out, http.StatusOK, http.StatusCreated)
}

// PostJSON posts body as JSON, signed, and decodes a JSON answer into out unless out is nil.
func (c *Client) PostJSON(ctx context.Context, path string, body, out any) error {
	raw, err := encodeJSON(body)
	if err != nil {
		return err
	}
	resp, err := c.do(ctx, http.MethodPost, path, raw, nil, false)
	if err != nil {
		return err
	}
	return decodeJSONResponse(resp, out, http.StatusOK, http.StatusCreated, http.StatusAccepted, http.StatusNoContent)
}

// GetJSON fetches path, signed, and decodes the JSON answer into out.
func (c *Client) GetJSON(ctx context.Context, path string, out any) error {
	resp, err := c.do(ctx, http.MethodGet, path, nil, nil, false)
	if err != nil {
		return err
	}
	return decodeJSONResponse(resp, out, http.StatusOK)
}

// FetchResult is what one bundle fetch brought.
type FetchResult struct {
	// NotModified is true when the control plane still holds the bundle named by the ETag sent.
	NotModified bool
	// Note is the signed note, not yet verified; nil when NotModified.
	Note []byte
	// ETag is the response's entity tag, to send next time.
	ETag string
	// Held is true when the control plane says it applied the wait asked for (Preference-Applied
	// names wait), so it answered once the bundle changed or the wait ran out, and the agent may
	// ask again at once. A control plane that answers without it is polled at the agent's interval.
	Held bool
}

// FetchBundle fetches the signed bundle at path, sending etag as If-None-Match when it is not
// empty. It does not verify the note; BundleVerifier.Open does, and SerialFloor.Accept decides
// whether it is new.
func (c *Client) FetchBundle(ctx context.Context, path, etag string) (*FetchResult, error) {
	return c.FetchBundleWait(ctx, path, etag, 0)
}

// FetchBundleWait is FetchBundle asking the control plane, with Prefer: wait, to hold the request
// for up to wait while the bundle is still the one etag names, and to answer as soon as it is
// not. Without an etag there is nothing to wait for, and nothing is asked. A wait is whole
// seconds, at most MaxBundleWait; zero asks none.
func (c *Client) FetchBundleWait(ctx context.Context, path, etag string, wait time.Duration) (*FetchResult, error) {
	if wait < 0 || wait > MaxBundleWait {
		return nil, fmt.Errorf("agentcore: a bundle wait of %s is not between 0 and %s", wait, MaxBundleWait)
	}
	var h http.Header
	if etag != "" {
		h = http.Header{"If-None-Match": {etag}}
		if seconds := int(wait / time.Second); seconds > 0 {
			h.Set("Prefer", "wait="+strconv.Itoa(seconds))
		}
	}
	f, err := c.fetch(ctx, path, h, MaxBundleSize, "bundle")
	if err != nil {
		return nil, err
	}
	if f.Status == http.StatusNotModified && f.ETag == "" {
		f.ETag = etag
	}
	held := h.Get("Prefer") != "" && waitApplied(f.Header)
	if f.Status == http.StatusNotModified {
		return &FetchResult{NotModified: true, ETag: f.ETag, Held: held}, nil
	}
	return &FetchResult{Note: f.Body, ETag: f.ETag, Held: held}, nil
}

// waitApplied reports whether a Preference-Applied header names the wait preference.
func waitApplied(h http.Header) bool {
	for _, v := range h.Values("Preference-Applied") {
		for _, pref := range strings.Split(v, ",") {
			name, _, _ := strings.Cut(strings.TrimSpace(pref), "=")
			if strings.EqualFold(strings.TrimSpace(name), "wait") {
				return true
			}
		}
	}
	return false
}

// Fetched is what a raw fetch brought: the status, 200 or, for an entity unchanged since the
// ETag sent, 304 with no body; the body exactly as sent; and the entity tag to send next time.
type Fetched struct {
	Status int
	Body   []byte
	ETag   string
	// Header is the response's header.
	Header http.Header
}

// Fetch fetches path, signed, and returns its body as sent, up to maxSize bytes: a file the
// program reads itself, such as a zone file, which GetJSON would try to decode. With etag it asks
// If-None-Match. Any status but 200 and 304 is a *StatusError, and a body longer than maxSize is
// an error, never a file cut short.
func (c *Client) Fetch(ctx context.Context, path, etag string, maxSize int64) (*Fetched, error) {
	if maxSize <= 0 {
		return nil, errors.New("agentcore: a fetch needs a size cap above zero")
	}
	var h http.Header
	if etag != "" {
		h = http.Header{"If-None-Match": {etag}}
	}
	f, err := c.fetch(ctx, path, h, maxSize, "body")
	if err != nil {
		return nil, err
	}
	if f.Status == http.StatusNotModified && f.ETag == "" {
		f.ETag = etag
	}
	return f, nil
}

func (c *Client) fetch(ctx context.Context, path string, h http.Header, maxSize int64, what string) (*Fetched, error) {
	resp, err := c.do(ctx, http.MethodGet, path, nil, h, false)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	switch resp.StatusCode {
	case http.StatusNotModified:
		return &Fetched{Status: http.StatusNotModified, ETag: resp.Header.Get("ETag"), Header: resp.Header}, nil
	case http.StatusOK:
		body, err := io.ReadAll(io.LimitReader(resp.Body, maxSize+1))
		if err != nil {
			return nil, fmt.Errorf("agentcore: read %s: %w", what, err)
		}
		if int64(len(body)) > maxSize {
			return nil, fmt.Errorf("agentcore: the %s is more than %d bytes", what, maxSize)
		}
		return &Fetched{Status: http.StatusOK, Body: body, ETag: resp.Header.Get("ETag"), Header: resp.Header}, nil
	}
	return nil, statusError(resp)
}

// do sends one signed request. The body is sent exactly as hashed: no compression, no
// rewriting, and a path with a query is refused before anything is signed.
func (c *Client) do(ctx context.Context, method, path string, body []byte, extra http.Header, enrolment bool) (*http.Response, error) {
	if c.Signer == nil {
		return nil, errors.New("agentcore: the client has no signer")
	}
	if !audiencePattern.MatchString(c.Origin) {
		return nil, fmt.Errorf("agentcore: origin %q is not a scheme and a host", c.Origin)
	}
	var authorization string
	var err error
	if enrolment {
		authorization, err = c.Signer.AuthorizeEnrolment(method, path, body)
	} else {
		authorization, err = c.Signer.Authorize(method, path, body)
	}
	if err != nil {
		return nil, err
	}
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.Origin+path, reader)
	if err != nil {
		return nil, err
	}
	if req.URL.RawQuery != "" || req.URL.Fragment != "" || req.URL.Path != path {
		return nil, fmt.Errorf("agentcore: path %q does not survive as a URL path", path)
	}
	for k, vs := range extra {
		req.Header[k] = vs
	}
	req.Header.Set("Authorization", authorization)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.UserAgent != "" {
		req.Header.Set("User-Agent", c.UserAgent)
	}
	httpClient := c.HTTP
	if httpClient == nil {
		httpClient = NewHTTPClient(netip.Addr{})
	}
	return httpClient.Do(req)
}

func decodeJSONResponse(resp *http.Response, out any, ok ...int) error {
	defer func() { _ = resp.Body.Close() }()
	for _, code := range ok {
		if resp.StatusCode != code {
			continue
		}
		if out == nil || code == http.StatusNoContent {
			_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, maxErrorBody))
			return nil
		}
		if err := json.NewDecoder(io.LimitReader(resp.Body, MaxBundleSize)).Decode(out); err != nil {
			return fmt.Errorf("agentcore: %s %s: decode answer: %w", resp.Request.Method, resp.Request.URL.Path, err)
		}
		return nil
	}
	return statusError(resp)
}

func statusError(resp *http.Response) error {
	e := &StatusError{StatusCode: resp.StatusCode, RetryAfter: RetryAfter(resp.Header, time.Now())}
	if resp.Request != nil {
		e.Method, e.Path = resp.Request.Method, resp.Request.URL.Path
	}
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, maxErrorBody))
	if mt, _, err := mime.ParseMediaType(resp.Header.Get("Content-Type")); err == nil && (mt == "application/problem+json" || mt == "application/json") {
		var p Problem
		if json.Unmarshal(raw, &p) == nil && (p.Code != "" || p.Type != "") {
			e.Problem = &p
		}
	}
	return e
}

// RetryAfter reads a Retry-After header, in seconds or as an HTTP date, as a duration from now.
// Zero means none, or one that could not be read or lies in the past.
func RetryAfter(h http.Header, now time.Time) time.Duration {
	v := strings.TrimSpace(h.Get("Retry-After"))
	if v == "" {
		return 0
	}
	if s, err := strconv.ParseUint(v, 10, 32); err == nil {
		return time.Duration(s) * time.Second
	}
	if t, err := http.ParseTime(v); err == nil && t.After(now) {
		return t.Sub(now)
	}
	return 0
}

// PollDelay says how long to wait before the next bundle fetch: the interval plus a random share
// of jitter, so a fleet of agents does not fetch in step, or what the control plane asked for in
// Retry-After (on a 503 or a 429) if that is longer.
func PollDelay(interval, jitter time.Duration, err error) time.Duration {
	d := interval
	if jitter > 0 {
		d += rand.N(jitter)
	}
	var se *StatusError
	if errors.As(err, &se) && se.RetryAfter > d {
		d = se.RetryAfter
	}
	return d
}
