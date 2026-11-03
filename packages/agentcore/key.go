package agentcore

import (
	"crypto/ed25519"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"runtime"
)

// b64 is base64url without padding, the encoding of every JOSE member and of key ids.
var b64 = base64.RawURLEncoding

// Key is the agent's identity: an Ed25519 key made where the agent runs. Its private half never
// leaves the host; the control plane knows only the public half, which the enrolment request
// names as a JWK, and the key id after that.
type Key struct {
	private ed25519.PrivateKey
}

// GenerateKey makes a new key from random, which is crypto/rand.Reader outside tests.
func GenerateKey(random io.Reader) (*Key, error) {
	_, private, err := ed25519.GenerateKey(random)
	if err != nil {
		return nil, fmt.Errorf("agentcore: generate key: %w", err)
	}
	return &Key{private: private}, nil
}

// KeyFromSeed rebuilds a key from its 32-byte RFC 8032 seed.
func KeyFromSeed(seed []byte) (*Key, error) {
	if len(seed) != ed25519.SeedSize {
		return nil, fmt.Errorf("agentcore: a seed is %d bytes, not %d", ed25519.SeedSize, len(seed))
	}
	return &Key{private: ed25519.NewKeyFromSeed(seed)}, nil
}

// Public returns the public half.
func (k *Key) Public() ed25519.PublicKey {
	return k.private.Public().(ed25519.PublicKey)
}

// JWK is an Ed25519 public key as an RFC 8037 OKP key. The field order is the order the members
// are written in, which the byte-exact signing vectors depend on.
type JWK struct {
	Kty string `json:"kty"`
	Crv string `json:"crv"`
	X   string `json:"x"`
}

// JWK returns the public half as the enrolment request names it.
func (k *Key) JWK() JWK {
	return JWK{Kty: "OKP", Crv: "Ed25519", X: b64.EncodeToString(k.Public())}
}

// ID returns the key id: the RFC 7638 thumbprint of the JWK (its required members sorted, no
// white space, SHA-256), in base64url without padding, 43 characters.
func (k *Key) ID() string {
	sum := sha256.Sum256([]byte(`{"crv":"Ed25519","kty":"OKP","x":"` + b64.EncodeToString(k.Public()) + `"}`))
	return b64.EncodeToString(sum[:])
}

func (k *Key) sign(message []byte) []byte {
	return ed25519.Sign(k.private, message)
}

// keyFileMode is the only mode a key file may have: readable and writable by its owner alone.
const keyFileMode fs.FileMode = 0o600

// ErrKeyFileExposed is returned for a key file others may read or write: whoever can read it can
// act as the agent, so it is refused rather than used.
var ErrKeyFileExposed = errors.New("agentcore: the key file is readable or writable by others")

// LoadOrCreateKey reads the key at path, a PKCS #8 PEM file, or makes one from random and
// writes it there with mode 0600 if the file does not exist yet. The boolean reports whether the
// key is new, which means the agent still has to enrol it.
func LoadOrCreateKey(path string, random io.Reader) (*Key, bool, error) {
	key, err := LoadKey(path)
	if err == nil {
		return key, false, nil
	}
	if !errors.Is(err, fs.ErrNotExist) {
		return nil, false, err
	}
	key, err = GenerateKey(random)
	if err != nil {
		return nil, false, err
	}
	der, err := x509.MarshalPKCS8PrivateKey(key.private)
	if err != nil {
		return nil, false, fmt.Errorf("agentcore: encode key: %w", err)
	}
	if err := writeFileAtomic(path, pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}), keyFileMode); err != nil {
		return nil, false, fmt.Errorf("agentcore: write key: %w", err)
	}
	return key, true, nil
}

// LoadKey reads a key LoadOrCreateKey wrote. On systems with Unix permissions a file that
// others may read or write is refused with ErrKeyFileExposed.
func LoadKey(path string) (*Key, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer func() { _ = f.Close() }()
	info, err := f.Stat()
	if err != nil {
		return nil, err
	}
	if runtime.GOOS != "windows" && info.Mode().Perm()&0o077 != 0 {
		return nil, fmt.Errorf("%w: %s has mode %04o, want %04o", ErrKeyFileExposed, path, info.Mode().Perm(), keyFileMode)
	}
	raw, err := io.ReadAll(io.LimitReader(f, 64<<10))
	if err != nil {
		return nil, err
	}
	block, rest := pem.Decode(raw)
	if block == nil || block.Type != "PRIVATE KEY" || len(rest) != 0 {
		return nil, fmt.Errorf("agentcore: %s is not one PKCS #8 PEM private key", path)
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("agentcore: %s: %w", path, err)
	}
	private, ok := parsed.(ed25519.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("agentcore: %s holds a %T, not an Ed25519 key", path, parsed)
	}
	return &Key{private: private}, nil
}
