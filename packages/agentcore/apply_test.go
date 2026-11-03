package agentcore

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// fakeHost counts reloads and fails its probe while unhealthy is set.
type fakeHost struct {
	reloads   int
	unhealthy bool
}

func (h *fakeHost) Reload(context.Context) error { h.reloads++; return nil }

func (h *fakeHost) Probe(context.Context) error {
	if h.unhealthy {
		return errors.New("bird is not up")
	}
	return nil
}

type applierFixture struct {
	a    *Applier
	host *fakeHost
	now  time.Time
}

func newApplier(t *testing.T) *applierFixture {
	t.Helper()
	dir := t.TempDir()
	f := &applierFixture{host: &fakeHost{}, now: time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)}
	f.a = &Applier{
		Root: filepath.Join(dir, "etc"), StateDir: filepath.Join(dir, "state"), Host: f.host,
		Window: 5 * time.Minute, Now: func() time.Time { return f.now },
	}
	if err := os.MkdirAll(f.a.Root, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(f.a.Root, "wg0.conf"), []byte("old peers\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	return f
}

func (f *applierFixture) read(t *testing.T, path string) string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(f.a.Root, path))
	if errors.Is(err, os.ErrNotExist) {
		return "<none>"
	}
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

var plan = Plan{Serial: 7, Files: []File{
	{Path: "wg0.conf", Data: []byte("new peers\n")},
	{Path: "bird/bird.conf", Data: []byte("protocol bgp hub {}\n"), Mode: 0o644},
}}

func TestApplyPutsEveryFileInPlace(t *testing.T) {
	f := newApplier(t)
	out, err := f.a.Apply(context.Background(), plan)
	if out != Applied || err != nil {
		t.Fatalf("%v, %v", out, err)
	}
	if f.read(t, "wg0.conf") != "new peers\n" || f.read(t, "bird/bird.conf") != "protocol bgp hub {}\n" || f.host.reloads != 1 {
		t.Errorf("files %q %q, %d reloads", f.read(t, "wg0.conf"), f.read(t, "bird/bird.conf"), f.host.reloads)
	}
	if _, inFlight, _ := f.a.readJournal(); inFlight {
		t.Error("the journal outlived an applied plan")
	}
}

func TestAnUnhealthyHostGetsItsOldFilesBack(t *testing.T) {
	f := newApplier(t)
	f.host.unhealthy = true
	out, err := f.a.Apply(context.Background(), plan)
	var rollback *RollbackError
	if out != RolledBack || !errors.As(err, &rollback) || rollback.Restore != nil || rollback.Serial != 7 {
		t.Fatalf("%v, %v", out, err)
	}
	if f.read(t, "wg0.conf") != "old peers\n" || f.read(t, "bird/bird.conf") != "<none>" || f.host.reloads != 2 {
		t.Errorf("after the rollback: %q, %q, %d reloads", f.read(t, "wg0.conf"), f.read(t, "bird/bird.conf"), f.host.reloads)
	}
}

func TestARiskyPlanStaysOnceConfirmedInItsWindow(t *testing.T) {
	f := newApplier(t)
	risky := plan
	risky.Risky = true
	if out, err := f.a.Apply(context.Background(), risky); out != Pending || err != nil {
		t.Fatalf("%v, %v", out, err)
	}
	if _, err := f.a.Apply(context.Background(), plan); !errors.Is(err, ErrPlanInFlight) {
		t.Errorf("a second plan while one waits: %v", err)
	}
	f.now = f.now.Add(4 * time.Minute)
	if out, err := f.a.Confirm(context.Background()); out != Applied || err != nil {
		t.Fatalf("confirm: %v, %v", out, err)
	}
	if f.read(t, "wg0.conf") != "new peers\n" {
		t.Errorf("wg0.conf %q", f.read(t, "wg0.conf"))
	}
}

// A host cut off by its new configuration never confirms; the agent may even restart in the
// window. Whoever settles after the deadline puts the old files back.
func TestARiskyPlanNotConfirmedIsRolledBackAcrossARestart(t *testing.T) {
	f := newApplier(t)
	risky := plan
	risky.Risky = true
	if out, err := f.a.Apply(context.Background(), risky); out != Pending || err != nil {
		t.Fatalf("%v, %v", out, err)
	}
	restarted := &Applier{Root: f.a.Root, StateDir: f.a.StateDir, Host: f.host, Window: f.a.Window, Now: f.a.Now}
	if out, deadline, err := restarted.Settle(context.Background()); out != Pending || err != nil || !deadline.Equal(f.now.Add(5*time.Minute)) {
		t.Fatalf("inside the window: %v, %v, %v", out, deadline, err)
	}
	f.now = f.now.Add(5*time.Minute + time.Second)
	out, _, err := restarted.Settle(context.Background())
	if out != RolledBack || !errors.Is(err, ErrNotConfirmed) {
		t.Fatalf("past the window: %v, %v", out, err)
	}
	if f.read(t, "wg0.conf") != "old peers\n" || f.read(t, "bird/bird.conf") != "<none>" {
		t.Errorf("after the rollback: %q, %q", f.read(t, "wg0.conf"), f.read(t, "bird/bird.conf"))
	}
}

func TestAPlanCannotLeaveItsRoot(t *testing.T) {
	f := newApplier(t)
	for _, path := range []string{"../escape", "/etc/passwd", "bird/../../escape", "", "wg0.conf\x00"} {
		bad := Plan{Serial: 8, Files: []File{{Path: "wg0.conf", Data: []byte("x")}, {Path: path, Data: []byte("x")}}}
		if _, err := f.a.Apply(context.Background(), bad); !errors.Is(err, ErrPlanPath) {
			t.Errorf("%q: %v", path, err)
		}
	}
	if f.read(t, "wg0.conf") != "old peers\n" || f.host.reloads != 0 {
		t.Errorf("a refused plan changed the host: %q, %d reloads", f.read(t, "wg0.conf"), f.host.reloads)
	}
}

func TestForwardPlanKeepsWhatItWroteWhenTheProbeFails(t *testing.T) {
	f := newApplier(t)
	f.host.unhealthy = true
	out, err := f.a.Apply(context.Background(), Plan{
		Serial: 9, Forward: true,
		Files: []File{{Path: "wg0.conf", Data: []byte("no peers\n")}},
	})
	var fe *ForwardError
	if out != ForwardFailed || !errors.As(err, &fe) || fe.Serial != 9 {
		t.Fatalf("Apply = %v, %v; want ForwardFailed with a ForwardError", out, err)
	}
	if got := f.read(t, "wg0.conf"); got != "no peers\n" {
		t.Fatalf("wg0.conf = %q; a forward plan restores nothing", got)
	}
	if _, inFlight, _ := f.a.readJournal(); inFlight {
		t.Fatal("a forward plan left a journal")
	}
	if f.host.reloads != 1 {
		t.Fatalf("reloads = %d; a forward plan reloads once and never for a rollback", f.host.reloads)
	}
}

func TestForwardPlanAppliesAndCannotBeRisky(t *testing.T) {
	f := newApplier(t)
	if out, err := f.a.Apply(context.Background(), Plan{Serial: 3, Forward: true, Risky: true,
		Files: []File{{Path: "wg0.conf", Data: []byte("x\n")}}}); out != 0 || !errors.Is(err, ErrForwardRisky) {
		t.Fatalf("forward and risky: %v, %v", out, err)
	}
	if got := f.read(t, "wg0.conf"); got != "old peers\n" {
		t.Fatalf("a refused plan wrote wg0.conf: %q", got)
	}
	out, err := f.a.Apply(context.Background(), Plan{Serial: 4, Forward: true,
		Files: []File{{Path: "zones/example.zone", Data: []byte("zone\n")}}})
	if out != Applied || err != nil || f.read(t, "zones/example.zone") != "zone\n" {
		t.Fatalf("a healthy forward plan: %v, %v", out, err)
	}
}
