# @ghub/terms-rules

## 0.1.3

### Patch Changes

- 0ec5604: The first release that carries a snapshot: `offline()` now binds serial 203 of GPlatform Terms' archive, and `PINNED_KEYS` holds the service's signing key (`gpterms-snapshot` version 1), so `@ghub/terms-client` can verify what the service sends. On every surface `@ghub/gctl-terms` 0.1.4 answered for, it answers the same through the first rollout, except GOpenCDR, GOpenCNR and GOpenCSR, whose surfaces cover a document that is archived and not yet dated: the rules refuse those until a later snapshot dates it.

## 0.1.2

### Patch Changes

- dc82de2: A rollout may say a version binds at once and why (`atOnce`): `editorial`, a fix whose acceptance of the version before it carries over so nobody is asked again, or `no-accounts`, dated while nobody had accepted anything. Either is exempt from the six weeks and a day; every other rollout is held to them as before. A snapshot without the field reads as it did.

## 0.1.1

### Patch Changes

- The `license` field now reads `SEE LICENSE IN LICENSE`. These packages are Elastic License 2.0 with a non-commercial rider, and the bare `Elastic-2.0` identifier in package metadata said ELv2 alone, which is not what the LICENSE file grants. No code change; read the LICENSE in the package.
