# @ghub/gmint-sdk

The client for [GMint](https://ennogelhaus.de), the broker that holds GitHub App private keys.
Your service asks for exactly the installation, repositories and permissions one operation needs,
and gets a GitHub installation token that lives at most an hour. Your service never holds the App's
private key.

```ts
import { GmintClient } from "@ghub/gmint-sdk";

const gmint = new GmintClient({
  url: "https://mint.example.org:8443",
  instance: "prod-1",
  clientId: "gmint://gadvisory/api",
  signingKey: { kid: "gadv-api-2026-10", file: "/etc/gadvisory/gmint/sign.pem" },
  tls: {
    certFile: "/etc/gadvisory/gmint/client.pem",
    keyFile: "/etc/gadvisory/gmint/client.key",
    caFile: "/etc/gadvisory/gmint/root.pem",
  },
  serverKeys: { "gmint-resp-1": "<b64url Ed25519 public key>" },
  sequenceFile: "/var/lib/gadvisory/gmint.seq",
});

await using token = await gmint.getToken({
  grant: "gadvisory-git-sync",
  installationId: 12345678,
  repositoryIds: [111],
  permissions: { contents: "read" },
  tenant: session.scopeId, // from the authenticated session, never from stored config
});
await git.fetch({ auth: token.reveal() });
// leaving the block revokes the token on GitHub
```

## What it checks for you

- **TLS 1.3 with your client certificate**, trusting only the GMint root CA you pin, never the
  public WebPKI.
- **Your request is signed** with your Ed25519 key over the exact bytes sent, and **bound to the TLS
  connection** it travels on (RFC 9266), so a captured request is useless anywhere else.
- **GMint's answer is verified** against the server keys you pin, must answer your request and your
  connection, and is fresh. The token arrives **sealed to a key generated for this one request**.
- **Nothing wider than asked**: a token whose scope exceeds the request is refused.
- **Clone detection**: every request carries the next number of a durable counter; a second
  holder of your key shows up and gets you quarantined, which is what you want.

## Handling the token

`GmintToken` never prints itself: `String(token)`, `JSON.stringify(token)` and `util.inspect`
show `[GmintToken redacted]`. Read the secret with `reveal()` and pass it straight to the call that
needs it. `revoke()` (or `await using`) revokes it on GitHub.

Key files must be `chmod 600`; the client refuses anything group- or world-readable.

## Errors

`GmintError.code` is one of the protocol's stable codes (`denied`, `locked_down`,
`witness_stale`, `rate_limited`, `unavailable`, ...), `transport`, or `untrusted`. `untrusted`
means a response failed verification: treat it as an attack, not an outage. `retryable` says
whether trying again later can help; the client already retries those a few times.

No third-party dependencies. The wire protocol is [`@ghub/gmint-protocol`](../gmint-protocol).

## Licence

Elastic License 2.0. See [LICENSE](../../LICENSE).
