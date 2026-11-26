---
"@ghub/sshsig": minor
---

Passkey signatures: with `allowWebauthn`, an `sk-ecdsa-sha2-nistp256@openssh.com` key also verifies `webauthn-sk-ecdsa-sha2-nistp256@openssh.com` signatures, the format OpenSSH reads from a P-256 passkey used in a browser, signing directly or as a certificate authority. clientDataJSON must begin with the type, the challenge (the signed bytes) and the origin, as OpenSSH requires; attested data and unannounced extension data are refused. Without the option such a signature is refused as `webauthn_not_allowed`. `@ghub/sshsig/testing` adds `softwarePasskey`.
