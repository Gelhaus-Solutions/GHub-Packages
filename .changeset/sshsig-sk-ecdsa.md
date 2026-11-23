---
"@ghub/sshsig": minor
---

`sk-ecdsa-sha2-nistp256@openssh.com` keys and signatures (FIDO2 P-256, as a Secure Enclave key makes) verify like `sk-ssh-ed25519`, under the same user-presence and user-verification rules. `SK_ECDSA_P256` and `SshKeyType` name the types; for this one `SshPublicKey.key` is the 65-byte uncompressed point. A point off the curve, another curve, or an r or s that is not a minimal mpint is refused. `@ghub/sshsig/testing` adds `softwareSkEcdsaSigner`.
