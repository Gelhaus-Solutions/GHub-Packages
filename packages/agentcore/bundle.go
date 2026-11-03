package agentcore

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"regexp"
	"strconv"
	"sync"
	"time"

	"golang.org/x/mod/sumdb/note"
)

// MaxBundleSize caps a signed bundle, so a control plane gone wrong cannot fill the agent's
// memory.
const MaxBundleSize = 4 << 20

// Bundle is a signed bundle that verified against a pinned key. The core reads only the members
// every product's bundle shares; the product decodes Payload for the rest.
type Bundle struct {
	// Serial rises with every change; a lower one is never accepted again.
	Serial uint64
	// IssuedAt and ExpiresAt are zero when the bundle does not carry them.
	IssuedAt  time.Time
	ExpiresAt time.Time
	// Payload is the bundle's JSON: the note's text without its final newline.
	Payload []byte
	// Note is the signed note exactly as it arrived.
	Note []byte
}

// Expired reports whether the bundle's expiry has passed at now. A bundle without one never
// expires. After expiry an agent adds nothing on the bundle's word; what that means is the
// product's.
func (b *Bundle) Expired(now time.Time) bool {
	return !b.ExpiresAt.IsZero() && !now.Before(b.ExpiresAt)
}

// ErrBundleSignature is returned for a bundle that no pinned key signed, or that was changed
// after signing.
var ErrBundleSignature = errors.New("agentcore: the bundle is not signed by a pinned key")

// serialPattern is a positive JSON integer: no sign, no leading zero, no fraction, no exponent.
var serialPattern = regexp.MustCompile(`^[1-9][0-9]{0,19}$`)

// BundleVerifier opens signed bundles: C2SP signed notes whose text is the bundle's JSON and a
// newline, signed with Ed25519 by a key the agent release pins.
type BundleVerifier struct {
	verifiers note.Verifiers
}

// NewBundleVerifier takes the verifier keys the release pins, in C2SP form
// (<name>+<hash>+<base64 key>), such as
// cdr.gplatform.org/mirror-bundle+a8c375cd+AYOGDQIrhBatOnPNuUQPvM0DSU3+tSvmi6rQzh0h/0dm. Pinning
// the next key beside the current one lets a release ride through a key rotation.
func NewBundleVerifier(keys ...string) (*BundleVerifier, error) {
	if len(keys) == 0 {
		return nil, errors.New("agentcore: a bundle verifier needs at least one pinned key")
	}
	list := make([]note.Verifier, 0, len(keys))
	for _, k := range keys {
		v, err := note.NewVerifier(k)
		if err != nil {
			return nil, fmt.Errorf("agentcore: pinned bundle key %q: %w", k, err)
		}
		list = append(list, v)
	}
	return &BundleVerifier{verifiers: note.VerifierList(list...)}, nil
}

// Open verifies a signed bundle and reads its serial and times. Nothing inside a bundle is read
// before its signature has verified; a bundle with no valid signature by a pinned key is refused
// whole, whatever else it carries.
func (v *BundleVerifier) Open(msg []byte) (*Bundle, error) {
	if len(msg) > MaxBundleSize {
		return nil, fmt.Errorf("agentcore: the bundle is %d bytes, more than %d", len(msg), MaxBundleSize)
	}
	n, err := note.Open(msg, v.verifiers)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrBundleSignature, err)
	}
	payload := []byte(n.Text[:len(n.Text)-1])
	var envelope struct {
		Serial    json.RawMessage `json:"serial"`
		IssuedAt  *string         `json:"issuedAt"`
		ExpiresAt *string         `json:"expiresAt"`
	}
	dec := json.NewDecoder(bytes.NewReader(payload))
	if err := dec.Decode(&envelope); err != nil {
		return nil, fmt.Errorf("agentcore: the signed bundle is not a JSON object: %w", err)
	}
	if dec.More() {
		return nil, errors.New("agentcore: the signed bundle holds more than one JSON value")
	}
	if !serialPattern.Match(envelope.Serial) {
		return nil, fmt.Errorf("agentcore: the signed bundle's serial %q is not a positive integer", envelope.Serial)
	}
	serial, err := strconv.ParseUint(string(envelope.Serial), 10, 64)
	if err != nil {
		return nil, fmt.Errorf("agentcore: the signed bundle's serial: %w", err)
	}
	b := &Bundle{Serial: serial, Payload: payload, Note: msg}
	if b.IssuedAt, err = bundleTime("issuedAt", envelope.IssuedAt); err != nil {
		return nil, err
	}
	if b.ExpiresAt, err = bundleTime("expiresAt", envelope.ExpiresAt); err != nil {
		return nil, err
	}
	return b, nil
}

func bundleTime(name string, s *string) (time.Time, error) {
	if s == nil {
		return time.Time{}, nil
	}
	t, err := time.Parse(time.RFC3339Nano, *s)
	if err != nil {
		return time.Time{}, fmt.Errorf("agentcore: the signed bundle's %s: %w", name, err)
	}
	return t, nil
}

// ErrBundleRollback is returned for a bundle whose serial is below the last one accepted: an old
// bundle replayed, by a man in the middle or a control plane restored from a backup.
var ErrBundleRollback = errors.New("agentcore: the bundle's serial is below the last one accepted")

// ErrBundleSerialReused is returned for a bundle that carries the last accepted serial but says
// something else: a serial must name one bundle only.
var ErrBundleSerialReused = errors.New("agentcore: the bundle reuses the last accepted serial for other contents")

// SerialFloor remembers the last bundle accepted, across restarts, in a small state file, and
// refuses any bundle below it. The file is the agent's own: deleting it resets the floor, which
// only someone who already controls the host can do.
type SerialFloor struct {
	path   string
	mu     sync.Mutex
	serial uint64
	digest string
}

type floorState struct {
	Serial        uint64 `json:"serial"`
	PayloadSHA256 string `json:"payloadSha256"`
}

// OpenSerialFloor reads the floor from path. A missing file is a floor of zero, for an agent that
// has never accepted a bundle; a file that cannot be read as a floor is an error, never a reset.
func OpenSerialFloor(path string) (*SerialFloor, error) {
	f := &SerialFloor{path: path}
	raw, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return f, nil
	}
	if err != nil {
		return nil, err
	}
	var st floorState
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&st); err != nil {
		return nil, fmt.Errorf("agentcore: serial floor %s: %w", path, err)
	}
	if d, err := hex.DecodeString(st.PayloadSHA256); err != nil || len(d) != sha256.Size || st.Serial == 0 {
		return nil, fmt.Errorf("agentcore: serial floor %s is damaged", path)
	}
	f.serial, f.digest = st.Serial, st.PayloadSHA256
	return f, nil
}

// Serial returns the last serial accepted, zero before the first.
func (f *SerialFloor) Serial() uint64 {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.serial
}

// Accept checks a verified bundle against the floor. A higher serial raises the floor, written
// to disk before Accept returns, and reports true: the agent applies the bundle. The same serial
// with the same payload reports false: nothing changed. A lower serial is ErrBundleRollback, and
// the same serial with another payload ErrBundleSerialReused.
func (f *SerialFloor) Accept(b *Bundle) (bool, error) {
	sum := sha256.Sum256(b.Payload)
	digest := hex.EncodeToString(sum[:])
	f.mu.Lock()
	defer f.mu.Unlock()
	switch {
	case b.Serial < f.serial:
		return false, fmt.Errorf("%w: %d after %d", ErrBundleRollback, b.Serial, f.serial)
	case b.Serial == f.serial && digest == f.digest:
		return false, nil
	case b.Serial == f.serial:
		return false, fmt.Errorf("%w: %d", ErrBundleSerialReused, b.Serial)
	}
	raw, err := json.Marshal(floorState{Serial: b.Serial, PayloadSHA256: digest})
	if err != nil {
		return false, err
	}
	if err := writeFileAtomic(f.path, append(raw, '\n'), 0o600); err != nil {
		return false, fmt.Errorf("agentcore: write serial floor: %w", err)
	}
	f.serial, f.digest = b.Serial, digest
	return true, nil
}
