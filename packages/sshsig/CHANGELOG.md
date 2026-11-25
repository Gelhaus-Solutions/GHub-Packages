# @ghub/sshsig

## 0.2.0

### Minor Changes

- 891f1e5: `sk-ecdsa-sha2-nistp256@openssh.com` keys and signatures (FIDO2 P-256, as a Secure Enclave key makes) verify like `sk-ssh-ed25519`, under the same user-presence and user-verification rules. `SK_ECDSA_P256` and `SshKeyType` name the types; for this one `SshPublicKey.key` is the 65-byte uncompressed point. A point off the curve, another curve, or an r or s that is not a minimal mpint is refused. `@ghub/sshsig/testing` adds `softwareSkEcdsaSigner`.

## 0.1.0

### Minor Changes

- 1365114: First release: SSHSIG verification for hardware-key signatures (sk-ssh-ed25519 and, when the caller opts in, ssh-ed25519), moved here from GMint so GMint and GLockdown share one implementation. Strict parsing, namespace and allowed-key checks, user presence and verification flags, and a software FIDO2 stand-in for tests. No dependencies.
