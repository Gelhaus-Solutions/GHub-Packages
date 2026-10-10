---
"@ghub/gmint-protocol": minor
---

First release: GMint's wire protocol. Signed, channel-bound requests; signed responses bound to the request hash and connection, with the credential sealed by HPKE to a per-request client key; certificate renewal (a signed, channel-bound request with an Ed25519 CSR, answered with a signed chain the caller checks against its own key and pinned root); a strict JSON parser; compact EdDSA JWS and HPKE base mode on node:crypto, checked against the RFC 8037 and RFC 9180 vectors. No dependencies.
