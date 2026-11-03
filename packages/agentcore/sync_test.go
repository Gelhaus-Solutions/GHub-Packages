package agentcore

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"golang.org/x/mod/sumdb/note"
)

// TestBundleSyncAppliesOnlyWhatIsNew walks a control plane through a new bundle, an unchanged
// one, a newer one, a replayed old one and a forged one.
func TestBundleSyncAppliesOnlyWhatIsNew(t *testing.T) {
	_, key := readMirrorVectors(t)
	skey, vkey, err := note.GenerateKey(rand.Reader, testNoteName)
	if err != nil {
		t.Fatal(err)
	}
	signer, _ := note.NewSigner(skey)
	forger, _ := testNoteKey(t)
	sign := func(s note.Signer, serial int) []byte {
		msg, err := note.Sign(&note.Note{Text: fmt.Sprintf("{\"serial\":%d}\n", serial)}, s)
		if err != nil {
			t.Fatal(err)
		}
		return msg
	}

	var serving []byte
	var etag string
	cp := newControlPlane(t, key)
	cp.route = func(w http.ResponseWriter, r *http.Request, _ map[string]any, _ Claims, _ []byte) {
		w.Header().Set("ETag", etag)
		if r.Header.Get("If-None-Match") == etag {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		_, _ = w.Write(serving)
	}
	verifier, _ := NewBundleVerifier(vkey)
	floor, err := OpenSerialFloor(filepath.Join(t.TempDir(), "floor.json"))
	if err != nil {
		t.Fatal(err)
	}
	s := &BundleSync{Client: cp.client("cmr0mirror6k1m4p8x2q5w7z"), Path: "/api/v1/mirrors/self/bundle", Verifier: verifier, Floor: floor}
	ctx := context.Background()

	serving, etag = sign(signer, 3), `"3"`
	if b, err := s.Next(ctx); err != nil || b == nil || b.Serial != 3 {
		t.Fatalf("new bundle: %v %v", b, err)
	}
	if b, err := s.Next(ctx); err != nil || b != nil {
		t.Fatalf("unchanged bundle: %v %v", b, err)
	}
	serving, etag = sign(signer, 4), `"4"`
	if b, err := s.Next(ctx); err != nil || b == nil || b.Serial != 4 {
		t.Fatalf("newer bundle: %v %v", b, err)
	}
	serving, etag = sign(signer, 3), `"3"`
	if _, err := s.Next(ctx); !errors.Is(err, ErrBundleRollback) {
		t.Fatalf("replayed bundle: %v", err)
	}
	serving, etag = sign(forger, 9), `"9"`
	if _, err := s.Next(ctx); !errors.Is(err, ErrBundleSignature) {
		t.Fatalf("forged bundle: %v", err)
	}
	if floor.Serial() != 4 {
		t.Errorf("the floor is %d after refusals, want 4", floor.Serial())
	}
}

// TestBundleSyncLongPolls holds each fetch after the first until a newer bundle is served, as a
// control plane honouring Prefer: wait does, and checks what the agent asks and what it learns.
func TestBundleSyncLongPolls(t *testing.T) {
	_, key := readMirrorVectors(t)
	skey, vkey, err := note.GenerateKey(rand.Reader, testNoteName)
	if err != nil {
		t.Fatal(err)
	}
	signer, _ := note.NewSigner(skey)
	sign := func(serial int) []byte {
		msg, err := note.Sign(&note.Note{Text: fmt.Sprintf("{\"serial\":%d}\n", serial)}, signer)
		if err != nil {
			t.Fatal(err)
		}
		return msg
	}

	var prefers []string
	serving, etag, applies := sign(3), `"3"`, true
	cp := newControlPlane(t, key)
	cp.route = func(w http.ResponseWriter, r *http.Request, _ map[string]any, _ Claims, _ []byte) {
		prefer := r.Header.Get("Prefer")
		prefers = append(prefers, prefer)
		if applies && prefer != "" {
			w.Header().Set("Preference-Applied", prefer)
		}
		w.Header().Set("ETag", etag)
		if r.Header.Get("If-None-Match") == etag {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		_, _ = w.Write(serving)
	}
	verifier, _ := NewBundleVerifier(vkey)
	floor, err := OpenSerialFloor(filepath.Join(t.TempDir(), "floor.json"))
	if err != nil {
		t.Fatal(err)
	}
	s := &BundleSync{
		Client: cp.client("cmr0mirror6k1m4p8x2q5w7z"), Path: "/api/v1/mirrors/self/bundle",
		Verifier: verifier, Floor: floor, Wait: 50 * time.Second,
	}
	ctx := context.Background()

	if b, err := s.Next(ctx); err != nil || b == nil || s.Held() {
		t.Fatalf("first fetch: %v %v, held %v", b, err, s.Held())
	}
	if b, err := s.Next(ctx); err != nil || b != nil || !s.Held() {
		t.Fatalf("held fetch, unchanged: %v %v, held %v", b, err, s.Held())
	}
	serving, etag = sign(4), `"4"`
	if b, err := s.Next(ctx); err != nil || b == nil || b.Serial != 4 || !s.Held() {
		t.Fatalf("held fetch, newer: %v %v, held %v", b, err, s.Held())
	}
	applies = false
	if b, err := s.Next(ctx); err != nil || b != nil || s.Held() {
		t.Fatalf("a control plane that ignores the wait: %v %v, held %v", b, err, s.Held())
	}
	if want := []string{"", "wait=50", "wait=50", "wait=50"}; strings.Join(prefers, "|") != strings.Join(want, "|") {
		t.Errorf("the agent asked %q, want %q", prefers, want)
	}

	s.Wait = MaxBundleWait + time.Second
	if _, err := s.Next(ctx); err == nil || s.Held() {
		t.Errorf("a wait past MaxBundleWait was sent: %v", err)
	}
}

func TestWaitApplied(t *testing.T) {
	for v, want := range map[string]bool{
		"wait=30":                true,
		"respond-async, Wait=10": true,
		"return=minimal":         false,
		"waiting=1":              false,
		"":                       false,
	} {
		h := http.Header{}
		if v != "" {
			h.Set("Preference-Applied", v)
		}
		if got := waitApplied(h); got != want {
			t.Errorf("Preference-Applied %q: %v, want %v", v, got, want)
		}
	}
}
