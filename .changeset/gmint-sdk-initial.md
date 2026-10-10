---
"@ghub/gmint-sdk": minor
---

First release: the GMint client. getToken opens TLS 1.3 with the client certificate (trusting only the pinned GMint root), signs a channel-bound request with a durable sequence number, verifies the signed response against pinned server keys, opens the sealed token and refuses anything wider than asked. Tokens never print themselves and revoke on dispose. No third-party dependencies.
