# @ghub/gmint-sdk

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
