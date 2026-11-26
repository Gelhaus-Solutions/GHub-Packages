# @ghub/sshsig

Verification of SSHSIG signatures (OpenSSH
[PROTOCOL.sshsig](https://github.com/openssh/openssh-portable/blob/master/PROTOCOL.sshsig)), the
format `ssh-keygen -Y sign` writes, for keys that live on a FIDO2 hardware key:
`sk-ssh-ed25519@openssh.com`, or `sk-ecdsa-sha2-nistp256@openssh.com` for a P-256 key such as a
Secure Enclave one. The private key never exists as a file and every signature needs a touch, which
is why GMint and GLockdown use it for everything only the operator may sign: policy, lockdowns,
lifts and approvals.

- **Strict**: version 1 only, the namespace must match, the reserved field must be empty, no
  trailing bytes anywhere, ECDSA's r and s must be minimal mpints, and the key inside the signature
  must be byte-equal to an allowed key.
- **User presence** is required on `sk-` signatures of either type unless the caller says
  otherwise; user verification (PIN or biometric) can be required too.
- **Software keys** (`ssh-ed25519`) are refused unless the caller opts in.
- **No dependencies.** Everything is `node:crypto`; the tests check against `ssh-keygen -Y verify`
  when it is installed.

```ts
import { parsePublicKey, verifySshsig } from "@ghub/sshsig";

const key = parsePublicKey("sk-ssh-ed25519@openssh.com AAAA... operator");
if (!key.ok) throw new Error(key.error);
const result = verifySshsig({
  signature,
  message,
  namespace: "glockdown-lift",
  allowed: [key.value],
});
if (!result.ok) refuse(result.error);
```

Verification returns a result and never throws on bad input.

## Certificates

A signature by a certified key (`ssh-keygen -s`) counts only where the caller passes the
authorities whose certificates it accepts. The authority's signature over the certificate must
hold, with user presence when the authority is an `sk-` key; the certificate must be a user
certificate without critical options, name one of the authority's principals, and be valid at `at`
(default now), plus `graceSeconds` after its expiry. The certified key itself may be a software key.

```ts
import { parseAllowedSigner, signersFor, verifySshsig } from "@ghub/sshsig";

const lines = allowedSigners.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
const signers = lines.map((l) => {
  const s = parseAllowedSigner(l);
  if (!s.ok) throw new Error(s.error);
  return s.value;
});
const result = verifySshsig({
  signature,
  message,
  namespace: "git",
  ...signersFor(signers, "git"),
});
```

`parseAllowedSigner` takes the `cert-authority` and `namespaces` options and refuses a line with
`valid-after`, `valid-before` or anything else rather than read it without its limit. Principal
patterns are compared exactly, not expanded.

## Passkeys

With `allowWebauthn`, an `sk-ecdsa-sha2-nistp256@openssh.com` key also verifies
`webauthn-sk-ecdsa-sha2-nistp256@openssh.com` signatures: a P-256 passkey's, made in a browser, whose
application is the passkey's RP ID. The signed bytes are the WebAuthn challenge; clientDataJSON must
begin with the type `webauthn.get`, that challenge in unpadded base64url and the origin, in that
order, as OpenSSH requires. A passkey can sign directly or vouch for certificates as an authority.

## Testing

`@ghub/sshsig/testing` has software stand-ins for both FIDO2 key types (`softwareSkSigner`,
`softwareSkEcdsaSigner`), plain Ed25519 keys (`softwareEd25519Signer`), passkeys
(`softwarePasskey`) and certificates (`softwareCertificate`) that produce the same bytes, for tests
only.

## Licence

Elastic License 2.0. See [LICENSE](../../LICENSE).
