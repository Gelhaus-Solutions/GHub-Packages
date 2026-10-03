# The bundled snapshot

The signed snapshot of the legal archive that `offline()` decides from, as
GPlatform Terms served it when this release was cut:

- `snapshot.json`: the snapshot, exactly as GPlatform Terms wrote it, in
  canonical JSON. Not reformatted, not pretty-printed, no trailing newline: the
  signature covers these bytes, and a reformatted copy does not verify.
- `snapshot.sig.json`: `{ "keyId", "keyVersion", "signature" }`, the Ed25519
  signature over those bytes by the service's signing key, pinned in
  `src/keys.ts`.

To carry a newer one, take both files from the service as they are served, never
retyped:

```
curl -s https://terms.gplatform.org/api/public/v1/snapshot -o snapshot.json
curl -s https://terms.gplatform.org/api/public/v1/snapshot.sig -o snapshot.sig.json
```

0.1.3 carries serial 203 (generated 2026-10-03 11:44 UTC, sha256
`242d7772d8ff79e73614f9bd24bbba15c09481175538f742f81e2298d595b024`).
