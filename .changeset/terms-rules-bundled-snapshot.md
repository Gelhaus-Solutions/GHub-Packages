---
"@ghub/terms-rules": patch
---

The first release that carries a snapshot: `offline()` now binds serial 203 of GPlatform Terms' archive, and `PINNED_KEYS` holds the service's signing key (`gpterms-snapshot` version 1), so `@ghub/terms-client` can verify what the service sends. On every surface `@ghub/gctl-terms` 0.1.4 answered for, it answers the same through the first rollout, except GOpenCDR, GOpenCNR and GOpenCSR, whose surfaces cover a document that is archived and not yet dated: the rules refuse those until a later snapshot dates it.
