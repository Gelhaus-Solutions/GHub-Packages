# @ghub/gmint-protocol

## 0.3.0

### Minor Changes

- Approvals (GMint E12-04). A new message, the poll (`typ` gmint-poll+jws, `POLL_PATH` `/v1/token/poll`), signed with the request's key on a connection of its own, names a pending approval by `request_id` and the request it waits for by `req_hash`: `buildPoll` builds it from the `BuiltRequest` the client kept, `verifyPoll` runs the request's checks in the same order and reports `poll_*` reasons, which `publicCode` maps like the `request_*` ones. `buildPollResponse` answers it with the existing response format, bound to the original request's hash and the poll's exporter and, when issued, sealed to the original request's `enc`; it takes the original request as the server stored it (a `VerifiedRequest`: the payload, the kid and the hash as bytes). `verifyResponse` is unchanged and checks such an answer given the original request and the poll's exporter. `buildResponse` and `buildPollResponse` share one implementation. New code `approval_expired` (not retryable). SPEC section 8 describes the poll and the pending flow.

## 0.2.0

### Minor Changes

- 150b651: A token request may name its repositories by name within the installation instead of by id (`scope.repositories`), or name none for an org-scoped token. A granted scope always carries the ids when it has repositories, plus the names aligned with them when the request named them; the client checks names against names and requires an id for each, and an org-scoped request must get no repositories back. SPEC sections 3 and 5 describe both (GMint D-71).

### Patch Changes

- 8f86b1b: SPEC.md now states each rule exactly as the code enforces it, after a second reading against the code. No code changed.

## 0.1.0

### Minor Changes

- c2913ca: First release: GMint's wire protocol. Signed, channel-bound requests; signed responses bound to the request hash and connection, with the credential sealed by HPKE to a per-request client key; certificate renewal (a signed, channel-bound request with an Ed25519 CSR, answered with a signed chain the caller checks against its own key and pinned root); a strict JSON parser; compact EdDSA JWS and HPKE base mode on node:crypto, checked against the RFC 8037 and RFC 9180 vectors. No dependencies.
