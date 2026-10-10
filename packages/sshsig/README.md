# @ghub/sshsig

Verification of SSHSIG signatures (OpenSSH
[PROTOCOL.sshsig](https://github.com/openssh/openssh-portable/blob/master/PROTOCOL.sshsig)), the
format `ssh-keygen -Y sign` writes, for keys that live on a FIDO2 hardware key
(`sk-ssh-ed25519@openssh.com`). The private key never exists as a file and every signature needs a
touch, which is why GMint and GLockdown use it for everything only the operator may sign: policy,
lockdowns, lifts and approvals.

- **Strict**: version 1 only, the namespace must match, the reserved field must be empty, no
  trailing bytes anywhere, and the key inside the signature must be byte-equal to an allowed key.
- **User presence** is required on `sk-` signatures unless the caller says otherwise; user
  verification (PIN) can be required too.
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

Verification returns a result and never throws on bad input. `@ghub/sshsig/testing` has a
software stand-in for a FIDO2 key that produces the same bytes, for tests only.

## Licence

Elastic License 2.0. See [LICENSE](../../LICENSE).
