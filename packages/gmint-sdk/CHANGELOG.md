# @ghub/gmint-sdk

## 0.3.0

### Minor Changes

- `getToken` waits for an operator's approval instead of throwing `approval_required` at once (GMint E12-04). On a pending answer it keeps the request and polls `/v1/token/poll` every `approvalPollMs` (default 2000), each poll signed, on its own connection and with the next sequence number, until the token is issued (returned as before), refused (`denied`, `approval_expired` and the other codes, thrown as before), or `approvalTimeoutMs` passes (default 300 000; then `approval_required` with the approval's id, as 0.2 threw at once). A second argument takes these, `onApprovalPending(requestId)`, called once, and an `AbortSignal` that ends the wait. A pending request is never sent again; a poll that meets an outage is asked again at the next turn.

### Patch Changes

- Updated dependencies
  - @ghub/gmint-protocol@0.3.0

## 0.2.0

### Minor Changes

- 150b651: `getToken` takes `repositories` (names within the installation) instead of `repositoryIds`, or neither for an org-scoped token; `token.scope` then carries the ids GitHub resolved and the names aligned with them (GMint D-71).

### Patch Changes

- Updated dependencies [150b651, 8f86b1b]
  - @ghub/gmint-protocol@0.2.0

## 0.1.0

### Minor Changes

- 2fc5797: First release: the GMint client. getToken opens TLS 1.3 with the client certificate (trusting only the pinned GMint root), signs a channel-bound request with a durable sequence number, verifies the signed response against pinned server keys, opens the sealed token and refuses anything wider than asked. Tokens never print themselves and revoke on dispose. The client certificate renews itself for the same key before it expires. No third-party dependencies.

### Patch Changes

- Updated dependencies [c2913ca]
  - @ghub/gmint-protocol@0.1.0
