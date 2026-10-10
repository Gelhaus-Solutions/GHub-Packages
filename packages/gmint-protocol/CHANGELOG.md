# @ghub/gmint-protocol

## 0.2.0

### Minor Changes

- 150b651: A token request may name its repositories by name within the installation instead of by id (`scope.repositories`), or name none for an org-scoped token. A granted scope always carries the ids when it has repositories, plus the names aligned with them when the request named them; the client checks names against names and requires an id for each, and an org-scoped request must get no repositories back. SPEC sections 3 and 5 describe both (GMint D-71).

### Patch Changes

- 8f86b1b: SPEC.md now states each rule exactly as the code enforces it, after a second reading against the code. No code changed.

## 0.1.0

### Minor Changes

- c2913ca: First release: GMint's wire protocol. Signed, channel-bound requests; signed responses bound to the request hash and connection, with the credential sealed by HPKE to a per-request client key; certificate renewal (a signed, channel-bound request with an Ed25519 CSR, answered with a signed chain the caller checks against its own key and pinned root); a strict JSON parser; compact EdDSA JWS and HPKE base mode on node:crypto, checked against the RFC 8037 and RFC 9180 vectors. No dependencies.
