# The bundled snapshot

No snapshot is bundled yet. This directory is where a release of
`@ghub/terms-rules` carries the signed snapshot that `offline()` decides from:

- `snapshot.json`: the snapshot, exactly as GPlatform Terms wrote it, in
  canonical JSON. Not reformatted, not pretty-printed, no trailing newline: the
  signature covers these bytes, and a reformatted copy does not verify.
- `snapshot.sig.json`: `{ "keyId", "keyVersion", "signature" }`, the Ed25519
  signature over those bytes by the service's signing key.

The first release that carries one also pins the public half of the signing key
in `src/keys.ts`. Until then `offline()` throws `NoBundledSnapshotError`, and a
caller binds a snapshot it holds itself with `bind()`.
