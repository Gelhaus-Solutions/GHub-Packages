package agentcore

import (
	"bytes"
	"crypto/rand"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// mirrorVectors is GOpenCDR's packages/contracts/vectors/mirror-request.json, copied byte for
// byte from GOpenCDR main (last changed in 712f962) and never regenerated.
type mirrorVectors struct {
	Seed      string `json:"seed"`
	PublicKey string `json:"publicKey"`
	KeyID     string `json:"keyId"`
	Vectors   []struct {
		Name    string `json:"name"`
		Header  string `json:"header"`
		Claims  string `json:"claims"`
		Request struct {
			Method string `json:"method"`
			Path   string `json:"path"`
			Body   string `json:"body"`
		} `json:"request"`
		JWS           string `json:"jws"`
		Authorization string `json:"authorization"`
	} `json:"vectors"`
}

func readMirrorVectors(t *testing.T) (mirrorVectors, *Key) {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata", "gopencdr-mirror-request.json"))
	if err != nil {
		t.Fatal(err)
	}
	var v mirrorVectors
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	seed, err := hex.DecodeString(v.Seed)
	if err != nil {
		t.Fatal(err)
	}
	key, err := KeyFromSeed(seed)
	if err != nil {
		t.Fatal(err)
	}
	return v, key
}

func TestKeyMatchesGOpenCDRVectors(t *testing.T) {
	v, key := readMirrorVectors(t)
	if got := key.JWK().X; got != v.PublicKey {
		t.Errorf("public key %s, want %s", got, v.PublicKey)
	}
	if got := key.ID(); got != v.KeyID {
		t.Errorf("key id %s, want %s", got, v.KeyID)
	}
}

func TestKeyFromSeedRefusesWrongLength(t *testing.T) {
	if _, err := KeyFromSeed(make([]byte, 31)); err == nil {
		t.Fatal("a 31-byte seed was taken")
	}
}

func TestLoadOrCreateKeyCreatesOnceAndReloads(t *testing.T) {
	path := filepath.Join(t.TempDir(), "agent.key")
	first, created, err := LoadOrCreateKey(path, rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	if !created {
		t.Fatal("a missing key file did not report a new key")
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS != "windows" && info.Mode().Perm() != 0o600 {
		t.Errorf("key file mode %04o, want 0600", info.Mode().Perm())
	}
	second, created, err := LoadOrCreateKey(path, rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	if created {
		t.Error("an existing key file was replaced")
	}
	if !bytes.Equal(first.Public(), second.Public()) {
		t.Error("the reloaded key is not the one written")
	}
}

func TestLoadKeyRefusesAFileOthersCanRead(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("no Unix permissions")
	}
	path := filepath.Join(t.TempDir(), "agent.key")
	if _, _, err := LoadOrCreateKey(path, rand.Reader); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(path, 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := LoadKey(path)
	if !errors.Is(err, ErrKeyFileExposed) {
		t.Fatalf("got %v, want ErrKeyFileExposed", err)
	}
	// And LoadOrCreateKey must not paper over it with a new key.
	if _, _, err := LoadOrCreateKey(path, rand.Reader); !errors.Is(err, ErrKeyFileExposed) {
		t.Fatalf("LoadOrCreateKey: got %v, want ErrKeyFileExposed", err)
	}
}

func TestLoadKeyRefusesWhatIsNotOneEd25519Key(t *testing.T) {
	_, key := readMirrorVectors(t)
	der, err := x509.MarshalPKCS8PrivateKey(key.private)
	if err != nil {
		t.Fatal(err)
	}
	private := pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der})
	pub, err := x509.MarshalPKIXPublicKey(key.Public())
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	for name, content := range map[string][]byte{
		"empty":     nil,
		"garbage":   []byte("not a key\n"),
		"trailing":  append(append([]byte{}, private...), "extra"...),
		"twice":     append(append([]byte{}, private...), private...),
		"wrongtype": pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: pub}),
	} {
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, content, 0o600); err != nil {
			t.Fatal(err)
		}
		if _, err := LoadKey(path); err == nil {
			t.Errorf("%s: loaded", name)
		}
	}
	good := filepath.Join(dir, "good")
	if err := os.WriteFile(good, private, 0o600); err != nil {
		t.Fatal(err)
	}
	loaded, err := LoadKey(good)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.ID() != key.ID() {
		t.Error("a well-formed key file loaded as another key")
	}
}
