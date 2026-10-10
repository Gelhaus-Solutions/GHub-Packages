# @ghub/sshsig

## 0.1.0

### Minor Changes

- 1365114: First release: SSHSIG verification for hardware-key signatures (sk-ssh-ed25519 and, when the caller opts in, ssh-ed25519), moved here from GMint so GMint and GLockdown share one implementation. Strict parsing, namespace and allowed-key checks, user presence and verification flags, and a software FIDO2 stand-in for tests. No dependencies.
