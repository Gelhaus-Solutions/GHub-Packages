package agentcore

import (
	"bytes"
	"crypto/ed25519"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

var gopencdrMirror = Scheme{Authorization: "GOCDR-Mirror", Type: "gocdr-mirror+jwt"}

// TestSignAssertionMatchesGOpenCDRVectors signs GOpenCDR's vectors through the core and must
// produce their JWS and Authorization byte for byte: header and claims are written in the
// vectors' member order, and Ed25519 is deterministic.
func TestSignAssertionMatchesGOpenCDRVectors(t *testing.T) {
	v, key := readMirrorVectors(t)
	if len(v.Vectors) == 0 {
		t.Fatal("no vectors")
	}
	for _, vec := range v.Vectors {
		t.Run(vec.Name, func(t *testing.T) {
			var claims Claims
			dec := json.NewDecoder(strings.NewReader(vec.Claims))
			dec.DisallowUnknownFields()
			if err := dec.Decode(&claims); err != nil {
				t.Fatal(err)
			}
			withJWK := strings.Contains(vec.Header, `"jwk"`)
			jws, err := SignAssertion(key, gopencdrMirror.Type, withJWK, claims)
			if err != nil {
				t.Fatal(err)
			}
			if jws != vec.JWS {
				t.Errorf("signed\n%s\nwant\n%s", jws, vec.JWS)
			}
			if got := gopencdrMirror.Authorization + " " + jws; got != vec.Authorization {
				t.Errorf("authorization\n%s\nwant\n%s", got, vec.Authorization)
			}
			head, err := b64.DecodeString(strings.Split(jws, ".")[0])
			if err != nil {
				t.Fatal(err)
			}
			if string(head) != vec.Header {
				t.Errorf("header %s, want %s", head, vec.Header)
			}
			if claims.BodySHA256 != BodyHash([]byte(vec.Request.Body)) {
				t.Error("bodySha256 is not the request body's")
			}
			if claims.Method != vec.Request.Method || claims.Path != vec.Request.Path {
				t.Error("the claims do not name the vector's request")
			}
		})
	}
}

// decodeAssertion splits an Authorization value and checks its signature with key.
func decodeAssertion(t *testing.T, key *Key, authorization string) (map[string]any, Claims) {
	t.Helper()
	scheme, jws, ok := strings.Cut(authorization, " ")
	if !ok || scheme != gopencdrMirror.Authorization {
		t.Fatalf("authorization %q does not start with the scheme", authorization)
	}
	parts := strings.Split(jws, ".")
	if len(parts) != 3 {
		t.Fatalf("%d JWS parts", len(parts))
	}
	sig, err := b64.DecodeString(parts[2])
	if err != nil {
		t.Fatal(err)
	}
	if !ed25519.Verify(key.Public(), []byte(parts[0]+"."+parts[1]), sig) {
		t.Fatal("the signature does not verify")
	}
	var h map[string]any
	raw, _ := b64.DecodeString(parts[0])
	if err := json.Unmarshal(raw, &h); err != nil {
		t.Fatal(err)
	}
	var c Claims
	raw, _ = b64.DecodeString(parts[1])
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&c); err != nil {
		t.Fatal(err)
	}
	return h, c
}

func TestSignerAuthorizeBindsTheRequest(t *testing.T) {
	_, key := readMirrorVectors(t)
	now := time.Unix(1790791200, 0)
	s := &Signer{Key: key, Scheme: gopencdrMirror, Audience: "https://cdr.gplatform.org", Issuer: "cmr0mirror6k1m4p8x2q5w7z", Now: func() time.Time { return now }}
	body := []byte(`{"serves":[]}`)
	auth, err := s.Authorize("POST", "/api/v1/mirrors/self/reports", body)
	if err != nil {
		t.Fatal(err)
	}
	h, c := decodeAssertion(t, key, auth)
	if h["alg"] != "EdDSA" || h["typ"] != "gocdr-mirror+jwt" || h["kid"] != key.ID() || h["jwk"] != nil {
		t.Errorf("header %v", h)
	}
	want := Claims{Issuer: s.Issuer, Audience: s.Audience, IssuedAt: now.Unix(), ExpiresAt: now.Unix() + 60, ID: c.ID, Method: "POST", Path: "/api/v1/mirrors/self/reports", BodySHA256: BodyHash(body)}
	if c != want {
		t.Errorf("claims %+v, want %+v", c, want)
	}
	if !jtiPattern.MatchString(c.ID) {
		t.Errorf("jti %q", c.ID)
	}
	again, err := s.Authorize("POST", "/api/v1/mirrors/self/reports", body)
	if err != nil {
		t.Fatal(err)
	}
	if _, c2 := decodeAssertion(t, key, again); c2.ID == c.ID {
		t.Error("two requests share a jti")
	}
}

func TestSignerAuthorizeEnrolmentNamesTheKey(t *testing.T) {
	_, key := readMirrorVectors(t)
	s := &Signer{Key: key, Scheme: gopencdrMirror, Audience: "https://cdr.gplatform.org", Issuer: "ignored"}
	auth, err := s.AuthorizeEnrolment("POST", "/api/v1/mirrors/enrolments", []byte("{}"))
	if err != nil {
		t.Fatal(err)
	}
	h, c := decodeAssertion(t, key, auth)
	jwk, _ := h["jwk"].(map[string]any)
	if h["kid"] != nil || jwk["kty"] != "OKP" || jwk["crv"] != "Ed25519" || jwk["x"] != key.JWK().X {
		t.Errorf("header %v", h)
	}
	if c.Issuer != "" {
		t.Errorf("the enrolment request carries iss %q", c.Issuer)
	}
}

func TestSignerRefuses(t *testing.T) {
	_, key := readMirrorVectors(t)
	ok := func() *Signer {
		return &Signer{Key: key, Scheme: gopencdrMirror, Audience: "https://cdr.gplatform.org", Issuer: "cmr0mirror6k1m4p8x2q5w7z"}
	}
	for name, tc := range map[string]struct {
		change       func(*Signer)
		method, path string
	}{
		"not enrolled":   {func(s *Signer) { s.Issuer = "" }, "GET", "/api/v1/mirrors/self/bundle"},
		"query string":   {nil, "GET", "/api/v1/mirrors/self/bundle?wait=30"},
		"fragment":       {nil, "GET", "/api/v1/mirrors/self/bundle#x"},
		"relative path":  {nil, "GET", "api/v1/mirrors/self/bundle"},
		"method":         {nil, "PUT", "/api/v1/mirrors/self/bundle"},
		"long lifetime":  {func(s *Signer) { s.Scheme.Lifetime = 61 * time.Second }, "GET", "/x"},
		"part seconds":   {func(s *Signer) { s.Scheme.Lifetime = 1500 * time.Millisecond }, "GET", "/x"},
		"audience path":  {func(s *Signer) { s.Audience = "https://cdr.gplatform.org/api" }, "GET", "/x"},
		"audience case":  {func(s *Signer) { s.Audience = "https://CDR.gplatform.org" }, "GET", "/x"},
		"no scheme word": {func(s *Signer) { s.Scheme.Authorization = "" }, "GET", "/x"},
		"no key":         {func(s *Signer) { s.Key = nil }, "GET", "/x"},
	} {
		s := ok()
		if tc.change != nil {
			tc.change(s)
		}
		if auth, err := s.Authorize(tc.method, tc.path, nil); err == nil {
			t.Errorf("%s: signed %s", name, auth)
		}
	}
}

func TestSignProofNamesTheKeyAndSignsTheCallersClaims(t *testing.T) {
	key, err := KeyFromSeed(make([]byte, 32))
	if err != nil {
		t.Fatal(err)
	}
	claims := map[string]any{"iss": "mirror-1", "aud": "https://cdr.gplatform.org", "iat": 1, "exp": 61, "jti": "abc", "typ": "gocdr-mirror-key+jwt"}
	jws, err := SignProof(key, "gocdr-mirror-key+jwt", claims)
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.Split(jws, ".")
	if len(parts) != 3 {
		t.Fatalf("not a compact JWS: %q", jws)
	}
	head, _ := b64.DecodeString(parts[0])
	jwk := key.JWK()
	// The key as the enrolment header writes it, in the JWK struct's member order.
	want := `{"alg":"EdDSA","typ":"gocdr-mirror-key+jwt","jwk":{"kty":"` + jwk.Kty + `","crv":"` + jwk.Crv + `","x":"` + jwk.X + `"}}`
	if string(head) != want {
		t.Fatalf("header %s\nwant   %s", head, want)
	}
	sig, _ := b64.DecodeString(parts[2])
	if !ed25519.Verify(key.Public(), []byte(parts[0]+"."+parts[1]), sig) {
		t.Fatal("the signature does not verify under the key")
	}
	for _, bad := range []any{nil, []int{1}, "claims"} {
		if _, err := SignProof(key, "x+jwt", bad); err == nil {
			t.Fatalf("claims %v were signed; only an object is", bad)
		}
	}
	if _, err := SignProof(key, "", claims); err == nil {
		t.Fatal("an empty typ was signed")
	}
}
