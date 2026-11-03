package agentcore

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strings"
	"time"
)

// MaxRequestLifetime is the longest a request assertion may hold, from iat to exp.
const MaxRequestLifetime = 60 * time.Second

// Scheme is one product's request signing: the Authorization scheme every request carries and
// the JWS "typ" of its assertion. GOpenCDR's mirror protocol is {"GOCDR-Mirror",
// "gocdr-mirror+jwt"}.
type Scheme struct {
	// Authorization is the scheme word before the compact JWS in the Authorization header.
	Authorization string
	// Type is the JWS "typ" header member.
	Type string
	// Lifetime is how long an assertion holds; zero means MaxRequestLifetime, and more is
	// refused.
	Lifetime time.Duration
}

func (s Scheme) lifetime() (time.Duration, error) {
	switch {
	case s.Lifetime == 0:
		return MaxRequestLifetime, nil
	case s.Lifetime < time.Second || s.Lifetime > MaxRequestLifetime:
		return 0, fmt.Errorf("agentcore: a request lifetime of %s is outside 1s to %s", s.Lifetime, MaxRequestLifetime)
	case s.Lifetime%time.Second != 0:
		return 0, fmt.Errorf("agentcore: a request lifetime of %s is not whole seconds", s.Lifetime)
	}
	return s.Lifetime, nil
}

// Claims is the payload of a request assertion. The field order is the order the members are
// written in, which the byte-exact signing vectors depend on. Times are whole seconds since the
// epoch.
type Claims struct {
	// Issuer is the agent's id from its enrolment; the enrolment request itself has none.
	Issuer string `json:"iss,omitempty"`
	// Audience is the origin of the control plane the agent enrolled with, such as
	// https://cdr.gplatform.org, so a request signed for one control plane is refused by any
	// other.
	Audience  string `json:"aud"`
	IssuedAt  int64  `json:"iat"`
	ExpiresAt int64  `json:"exp"`
	// ID is random and taken once per key by the server.
	ID     string `json:"jti"`
	Method string `json:"method"`
	// Path is the request's path; a request carries no query string.
	Path string `json:"path"`
	// BodySHA256 is the SHA-256 of the body exactly as sent, of the empty string for none.
	BodySHA256 string `json:"bodySha256"`
}

// header is the JWS protected header: alg and typ, then kid, or on an enrolment request jwk.
type header struct {
	Alg string `json:"alg"`
	Typ string `json:"typ"`
	Kid string `json:"kid,omitempty"`
	JWK *JWK   `json:"jwk,omitempty"`
}

var (
	audiencePattern = regexp.MustCompile(`^https?://[a-z0-9.-]{1,253}(?::[0-9]{1,5})?$`)
	jtiPattern      = regexp.MustCompile(`^[A-Za-z0-9_-]{22,64}$`)
)

// BodyHash returns the SHA-256 of body in base64url without padding, as bodySha256 carries it.
func BodyHash(body []byte) string {
	sum := sha256.Sum256(body)
	return b64.EncodeToString(sum[:])
}

// encodeJSON writes v as compact JSON without escaping <, > and &, so what is signed is the
// value as written.
func encodeJSON(v any) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	return bytes.TrimSuffix(buf.Bytes(), []byte("\n")), nil
}

// SignAssertion signs claims with key as a compact JWS of the given typ. With withJWK the header
// names the public key itself, as only the enrolment request does; otherwise it names the key
// id. Signer builds the claims; this is the step below it, which the vectors test directly.
func SignAssertion(key *Key, typ string, withJWK bool, claims Claims) (string, error) {
	if err := checkClaims(claims); err != nil {
		return "", err
	}
	h := header{Alg: "EdDSA", Typ: typ}
	if withJWK {
		jwk := key.JWK()
		h.JWK = &jwk
	} else {
		h.Kid = key.ID()
	}
	hj, err := encodeJSON(h)
	if err != nil {
		return "", err
	}
	cj, err := encodeJSON(claims)
	if err != nil {
		return "", err
	}
	input := b64.EncodeToString(hj) + "." + b64.EncodeToString(cj)
	return input + "." + b64.EncodeToString(key.sign([]byte(input))), nil
}

// typPattern is what a proof's typ may be: a media type's subtype, such as gocdr-mirror-key+jwt.
var typPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$`)

// SignProof signs claims as a compact JWS bound to no request: its header names the key itself,
// exactly {"alg":"EdDSA","typ":typ,"jwk":<the key as an RFC 8037 OKP key>}, and the claims are
// the caller's own JSON object, written as given. A product uses it where its key proves itself
// outside a request, such as GOpenCDR's mirror key proof (typ gocdr-mirror-key+jwt). Its
// lifetime, audience and id are the caller's to set and the verifier's to check.
func SignProof(key *Key, typ string, claims any) (string, error) {
	if !typPattern.MatchString(typ) {
		return "", fmt.Errorf("agentcore: typ %q is not a media subtype", typ)
	}
	cj, err := encodeJSON(claims)
	if err != nil {
		return "", fmt.Errorf("agentcore: proof claims: %w", err)
	}
	if len(cj) < 2 || cj[0] != '{' {
		return "", errors.New("agentcore: proof claims are not a JSON object")
	}
	jwk := key.JWK()
	hj, err := encodeJSON(header{Alg: "EdDSA", Typ: typ, JWK: &jwk})
	if err != nil {
		return "", err
	}
	input := b64.EncodeToString(hj) + "." + b64.EncodeToString(cj)
	return input + "." + b64.EncodeToString(key.sign([]byte(input))), nil
}

func checkClaims(c Claims) error {
	switch {
	case !audiencePattern.MatchString(c.Audience):
		return fmt.Errorf("agentcore: audience %q is not an origin", c.Audience)
	case c.Method != "GET" && c.Method != "POST":
		return fmt.Errorf("agentcore: method %q is neither GET nor POST", c.Method)
	case !strings.HasPrefix(c.Path, "/") || strings.ContainsAny(c.Path, "?#"):
		return fmt.Errorf("agentcore: path %q is not a path without a query", c.Path)
	case !jtiPattern.MatchString(c.ID):
		return fmt.Errorf("agentcore: jti %q is not 22 to 64 base64url characters", c.ID)
	case c.IssuedAt < 0 || c.ExpiresAt <= c.IssuedAt || c.ExpiresAt-c.IssuedAt > int64(MaxRequestLifetime/time.Second):
		return fmt.Errorf("agentcore: iat %d and exp %d are not a lifetime of 1 to 60 seconds", c.IssuedAt, c.ExpiresAt)
	case len(c.BodySHA256) != 43:
		return errors.New("agentcore: bodySha256 is not a base64url SHA-256")
	}
	return nil
}

// Signer signs every request an agent sends to one control plane.
type Signer struct {
	Key    *Key
	Scheme Scheme
	// Audience is the control plane's origin, as its enrolment answer names it.
	Audience string
	// Issuer is the agent's id from its enrolment; empty until then.
	Issuer string
	// Now tells the time; nil means time.Now.
	Now func() time.Time
	// Random makes each jti; nil means crypto/rand.Reader.
	Random io.Reader
}

// Authorize returns the Authorization header value for a request: the scheme, a space and a
// compact JWS whose claims bind the audience, the method, the path and the body exactly as
// sent. It names the key by its id, so the key must be enrolled.
func (s *Signer) Authorize(method, path string, body []byte) (string, error) {
	return s.authorize(method, path, body, false)
}

// AuthorizeEnrolment is Authorize for the enrolment request: the header names the new public
// key as a JWK, which proves the agent holds it, and the claims carry no issuer yet.
func (s *Signer) AuthorizeEnrolment(method, path string, body []byte) (string, error) {
	return s.authorize(method, path, body, true)
}

func (s *Signer) authorize(method, path string, body []byte, enrolment bool) (string, error) {
	if s.Key == nil {
		return "", errors.New("agentcore: the signer has no key")
	}
	if s.Scheme.Authorization == "" || strings.ContainsAny(s.Scheme.Authorization, " \t") || s.Scheme.Type == "" {
		return "", errors.New("agentcore: the signer's scheme needs an authorization word and a typ")
	}
	lifetime, err := s.Scheme.lifetime()
	if err != nil {
		return "", err
	}
	if !enrolment && s.Issuer == "" {
		return "", errors.New("agentcore: the agent is not enrolled, so it has no issuer to sign as")
	}
	now := time.Now
	if s.Now != nil {
		now = s.Now
	}
	random := s.random()
	jti := make([]byte, 16)
	if _, err := io.ReadFull(random, jti); err != nil {
		return "", fmt.Errorf("agentcore: jti: %w", err)
	}
	iat := now().Unix()
	claims := Claims{
		Audience:   s.Audience,
		IssuedAt:   iat,
		ExpiresAt:  iat + int64(lifetime/time.Second),
		ID:         b64.EncodeToString(jti),
		Method:     method,
		Path:       path,
		BodySHA256: BodyHash(body),
	}
	if !enrolment {
		claims.Issuer = s.Issuer
	}
	jws, err := SignAssertion(s.Key, s.Scheme.Type, enrolment, claims)
	if err != nil {
		return "", err
	}
	return s.Scheme.Authorization + " " + jws, nil
}

func (s *Signer) random() io.Reader {
	if s.Random != nil {
		return s.Random
	}
	return rand.Reader
}
