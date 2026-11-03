package agentcore

import (
	"context"
	"sync"
	"time"
)

// BundleSync is one agent's bundle loop step: fetch, verify, and keep only what is new. An agent
// calls Next on every poll and waits PollDelay between calls, or no more than jitter after a
// fetch the control plane held (Held).
type BundleSync struct {
	Client   *Client
	Path     string
	Verifier *BundleVerifier
	Floor    *SerialFloor
	// Wait, when set, long-polls: once the agent holds a bundle, each fetch asks the control
	// plane to hold it up to Wait for a newer one (Client.FetchBundleWait). At most MaxBundleWait.
	Wait time.Duration

	mu   sync.Mutex
	etag string
	held bool
}

// Held reports whether the control plane held the last fetch for the wait asked, so the next one
// may follow at once. It is false after an error.
func (s *BundleSync) Held() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.held
}

// Next fetches the bundle and returns it when it is new: signed by a pinned key and above the
// floor, which it has already raised. It returns nil and no error when nothing changed. A bundle
// that fails verification or the floor is an error and leaves the ETag alone, so the next poll
// fetches it in full again.
func (s *BundleSync) Next(ctx context.Context) (*Bundle, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.held = false
	res, err := s.Client.FetchBundleWait(ctx, s.Path, s.etag, s.Wait)
	if err != nil {
		return nil, err
	}
	s.held = res.Held
	if res.NotModified {
		return nil, nil
	}
	b, err := s.Verifier.Open(res.Note)
	if err != nil {
		return nil, err
	}
	changed, err := s.Floor.Accept(b)
	if err != nil {
		return nil, err
	}
	s.etag = res.ETag
	if !changed {
		return nil, nil
	}
	return b, nil
}
