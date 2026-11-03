package agentcore

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// File is one file a plan puts in place, by its path below the applier's root.
type File struct {
	Path string
	Data []byte
	// Mode is the file's permission bits; zero means 0o600, since what an agent writes is often
	// a key or a peer list.
	Mode os.FileMode
}

// Plan is what one verified bundle asks of the host, as the product's program rendered it: the
// files to put in place, all or none. The core knows no product: WireGuard, BIRD and nftables
// files are one program's plan, zone files another's.
type Plan struct {
	// Serial is the bundle's, for the journal and the reports.
	Serial uint64
	Files  []File
	// Risky applies the plan commit-confirmed: it stays pending until Confirm, which the program
	// calls once it has reached the control plane through the new configuration, and it is rolled
	// back when its window passes first. A change that can cut the host off is risky.
	Risky bool
	// Forward applies the plan with no way back: its files are written and the host reloaded and
	// probed, but a failed step leaves what was written in place instead of restoring the old
	// files. It is for a change where serving nothing beats serving what was there, such as
	// withdrawing a zone that collides with the root. A failure returns ForwardFailed with a
	// *ForwardError. Nothing is journalled, so after a crash halfway the program applies the plan
	// again. A forward plan is never Risky.
	Forward bool
}

// Host makes the host take what the files say, for one product: reload BIRD, sync WireGuard,
// load the nftables ruleset. Reload runs after a plan's files are in place and again after a
// rollback restored the old ones; Probe then says whether the host is healthy.
type Host interface {
	Reload(ctx context.Context) error
	Probe(ctx context.Context) error
}

// Outcome is where a plan stands.
type Outcome int

const (
	// Applied: the plan is in place and healthy, and nothing of the old one is kept.
	Applied Outcome = iota + 1
	// Pending: a risky plan is in place and waits for Confirm until its deadline.
	Pending
	// RolledBack: the plan failed, or its window passed, and the files before it are back.
	RolledBack
	// ForwardFailed: a forward plan failed a step and, by design, nothing was restored: what
	// was written stays, and the host needs the next plan or a person.
	ForwardFailed
)

func (o Outcome) String() string {
	switch o {
	case Applied:
		return "applied"
	case Pending:
		return "pending"
	case RolledBack:
		return "rolled back"
	case ForwardFailed:
		return "forward failed"
	}
	return "outcome(" + strconv.Itoa(int(o)) + ")"
}

// ErrPlanInFlight is returned by Apply while the journal holds a plan: a risky one waiting for
// confirmation, or one a crash interrupted. The program confirms or settles it first, and reports
// what became of it, before the next plan.
var ErrPlanInFlight = errors.New("agentcore: a plan is still in flight; confirm or settle it first")

// ErrPlanPath is returned for a plan whose file path is absolute, leaves the root or names the
// same file twice. Nothing is written.
var ErrPlanPath = errors.New("agentcore: plan path refused")

// RollbackError says why a plan was rolled back, and whether the rollback itself went through.
// Restore is nil when every old file is back and the host reloaded; otherwise the host needs a
// person.
type RollbackError struct {
	Serial  uint64
	Cause   error
	Restore error
}

func (e *RollbackError) Error() string {
	msg := fmt.Sprintf("agentcore: plan %d rolled back: %v", e.Serial, e.Cause)
	if e.Restore != nil {
		msg += fmt.Sprintf("; the rollback failed too: %v", e.Restore)
	}
	return msg
}

func (e *RollbackError) Unwrap() []error { return []error{e.Cause, e.Restore} }

// ForwardError says which step of a forward plan failed. Nothing was rolled back.
type ForwardError struct {
	Serial uint64
	Cause  error
}

func (e *ForwardError) Error() string {
	return fmt.Sprintf("agentcore: forward plan %d failed, nothing restored: %v", e.Serial, e.Cause)
}

func (e *ForwardError) Unwrap() error { return e.Cause }

// ErrForwardRisky is returned for a plan that is both forward and risky: a risky plan rolls back
// when it is not confirmed, which a forward plan never does. Nothing is written.
var ErrForwardRisky = errors.New("agentcore: a forward plan cannot be risky")

// ErrNotConfirmed is a RollbackError's cause when a risky plan was not confirmed in its window.
var ErrNotConfirmed = errors.New("not confirmed within its window")

// Applier puts plans in place atomically. Before it changes anything it journals every file the
// plan replaces, so a step that fails, a probe that fails, a risky plan that is never confirmed,
// or a crash in between, all end with the old files back and the host reloaded. One applier
// owns its root and its state directory; it is safe for concurrent use.
type Applier struct {
	// Root is the only tree plans write into, such as /etc/gocnr.
	Root string
	// StateDir holds the journal and the old files while a plan is in flight, such as
	// /var/lib/gocnr/apply. It must not lie below Root.
	StateDir string
	Host     Host
	// Window is how long a risky plan waits for Confirm: 5 minutes for routers.
	Window time.Duration
	// Now tells the time; nil means time.Now.
	Now func() time.Time

	mu sync.Mutex
}

// journal is the applier's state file. While it exists a plan is in flight: being applied, or
// waiting for confirmation until Deadline.
type journal struct {
	Serial   uint64         `json:"serial"`
	Phase    string         `json:"phase"`
	Deadline *time.Time     `json:"deadline,omitempty"`
	Files    []journalEntry `json:"files"`
}

const (
	phaseApplying   = "applying"
	phaseConfirming = "confirming"
)

// journalEntry is one file a plan replaces: whether it existed, and if so where its old bytes
// and mode are kept.
type journalEntry struct {
	Path    string      `json:"path"`
	Existed bool        `json:"existed"`
	Mode    os.FileMode `json:"mode,omitempty"`
	Backup  string      `json:"backup,omitempty"`
}

func (a *Applier) now() time.Time {
	if a.Now != nil {
		return a.Now()
	}
	return time.Now()
}

func (a *Applier) journalPath() string { return filepath.Join(a.StateDir, "journal.json") }

// Apply puts plan in place. It returns Applied, or Pending for a risky plan, or RolledBack with a
// *RollbackError when a file could not be written, the reload failed or the probe found the host
// unhealthy; for a forward plan, ForwardFailed with a *ForwardError instead, nothing restored.
// While another plan is in flight it changes nothing and returns ErrPlanInFlight.
func (a *Applier) Apply(ctx context.Context, plan Plan) (Outcome, error) {
	if plan.Forward && plan.Risky {
		return 0, ErrForwardRisky
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if _, inFlight, err := a.readJournal(); err != nil {
		return 0, err
	} else if inFlight {
		return 0, ErrPlanInFlight
	}
	targets, err := a.targets(plan.Files)
	if err != nil {
		return 0, err
	}
	if plan.Forward {
		return a.forward(ctx, plan, targets)
	}
	if err := os.MkdirAll(a.StateDir, 0o700); err != nil {
		return 0, fmt.Errorf("agentcore: apply state: %w", err)
	}

	// The old files first, then the journal naming them: from here on a crash rolls back.
	j := journal{Serial: plan.Serial, Phase: phaseApplying}
	for i, target := range targets {
		entry, err := a.keep(i, plan.Files[i].Path, target)
		if err != nil {
			a.discard()
			return 0, err
		}
		j.Files = append(j.Files, entry)
	}
	if err := a.writeJournal(j); err != nil {
		a.discard()
		return 0, err
	}

	for i, target := range targets {
		f := plan.Files[i]
		mode := f.Mode
		if mode == 0 {
			mode = 0o600
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return a.rollback(ctx, j, fmt.Errorf("write %s: %w", f.Path, err))
		}
		if err := writeFileAtomic(target, f.Data, mode); err != nil {
			return a.rollback(ctx, j, fmt.Errorf("write %s: %w", f.Path, err))
		}
	}
	if err := a.Host.Reload(ctx); err != nil {
		return a.rollback(ctx, j, fmt.Errorf("reload: %w", err))
	}
	if err := a.Host.Probe(ctx); err != nil {
		return a.rollback(ctx, j, fmt.Errorf("health probe: %w", err))
	}
	if !plan.Risky {
		a.discard()
		return Applied, nil
	}
	deadline := a.now().Add(a.Window)
	j.Phase, j.Deadline = phaseConfirming, &deadline
	if err := a.writeJournal(j); err != nil {
		return a.rollback(ctx, j, err)
	}
	return Pending, nil
}

// forward writes a forward plan's files and reloads and probes the host, keeping nothing of the
// old files and restoring nothing when a step fails.
func (a *Applier) forward(ctx context.Context, plan Plan, targets []string) (Outcome, error) {
	fail := func(cause error) (Outcome, error) {
		return ForwardFailed, &ForwardError{Serial: plan.Serial, Cause: cause}
	}
	for i, target := range targets {
		f := plan.Files[i]
		mode := f.Mode
		if mode == 0 {
			mode = 0o600
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return fail(fmt.Errorf("write %s: %w", f.Path, err))
		}
		if err := writeFileAtomic(target, f.Data, mode); err != nil {
			return fail(fmt.Errorf("write %s: %w", f.Path, err))
		}
	}
	if err := a.Host.Reload(ctx); err != nil {
		return fail(fmt.Errorf("reload: %w", err))
	}
	if err := a.Host.Probe(ctx); err != nil {
		return fail(fmt.Errorf("health probe: %w", err))
	}
	return Applied, nil
}

// Confirm keeps the risky plan waiting for confirmation: Applied. Past its deadline it is rolled
// back instead, RolledBack with a *RollbackError. With nothing waiting it returns Applied.
func (a *Applier) Confirm(ctx context.Context) (Outcome, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	j, ok, err := a.readJournal()
	if err != nil || !ok {
		return Applied, err
	}
	if j.Phase == phaseConfirming && j.Deadline != nil && !a.now().After(*j.Deadline) {
		a.discard()
		return Applied, nil
	}
	return a.settle(ctx)
}

// Settle finishes what the journal says is in flight: a plan interrupted while being applied is
// rolled back, and so is a risky plan whose window has passed. A risky plan still in its window
// stays Pending, with its deadline. A program calls Settle when it starts and then every few
// seconds while a plan is pending. With nothing in flight it returns Applied.
func (a *Applier) Settle(ctx context.Context) (Outcome, time.Time, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	out, err := a.settle(ctx)
	if out != Pending {
		return out, time.Time{}, err
	}
	j, _, err := a.readJournal()
	if err != nil || j.Deadline == nil {
		return out, time.Time{}, err
	}
	return out, *j.Deadline, nil
}

func (a *Applier) settle(ctx context.Context) (Outcome, error) {
	j, ok, err := a.readJournal()
	if err != nil {
		return 0, err
	}
	switch {
	case !ok:
		return Applied, nil
	case j.Phase == phaseConfirming && j.Deadline != nil && !a.now().After(*j.Deadline):
		return Pending, nil
	case j.Phase == phaseConfirming:
		return a.rollback(ctx, j, ErrNotConfirmed)
	default:
		return a.rollback(ctx, j, errors.New("interrupted while being applied"))
	}
}

// rollback puts every journalled file back as it was, reloads the host and ends the journal.
// When a file cannot be restored the journal stays, so the next Settle tries again.
func (a *Applier) rollback(ctx context.Context, j journal, cause error) (Outcome, error) {
	var problems []error
	for _, entry := range j.Files {
		target, err := a.target(entry.Path)
		if err != nil {
			problems = append(problems, err)
			continue
		}
		if !entry.Existed {
			if err := os.Remove(target); err != nil && !errors.Is(err, fs.ErrNotExist) {
				problems = append(problems, err)
			}
			continue
		}
		old, err := os.ReadFile(filepath.Join(a.StateDir, entry.Backup))
		if err == nil {
			err = writeFileAtomic(target, old, entry.Mode)
		}
		if err != nil {
			problems = append(problems, fmt.Errorf("restore %s: %w", entry.Path, err))
		}
	}
	if len(problems) == 0 {
		if err := a.Host.Reload(ctx); err != nil {
			problems = append(problems, fmt.Errorf("reload: %w", err))
		} else {
			a.discard()
		}
	}
	return RolledBack, &RollbackError{Serial: j.Serial, Cause: cause, Restore: errors.Join(problems...)}
}

// keep copies the file at target, if there is one, into the state directory as backup i.
func (a *Applier) keep(i int, path, target string) (journalEntry, error) {
	entry := journalEntry{Path: path}
	info, err := os.Lstat(target)
	if errors.Is(err, fs.ErrNotExist) {
		return entry, nil
	}
	if err != nil {
		return entry, fmt.Errorf("agentcore: keep %s: %w", path, err)
	}
	if !info.Mode().IsRegular() {
		return entry, fmt.Errorf("%w: %s is not a regular file", ErrPlanPath, path)
	}
	old, err := os.ReadFile(target)
	if err != nil {
		return entry, fmt.Errorf("agentcore: keep %s: %w", path, err)
	}
	entry.Existed, entry.Mode, entry.Backup = true, info.Mode().Perm(), "old-"+strconv.Itoa(i)
	if err := writeFileAtomic(filepath.Join(a.StateDir, entry.Backup), old, 0o600); err != nil {
		return entry, fmt.Errorf("agentcore: keep %s: %w", path, err)
	}
	return entry, nil
}

// targets resolves every path of a plan below the root, or refuses the plan whole.
func (a *Applier) targets(files []File) ([]string, error) {
	seen := make(map[string]bool, len(files))
	out := make([]string, 0, len(files))
	for _, f := range files {
		target, err := a.target(f.Path)
		if err != nil {
			return nil, err
		}
		if seen[target] {
			return nil, fmt.Errorf("%w: %q twice", ErrPlanPath, f.Path)
		}
		seen[target] = true
		out = append(out, target)
	}
	return out, nil
}

// target is path below the root: relative, clean, and never leaving it.
func (a *Applier) target(path string) (string, error) {
	if path == "" || filepath.IsAbs(path) || !filepath.IsLocal(path) || strings.ContainsRune(path, 0) {
		return "", fmt.Errorf("%w: %q", ErrPlanPath, path)
	}
	return filepath.Join(a.Root, path), nil
}

func (a *Applier) readJournal() (journal, bool, error) {
	var j journal
	raw, err := os.ReadFile(a.journalPath())
	if errors.Is(err, fs.ErrNotExist) {
		return j, false, nil
	}
	if err != nil {
		return j, false, err
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&j); err != nil {
		return j, false, fmt.Errorf("agentcore: apply journal %s is damaged: %w", a.journalPath(), err)
	}
	return j, true, nil
}

func (a *Applier) writeJournal(j journal) error {
	raw, err := json.Marshal(j)
	if err != nil {
		return err
	}
	if err := writeFileAtomic(a.journalPath(), append(raw, '\n'), 0o600); err != nil {
		return fmt.Errorf("agentcore: write apply journal: %w", err)
	}
	return nil
}

// discard ends the journal, then drops the old files it named. A crash between the two leaves
// only stale copies, which the next plan overwrites.
func (a *Applier) discard() {
	_ = os.Remove(a.journalPath())
	_ = syncDir(a.StateDir)
	entries, _ := os.ReadDir(a.StateDir)
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), "old-") {
			_ = os.Remove(filepath.Join(a.StateDir, e.Name()))
		}
	}
}
