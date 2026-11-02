---
"@ghub/ui": patch
---

`Table`'s scroll frame is a positioning box (`relative`). What a cell places absolutely, a header's `sr-only` label above all, now scrolls inside the frame; placed against a box outside it, it widened the whole page on a phone.
