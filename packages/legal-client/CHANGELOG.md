# @ghub/legal-client

## 0.3.0

### Minor Changes

- d4f6bc8: GPlatform Terms is GPlatform Legal (D152): `@ghub/terms-rules` and `@ghub/terms-client` go on as `@ghub/legal-rules` and `@ghub/legal-client`. Change the dependency and the imports; the service is at `https://legal.gplatform.org` (the old address answers too), and a standing the client read from it says `source: "gplegal"` where it said `"gpterms"`. The snapshot key keeps its id `gpterms-snapshot`, so snapshots verify as before.

### Patch Changes

- Updated dependencies [d4f6bc8]
  - @ghub/legal-rules@0.2.0

Until 0.1.3 (rules) and 0.2.0 (client) this package was `@ghub/terms-client`; the history below is that name's.

## 0.2.0

### Minor Changes

- ee6ea4a: Privacy requests from GPlatform Terms: `handlePrivacyRuns` publishes the product's erasure catalogue, takes the runs staff queued for its surface, carries each out (or counts it, in a dry run) and reports back. `publishErasureCatalogue`, `takePrivacyRuns` and `reportPrivacyRun` are the same steps one at a time.
