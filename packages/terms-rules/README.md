# @ghub/terms-rules

The consent rules of the Gelhaus Solutions product family: where an account
stands with the documents its product asks it to accept, at a given instant,
decided from a signed snapshot of the legal archive.

The rules moved here from `@ghub/gctl-terms` 0.1.4, unchanged in meaning and
with their tests. Two things changed. The archive is no longer compiled into
the package: every rule decides from a snapshot that is passed in. And a
version's dates come from its rollout on each surface, falling back to the
version's default, so one product can announce and enforce a version later
than the others without moving their dates.

This package never talks to the network, never touches a database and never
reads the clock. Every question is asked at an instant the caller passes.

## Binding a snapshot

```ts
import { bind, verifySnapshot, PINNED_KEYS } from "@ghub/terms-rules";

const snapshot = verifySnapshot(json, signature, PINNED_KEYS);
const terms = bind(snapshot);

const state = terms.consentStateAt("gadvisory", account.termsAcceptedVersion, now, {
  paid: account.pays,
});
const toRecord = terms.versionToRecord("gadvisory", now);
```

`bind(snapshot)` checks the snapshot (unless `parseSnapshot` or
`verifySnapshot` produced it) and returns the rules bound to it:

- `consentStateAt(surface, recorded, now, who)`: the state, see below.
- `versionToRecord(surface, now)`: the identifier an acceptance at `now`
  stores, such as `gadvisory-terms-2026-10-01+gs-terms-2026-10-01`.
- `announcementsDue(surface, now)`: the versions a surface's accounts are owed
  notice of, with the date each binds there and the summary where one is owed.
- `consentLinks(surface, now)`: everything a consent line shows, pinned
  versions and live links alike.
- `documentStandings(surface, recorded, now, capacities?)`: where the account
  stands with each covered document, which the state sums up.
- `documentsFor(surface, now)`, `archivedVersion(versionId, surface?)`,
  `documentsOfConsent(recorded, surface?)`, `coversOf(surface)`, `surfaces()`
  and `snapshot`.

Each is also exported unbound, taking the snapshot as its first argument.

## Capacities

A surface can bind a covered document to one capacity it declares (GOpenCSR's
terms for mirror operators bind only the accounts operating a mirror). Pass the
capacities an account acts in, as its product knows them: `who.capacities` to
`consentStateAt`, and the trailing `capacities` argument to `versionToRecord`,
`announcementsDue`, `consentLinks`, `documentsFor` and `documentStandings`.
Leaving them out asks about an account acting in none, which is every account
on a surface without capacities.

An account that gains a capacity whose document is in force and that it has
not accepted is behind on it at once. One that loses a capacity keeps
everything it accepted while it held it. A capacity the snapshot does not
declare binds nothing, so an older cached snapshot keeps answering.

## Six weeks and a day

`earliestInForceFrom(announcedAt)` is the earliest a version that supersedes
another may come into force: 43 days of 24 hours, and the same Europe/Berlin
clock time 43 calendar days later, whichever is later. Across the autumn clock
change that is 43 days and an hour; across the spring change, 43 full days.
`parseSnapshot` holds every rollout to it.

## The five states

- `agreed`: the account accepted the newest version announced or in force.
- `asked`: it accepted the version in force and a newer one is announced. Full
  use; ask at sign-in, allow "not now". Carries the date to accept by.
- `owed-paid`: it has not accepted the version in force, and it pays. Full use,
  never restricted, asked at every sign-in.
- `restricted`: it has not accepted the version in force, and it does not pay.
  It may sign in, read, sign out, see and accept the terms, close its account
  and reach the data-protection contact, and nothing else.
- `exempt`: staff, who are not gated.

The state is decided per document and per surface, never by comparing whole
identifiers.

## Offline

`offline()` binds the snapshot bundled in this release, verified against the
keys this release pins. Self-hosted GControl uses it and never talks to
GPlatform Terms; new archived versions reach it with each release, as they
always have.

No release carries a snapshot yet. Until the first one does, `offline()` throws
`NoBundledSnapshotError`. It needs Node 22.3 or later.

## Snapshots and signatures

A snapshot (format 1) holds the documents, the metadata and hash of every
frozen version, what each surface covers, and the rollouts that date each
version on each surface. Not the texts, and never anybody's consent.
`parseSnapshot` refuses a malformed or contradictory snapshot whole, naming the
field, including any instant without a zone.

The server signs `canonicalJson(snapshot)` with Ed25519. `verifySnapshot`
refuses text that is not already canonical, a key this release does not pin,
and any change after signing.

## Moving from `@ghub/gctl-terms`

The rules of `@ghub/gctl-terms` 0.1.4 live here now, taking the archive as a
snapshot instead of compiling it in. `@ghub/gctl-terms` is retired once every
product has moved. The client products use to ask GPlatform Terms for a
standing and to record an acceptance is `@ghub/terms-client`, built on this.

Part of [GHub-Packages](https://github.com/Gelhaus-Solutions/GHub-Packages), the packages
the Gelhaus Solutions products share.

## Licence

Elastic License 2.0. Source-available: you may read, self-host and modify it for your own
organisation. You may not offer it as a service, and you may not circumvent the
licence-key functionality. See the `LICENSE` file in this package.

Copyright (c) 2026 Gelhaus Solutions (Enno Gelhaus). Built and maintained by
[Gelhaus Solutions](https://ennogelhaus.de).
