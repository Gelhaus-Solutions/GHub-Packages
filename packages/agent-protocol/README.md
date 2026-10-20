# @ghub/agent-protocol

The server half of the wire protocol the GOpen agents speak to their control plane: GOpenCDR's
mirror agent and GOpenCNR's join agent sign every request through the Go agent core
(`gopencsr/agentcore`), and each control plane checks it with this package.

- **Request assertions**: `Authorization: <scheme> <compact JWS>`, EdDSA only, a protected header
  of exactly `alg`, `typ` and one of `kid` (an enrolled key) or `jwk` (a new key, on the enrolment
  alone). The claims bind the api's origin (`aud`), the method, the path and the SHA-256 of the
  body exactly as sent, for 60 seconds at most, with a `jti` the caller takes once. No query
  string and no Content-Encoding, so nothing the server reads goes unsigned.
- **Key proofs** for a rotation: a JWS by the new key over the agent, the api and a minute, which
  the request carrying it, signed by the old key, completes.
- **Key ids**: the RFC 7638 thumbprint; small-order and non-canonical Ed25519 points are refused.
- **Strict parsing**: canonical base64url only, no unknown header members or claims, safe
  integers. Pure: looking the key up and taking the `jti` once are the caller's.
- **No dependencies.** Everything is `node:crypto`. The tests accept GOpenCDR's byte-for-byte
  vectors (`src/vectors.gopencdr-*.json`), which the Go agent core signs too.

Each product names its own scheme, JWS types, request paths and agent ids:

```ts
import {
  AssertionRefused,
  claimsMatch,
  parseAssertion,
  signatureHolds,
  type AgentProtocol,
} from "@ghub/agent-protocol";

const MIRROR: AgentProtocol = {
  scheme: "GOCDR-Mirror",
  requestType: "gocdr-mirror+jwt",
  keyProofType: "gocdr-mirror-key+jwt",
  paths: /^\/api\/v1\/mirrors(?:\/[a-z0-9-]{1,64}){1,4}$/,
  agentId: /^[a-z][0-9a-z]{1,31}$/,
};

const parsed = parseAssertion(MIRROR, request.headers.authorization);
const key = await lookUp(parsed.key); // the enrolled key by its id, or the new one it carries
if (!signatureHolds(parsed, key)) refuse("the signature does not verify");
claimsMatch(parsed.claims, {
  audience,
  method,
  path,
  query,
  contentEncoding,
  body,
  now: new Date(),
});
await takeOnce(parsed.claims.jti);
```

Everything that does not hold throws `AssertionRefused`, whose message tells the agent's operator
why. `@ghub/agent-protocol/testing` signs assertions and proofs as an agent would, for tests only.

## Licence

Elastic License 2.0. See [LICENSE](../../LICENSE).
