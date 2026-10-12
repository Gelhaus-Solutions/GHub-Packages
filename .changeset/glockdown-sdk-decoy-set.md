---
"@ghub/glockdown-sdk": minor
---

The app's decoy set for GLockdown's inventory (L120): `Honeytokens.fingerprints()` gives the SHA-256 of each decoy key and decoy login (trimmed, lower case), and `reportDecoys` tells the edge's `POST /v1/decoyset` over the same pinned TLS, so GLockdown can check that each decoy it lists is still held by the app. Hashes only; never a raise.
