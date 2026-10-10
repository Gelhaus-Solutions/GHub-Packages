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

## Certificate renewal

Client certificates live 7 days. The client renews its certificate for the same key once two
thirds of its life are gone, checking on an hourly timer (which never keeps the process alive) and
before each `getToken`, and writes the new chain over `tls.certFile` in one step. Several
processes may share the files: a renewal one of them wrote is picked up by the others. A renewal
that fails is reported to `onRenewError` and the old certificate stays in use while it is valid,
so alert on that callback: a certificate that runs out cannot be renewed any more, only re-enrolled.
`renewCertificate()` renews at once; `close()` stops the timer; `autoRenew: false` turns it all
off.

## Handling the token

`GmintToken` never prints itself: `String(token)`, `JSON.stringify(token)` and `util.inspect`
show `[GmintToken redacted]`. Read the secret with `reveal()` and pass it straight to the call that
needs it. `revoke()` (or `await using`) revokes it on GitHub.

Key files must be `chmod 600`; the client refuses anything group- or world-readable.

## Security guidance

- Keep the TLS key, the signing key and the sequence file on the host that calls GMint, `chmod 600`,
  never in an image or a repository. Where you can, keep the signing key on hardware or a separate
  host: against a compromised GMint edge holding a stolen key, the request signature is the only
  defence.
- Take the tenant from the authenticated session, never from stored configuration or the request,
  and keep your own per-tenant installation mapping. GMint checks the tenant against the grant
  again, so either side alone stops a request for another tenant's installation.
- Ask for the least: the one installation, the named repositories and the permissions this
  operation uses. Leaving them out is an error, never "everything".
- Give each replica its own identity unless replicas share the sequence file: a second holder of
  the same key looks exactly like a cloned key and gets the client quarantined.
- `await using` the token and pass `reveal()` straight to the call that needs it; never log, store
  or return it.
- Treat `locked_down` as its own state (GitHub access is locked down), `untrusted` as an attack,
  and retry only what `retryable` allows.
- Wire `onRenewError` to your alerting, and pin GMint's server keys and root as the operator gives
  them to you, never as fetched from the network.

## NestJS

[`examples/nestjs/gmint.module.ts`](examples/nestjs/gmint.module.ts) replaces a token service that
held the GitHub App's private key with one that holds none. It type-checks against this package
(`pnpm typecheck:examples`).

```ts
@Module({ imports: [GmintModule.forRoot(gmintOptions)] })
export class GitSyncModule {}

// in a service that injects GmintTokenService:
await using token = await this.gmint.tokenForInstallation({
  grant: "gadvisory-git-sync",
  installationId: row.installationId,
  repositoryIds: [row.repositoryId],
  permissions: { contents: "read" },
  tenant: session.scopeId,
});
await git.fetch({ auth: token.reveal() });
```

`tokenForInstallation` maps GMint's codes to HTTP exceptions: `locked_down` to a 503 that says so,
`denied` and `quarantined` to 403, `untrusted` to a logged 500.

## Errors

`GmintError.code` is one of the protocol's stable codes (`denied`, `locked_down`,
`witness_stale`, `rate_limited`, `unavailable`, ...), `transport`, or `untrusted`. `untrusted`
means a response failed verification: treat it as an attack, not an outage. `retryable` says
whether trying again later can help; the client already retries those a few times.

No third-party dependencies. The wire protocol is [`@ghub/gmint-protocol`](../gmint-protocol).

## Licence

Elastic License 2.0. See [LICENSE](../../LICENSE).
