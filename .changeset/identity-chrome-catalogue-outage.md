---
"@ghub/identity-chrome": patch
---

`createCatalogue` holds a failed ask for the cache time, as it holds an answer, and readers asking at the same moment share one ask. Before, every read after a failure asked Identity again, so during an outage each page render could wait out the whole timeout. The last good entry is still what a failure returns.
