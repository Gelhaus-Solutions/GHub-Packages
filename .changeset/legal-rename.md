---
"@ghub/legal-rules": minor
"@ghub/legal-client": minor
---

GPlatform Terms is GPlatform Legal (D152): `@ghub/terms-rules` and `@ghub/terms-client` go on as `@ghub/legal-rules` and `@ghub/legal-client`. Change the dependency and the imports; the service is at `https://legal.gplatform.org` (the old address answers too), and a standing the client read from it says `source: "gplegal"` where it said `"gpterms"`. The snapshot key keeps its id `gpterms-snapshot`, so snapshots verify as before.
