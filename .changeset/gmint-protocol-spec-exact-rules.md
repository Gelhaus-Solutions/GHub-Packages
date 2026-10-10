---
"@ghub/gmint-protocol": patch
---

SPEC.md now states each rule exactly as the code enforces it, after a second reading against the
code: the `iss`, `aud` and node id patterns, `purpose` counted in UTF-16 code units without C0
controls or DEL, the seal's ciphertext bounds, a credential's characters (no space), the
`expires_at` form, the CSR's URI names and the subject the verifier ignores, certificate sizes in a
renewal answer, and the 60 s allowance on a certificate's start. No code changed.
