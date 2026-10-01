# @ghub/totp

TOTP (RFC 6238) and the base32 alphabet authenticator apps expect. Hand-written rather
than pulled in: the algorithm is an HMAC, a counter and a truncation, and the tests
reproduce the RFC's own published vectors. No runtime dependencies beyond `node:crypto`.

```ts
import { generateTotpSecret, totpUri, verifyTotp } from "@ghub/totp";

const secret = generateTotpSecret();
const uri = totpUri({
  secretBase32: secret,
  issuer: "Example",
  accountName: "someone@example.com",
});
const ok = verifyTotp(secret, "123456");
```

Verification accepts one step of drift either side of now by default, because a phone's
clock drifts and a person locked out of their own account is worse than a thirty second
replay window.

## Moving from `@ghub/gctl-crypto`

Until `@ghub/gctl-crypto` 0.3.3 these functions were exported from there. They are the
same functions under the same names; only the import changes.

Part of [GHub-Packages](https://github.com/Gelhaus-Solutions/GHub-Packages), the packages
the Gelhaus Solutions products share.

## Licence

Elastic License 2.0. Source-available: you may read, self-host and modify it for your own
organisation. You may not offer it as a service, and you may not circumvent the
licence-key functionality. See the `LICENSE` file in this package.

Copyright (c) 2026 Gelhaus Solutions (Enno Gelhaus). Built and maintained by
[Gelhaus Solutions](https://ennogelhaus.de).
