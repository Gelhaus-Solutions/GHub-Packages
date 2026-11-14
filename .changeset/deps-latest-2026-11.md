---
"@ghub/ui": patch
"@ghub/gmint-sdk": patch
---

`@ghub/ui` depends on lucide-react 1 (no brand icons, none of which it used), framer-motion 14 and tailwind-merge 3.7. `@ghub/gmint-sdk`'s "sequence lock is held too long" error carries the lock file's own error as its `cause`.
