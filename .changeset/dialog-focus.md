---
"@ghub/ui": patch
---

`Dialog` no longer moves focus back to its panel when the caller re-renders. A caller passing a new `onClose` on every render (`() => setOpen(false)`) re-ran its open effect on each keystroke in a field inside it, so focus left the field after every character; Escape now reads the latest `onClose` instead.
