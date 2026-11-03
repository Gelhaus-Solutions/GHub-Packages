package agentcore

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"syscall"
)

// writeFileAtomic replaces path with data in a way a crash cannot tear: the bytes go to a
// temporary file in the same directory, which is synced, renamed over path, and the directory
// synced after, so the file afterwards holds either the old contents or the new ones.
func writeFileAtomic(path string, data []byte, perm os.FileMode) (err error) {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, "."+filepath.Base(path)+".*")
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = os.Remove(tmp.Name())
		}
	}()
	if err := tmp.Chmod(perm); err != nil {
		_ = tmp.Close()
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmp.Name(), path); err != nil {
		return err
	}
	return syncDir(dir)
}

// syncDir makes a rename in dir durable. Some systems cannot sync a directory; the rename has
// happened either way, so only an error the system does report counts.
func syncDir(dir string) error {
	d, err := os.Open(dir)
	if err != nil {
		return err
	}
	defer func() { _ = d.Close() }()
	if err := d.Sync(); err != nil && !errors.Is(err, errors.ErrUnsupported) && !errors.Is(err, syscall.EINVAL) {
		return fmt.Errorf("sync %s: %w", dir, err)
	}
	return nil
}
