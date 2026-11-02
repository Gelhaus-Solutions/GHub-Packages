---
"@ghub/ui": patch
---

`Badge` positions its hidden word against the pill itself (`relative`). A badge with a `word` inside a table that scrolls on a phone no longer widens the whole page: the word's `sr-only` span was placed against a box outside the scroll frame.
