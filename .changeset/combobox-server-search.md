---
"@ghub/ui": minor
---

`Combobox` searches on the server when given `load`: the options are what it answers for the typed text (150 ms after typing stops, a load the text moved past aborted), `options` then holds only the committed one, and a committed server option keeps its label. `browse` adds a last row ("Search and filter all 38") that hands the typed text to a picker; Enter on it does the same. Without either, nothing changes.
