# @ghub/gmint-protocol

The wire protocol of [GMint](https://ennogelhaus.de), the broker that holds GitHub App private
keys and mints short-lived, narrowly scoped installation tokens. Most code wants
[`@ghub/gmint-sdk`](../gmint-sdk), which speaks this protocol for you; this package is for the
server and for anyone implementing a client in another stack.

What it gives you:

- **Requests** signed by the client (compact JWS, Ed25519) over the exact bytes sent, carrying the
  TLS exporter of the connection they travel on, so a captured request is useless on any other
  connection.
- **Responses** signed by GMint and bound to the request's hash and the same connection, with the
  credential sealed by HPKE (RFC 9180) to a key the client generated for that one request, so
  nothing between the two ends ever sees it.
- **Strict parsing**: no duplicate keys, no prototype keys, no unsafe integers, no second spelling
  of the same bytes. The payload is parsed only after its signature verified.
- **No dependencies.** Everything is `node:crypto`, checked against the RFC 8037 and RFC 9180
  vectors.

The normative description is [SPEC.md](SPEC.md).

```ts
import { buildRequest, channelBinding, localSigner, verifyResponse } from "@ghub/gmint-protocol";

const cb = channelBinding(tlsSocket)!; // after the TLS 1.3 handshake
const request = await buildRequest({ signer, iss, aud, htu, seq, cb, req });
// send request.jws on the same socket, read the response body, then:
const result = verifyResponse(body, { serverKeys, request, clientKid: signer.kid, cb });
```

Verification functions return a verdict and never throw on bad input.

## Licence

Elastic License 2.0. See [LICENSE](../../LICENSE).
