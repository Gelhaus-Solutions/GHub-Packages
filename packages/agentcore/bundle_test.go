package agentcore

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"golang.org/x/mod/sumdb/note"
)

// gopencdrBundleKey is GOpenCDR's production bundle verifier key, as its worker announced it and
// GOPENCNR-107 records it.
const gopencdrBundleKey = "cdr.gplatform.org/mirror-bundle+a8c375cd+AYOGDQIrhBatOnPNuUQPvM0DSU3+tSvmi6rQzh0h/0dm"

const testNoteName = "cdr.example/mirror-bundle"

// testNoteKey makes a note key pair under testNoteName.
func testNoteKey(t *testing.T) (note.Signer, string) {
	t.Helper()
	skey, vkey, err := note.GenerateKey(rand.Reader, testNoteName)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := note.NewSigner(skey)
	if err != nil {
		t.Fatal(err)
	}
	return signer, vkey
}

func signBundle(t *testing.T, signer note.Signer, payload string) []byte {
	t.Helper()
	msg, err := note.Sign(&note.Note{Text: payload + "\n"}, signer)
	if err != nil {
		t.Fatal(err)
	}
	return msg
}

// gopencdrStyleNote builds a signed note the way GOpenCDR's worker does in
// apps/worker/src/mirrors/bundles.ts: the key hash is the first four bytes of
// SHA-256(name, newline, 0x01, key), and the one signature line is an em dash, a space, the name,
// a space and base64 of the hash and the signature.
func gopencdrStyleNote(private ed25519.PrivateKey, name, text string) []byte {
	pub := private.Public().(ed25519.PublicKey)
	h := sha256.Sum256(append(append([]byte(name+"\n"), 0x01), pub...))
	sig := ed25519.Sign(private, []byte(text))
	line := base64.StdEncoding.EncodeToString(append(h[:4:4], sig...))
	return []byte(text + "\n" + "\u2014 " + name + " " + line + "\n")
}

func TestPinnedGOpenCDRBundleKeyParses(t *testing.T) {
	if _, err := NewBundleVerifier(gopencdrBundleKey); err != nil {
		t.Fatal(err)
	}
}

func TestOpenReadsAGOpenCDRStyleNote(t *testing.T) {
	pub, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	vkey, err := note.NewEd25519VerifierKey(testNoteName, pub)
	if err != nil {
		t.Fatal(err)
	}
	v, err := NewBundleVerifier(vkey)
	if err != nil {
		t.Fatal(err)
	}
	payload := `{"bundleVersion":1,"expiresAt":"2026-10-09T14:05:00.000Z","issuedAt":"2026-10-02T14:05:00.000Z","mirrorId":"cmr0mirror6k1m4p8x2q5w7z","role":"public_resolver","serial":42,"tlds":[{"name":"gelhaus"}]}`
	b, err := v.Open(gopencdrStyleNote(private, testNoteName, payload+"\n"))
	if err != nil {
		t.Fatal(err)
	}
	if b.Serial != 42 || string(b.Payload) != payload {
		t.Errorf("serial %d, payload %s", b.Serial, b.Payload)
	}
	if want := time.Date(2026, 10, 9, 14, 5, 0, 0, time.UTC); !b.ExpiresAt.Equal(want) {
		t.Errorf("expiresAt %s, want %s", b.ExpiresAt, want)
	}
	if !b.Expired(time.Date(2026, 10, 9, 14, 5, 0, 0, time.UTC)) || b.Expired(time.Date(2026, 10, 9, 14, 4, 59, 0, time.UTC)) {
		t.Error("expiry is not at expiresAt")
	}
}

func TestOpenRefusesWhatNoPinnedKeySigned(t *testing.T) {
	signer, vkey := testNoteKey(t)
	other, _ := testNoteKey(t)
	v, err := NewBundleVerifier(vkey)
	if err != nil {
		t.Fatal(err)
	}
	good := signBundle(t, signer, `{"serial":7}`)
	if _, err := v.Open(good); err != nil {
		t.Fatal(err)
	}
	tampered := bytes.Replace(good, []byte(`"serial":7`), []byte(`"serial":9`), 1)
	unknown := signBundle(t, other, `{"serial":7}`)
	for name, msg := range map[string][]byte{
		"tampered": tampered,
		"unknown":  unknown,
		"text":     []byte("{\"serial\":7}\n"),
		"empty":    nil,
	} {
		if _, err := v.Open(msg); !errors.Is(err, ErrBundleSignature) {
			t.Errorf("%s: got %v, want ErrBundleSignature", name, err)
		}
	}
}

func TestOpenRefusesABadEnvelope(t *testing.T) {
	signer, vkey := testNoteKey(t)
	v, err := NewBundleVerifier(vkey)
	if err != nil {
		t.Fatal(err)
	}
	for _, payload := range []string{
		`{}`, `null`, `[1]`, `{"serial":0}`, `{"serial":-1}`, `{"serial":1.5}`, `{"serial":1e3}`,
		`{"serial":"5"}`, `{"serial":01}`, `{"serial":99999999999999999999}`, `{"serial":1} {"serial":2}`,
		`{"serial":1,"expiresAt":"tomorrow"}`, `{"serial":1,"issuedAt":5}`,
	} {
		if b, err := v.Open(signBundle(t, signer, payload)); err == nil {
			t.Errorf("%s: opened with serial %d", payload, b.Serial)
		}
	}
}

func TestNewBundleVerifierNeedsAValidKey(t *testing.T) {
	if _, err := NewBundleVerifier(); err == nil {
		t.Error("no key taken")
	}
	if _, err := NewBundleVerifier("cdr.gplatform.org/mirror-bundle+00000000+AYOGDQIrhBatOnPNuUQPvM0DSU3+tSvmi6rQzh0h/0dm"); err == nil {
		t.Error("a key with the wrong hash taken")
	}
}

func TestSerialFloorRefusesRollbackAcrossRestarts(t *testing.T) {
	signer, vkey := testNoteKey(t)
	v, err := NewBundleVerifier(vkey)
	if err != nil {
		t.Fatal(err)
	}
	open := func(payload string) *Bundle {
		t.Helper()
		b, err := v.Open(signBundle(t, signer, payload))
		if err != nil {
			t.Fatal(err)
		}
		return b
	}
	path := filepath.Join(t.TempDir(), "bundle-floor.json")
	floor, err := OpenSerialFloor(path)
	if err != nil {
		t.Fatal(err)
	}
	if floor.Serial() != 0 {
		t.Fatalf("a new floor is %d", floor.Serial())
	}
	if changed, err := floor.Accept(open(`{"serial":5,"x":"a"}`)); err != nil || !changed {
		t.Fatalf("first bundle: %v %v", changed, err)
	}
	if changed, err := floor.Accept(open(`{"serial":5,"x":"a"}`)); err != nil || changed {
		t.Fatalf("the same bundle again: %v %v", changed, err)
	}
	if _, err := floor.Accept(open(`{"serial":5,"x":"b"}`)); !errors.Is(err, ErrBundleSerialReused) {
		t.Fatalf("other contents under serial 5: %v", err)
	}
	if _, err := floor.Accept(open(`{"serial":4}`)); !errors.Is(err, ErrBundleRollback) {
		t.Fatalf("serial 4 after 5: %v", err)
	}

	restarted, err := OpenSerialFloor(path)
	if err != nil {
		t.Fatal(err)
	}
	if restarted.Serial() != 5 {
		t.Fatalf("after a restart the floor is %d", restarted.Serial())
	}
	if _, err := restarted.Accept(open(`{"serial":4}`)); !errors.Is(err, ErrBundleRollback) {
		t.Fatalf("serial 4 after a restart: %v", err)
	}
	if _, err := restarted.Accept(open(`{"serial":5,"x":"b"}`)); !errors.Is(err, ErrBundleSerialReused) {
		t.Fatalf("other contents under serial 5 after a restart: %v", err)
	}
	if changed, err := restarted.Accept(open(`{"serial":6}`)); err != nil || !changed {
		t.Fatalf("serial 6: %v %v", changed, err)
	}
}

func TestOpenSerialFloorRefusesADamagedFile(t *testing.T) {
	dir := t.TempDir()
	for name, content := range map[string]string{
		"garbage": "not json",
		"digest":  `{"serial":5,"payloadSha256":"xyz"}`,
		"zero":    `{"serial":0,"payloadSha256":"` + strings.Repeat("0", 64) + `"}`,
		"extra":   `{"serial":5,"payloadSha256":"` + strings.Repeat("0", 64) + `","more":1}`,
	} {
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
		if _, err := OpenSerialFloor(path); err == nil {
			t.Errorf("%s: opened", name)
		}
	}
}

// FuzzOpen feeds arbitrary bytes to the verifier: it must never panic, and whatever it accepts
// must carry a positive serial.
func FuzzOpen(f *testing.F) {
	skey, vkey, err := note.GenerateKey(rand.Reader, testNoteName)
	if err != nil {
		f.Fatal(err)
	}
	signer, err := note.NewSigner(skey)
	if err != nil {
		f.Fatal(err)
	}
	v, err := NewBundleVerifier(vkey)
	if err != nil {
		f.Fatal(err)
	}
	good, err := note.Sign(&note.Note{Text: "{\"serial\":3}\n"}, signer)
	if err != nil {
		f.Fatal(err)
	}
	f.Add(good)
	f.Add([]byte("{\"serial\":3}\n\n\u2014 x AAAA\n"))
	f.Fuzz(func(t *testing.T, msg []byte) {
		b, err := v.Open(msg)
		if err == nil && b.Serial == 0 {
			t.Fatal("accepted a bundle without a serial")
		}
	})
}
