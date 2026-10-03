# @ghub/terms-client

The client a Gelhaus Solutions product uses to talk to GPlatform Terms: where an
account stands with the documents its product asks it to accept, the acceptances
it makes, and the account facts notices are sent by. Server side only, the same
for a NestJS product and a Next.js one.

It is built around one rule: **if GPlatform Terms is down, nobody is locked
out.** A standing is asked of the service, which holds every acceptance in its
ledger. When the service cannot answer, the standing is decided in the product,
from the newest verified snapshot held and the product's own last known record.
Every acceptance and every account push is written to the product's own outbox
before it is sent, and whatever does not arrive now arrives on a later flush,
once.

Self-hosted deployments do not use this package. They decide from the snapshot
bundled with [`@ghub/terms-rules`](../terms-rules) (`offline()`) and never talk
to the service.

## Setting it up

```ts
import { createTermsClient, postgresOutboxStore } from "@ghub/terms-client";

export const terms = createTermsClient({
  baseUrl: "https://terms.gplatform.org",
  apiKey: process.env.GPTERMS_API_KEY!, // gpt_prod_..., from the product's secret store
  outbox: postgresOutboxStore((text, values) => prisma.$queryRawUnsafe(text, ...values)),
});

await terms.ready(); // once, at start; never throws
```

`ready()` reads the bundled snapshot and asks the service for a newer one. A
product that starts while the service is unreachable still starts, deciding from
the bundled snapshot until the service is back.

Options beyond these: `timeoutMs` (one request, 3 seconds), `refreshEveryMs`
(the snapshot check, 15 minutes), `snapshotStore` (where the last fetched
snapshot is kept between processes, see below), `onError` (told of everything
that went wrong without reaching the caller; `console.warn` unless given),
`clock`, `fetch`, `keys` and `bundled` (for tests).

## At the gate and at sign-in

```ts
const standing = await terms.stateOf("gadvisory", account.id, {
  recorded: account.termsAcceptedVersion, // the product's own last known record
  paid: account.pays,
  staff: account.isStaff,
});

switch (standing.state?.kind) {
  case "restricted": // free and behind: read, accept, close the account, nothing else
  case "owed-paid": // paid and behind: full use, ask at every sign-in
  case "asked": // a new version is announced: ask, allow "not now", accept by standing.state.inForceFrom
  case "agreed":
  case "exempt":
  case undefined: // nothing could decide (see below): do not gate
}
```

`standing.source` says who decided:

- `gpterms`: the service, from its ledger. `objections` lists any on file.
- `snapshot`: this client, from the snapshot and the record you passed, because
  the service could not answer or had not yet received everything in the
  outbox for this account. `why` says which.
- `none`: no snapshot is held and the service cannot be reached. `state` is
  null. Do not gate on it.

After the service fails to answer one request, a person's requests stop asking
it for 30 seconds (`QUIET_AFTER_FAILURE_MS`): standings are decided here and
acceptances go straight to the outbox, so a service that hangs costs one
timeout, not one per page. The scheduled flush and the snapshot refresh keep
trying meanwhile.

`toRecord`, `documents` (where the account stands with each covered document)
and `announcements` come with every standing that has a state.

The rules of `@ghub/terms-rules` are bound here to the newest snapshot, for the
questions that need no account: `terms.versionToRecord(surface, now)`,
`terms.consentLinks(surface, now)`, `terms.documentsFor(surface, now)`,
`terms.announcementsDue(surface, now)`, `terms.consentStateAt(...)` and
`terms.documentStandings(...)`. `terms.terms()` returns the whole bound set.

## Sign-up and the accept step

```ts
// Sign-up: tell the service about the account, then record what they accepted.
await terms.upsertSubject("gadvisory", account.id, {
  email: account.email,
  locale: account.locale, // "en", "de" or null (notices are then English)
  paid: false,
});

const recorded = terms.versionToRecord("gadvisory", acceptedAt);
await prisma.account.update({
  where: { id: account.id },
  data: { termsAcceptedVersion: recorded },
});

const outcome = await terms.recordConsent({
  surface: "gadvisory",
  accountId: account.id,
  recorded,
  acceptedAt,
  source: "sign-up", // or "accept-screen"
  requestRef: acceptance.id, // your own id for this acceptance
  ip: request.ip,
  userAgent: request.headers["user-agent"],
});
```

Keep writing `termsAcceptedVersion` (or whatever your column is called) on every
acceptance. It is what the client decides from when the service cannot answer.

`upsertSubject` returns as soon as the push is in the outbox; a sign-up never
waits on the service. Push again whenever the email, locale, paid, staff or
capacities change, with the whole state each time. `closeSubject` marks the
account closed: closed accounts are never sent notices.

`recordConsent` waits at most one request's timeout and never throws because the
service is down. `outcome.outcome` is `recorded`, `replayed` (the service
already had this `requestRef`, and returns the first row), `queued` (it goes on
a later flush) or `parked` (see below). `requestRef` is what makes sending
twice harmless: use an id that names this one acceptance, such as the id of the
row you write for it.

## A person's own record

```ts
const record = await terms.ownRecord("gadvisory", account.id);
```

The account's consents, the notices sent to it and its objections, on its own
surface only, for the product's "export my data". It throws a `TermsApiError`
while the service cannot answer: an export is retried, not made up.

## Privacy requests

A person who asks for their data to be erased, or objects to how it is
processed, is recorded in GPlatform Terms. Staff decide there, per product and
per kind of data, whether it is kept, pseudonymised or deleted, and queue that
as a run: a dry run counts what the plan would touch, a run that executes
carries it out. Terms never calls the product; the product asks, from the same
scheduler that flushes the outbox:

```ts
await terms.handlePrivacyRuns("gadvisory", {
  catalogue: PRIVACY_CATALOGUE,
  carryOut: (run) => erase(run.subject, run.plan, { execute: run.execute, ref: run.reference }),
});
```

`catalogue` lists every kind of data the product holds about a person: an `id`
the plan names, a `label` and a `detail` staff read, the `actions` it supports
and the `default` the console preselects, and `takesWithIt`, the categories that
cannot outlive it (deleting an account deletes its applications). It is
published on the first pass of each process and then hourly (`publishEveryMs`).

`carryOut` gets the run: its `reference` (`DSR-<day>-<n>`, the name to log
instead of the person), the person's `email`, other `identifiers` and the
product's own `accountIds` that Terms knows at the address, the `plan` with one
action per category, and `execute`, false for a dry run that must change
nothing. It returns what it `found` and what it did (`done`) per category, and
optionally what stays whatever the plan says (`kept`, with why) and `notes`. A
`carryOut` that throws is reported as failed, with the error's message as the
reason. A run whose report does not arrive is offered again by Terms after its
lease, so `carryOut` must be safe to run twice.

The pass throws when the catalogue or the runs cannot be exchanged, which the
scheduler logs and tries again on its next tick. `publishErasureCatalogue`,
`takePrivacyRuns` and `reportPrivacyRun` are the same steps one at a time.

## The outbox

Every push and every acceptance is written to the outbox first and removed when
the service confirms it. Flush it from the product's own scheduler, about once a
minute:

```ts
await terms.flushOutbox();
```

Entries keep their order where it matters: a push waits for every older push of
its account, and an acceptance waits for every older push and acceptance of its
account. A push never waits for an acceptance, and once a push arrives, the
account's acceptances waiting to be retried are due at once.

What failed because of when it was sent (no answer, a server error, a key that
is wrong or lacks the surface, an account not pushed yet, a capacity not yet
declared) is tried again after 30 seconds, then twice as long each time, up to
an hour. What the service refused for what it says (an identifier it cannot
read, a `requestRef` already used for a different acceptance) would be refused
the same way forever, so it is **parked**: kept with the refusal in
`last_error`, never sent again and never holding anything up, until a person
looks at it. `onError` is told of every entry parked. To send a parked entry
again after fixing what was wrong:

```sql
UPDATE terms_outbox SET next_attempt_at = now() WHERE id = '<request reference>';
```

### In Postgres

`postgresOutboxStore(query)` keeps the outbox in a table of the product's own
database, through the driver the product already has:

```ts
postgresOutboxStore((text, values) => prisma.$queryRawUnsafe(text, ...values)); // Prisma
postgresOutboxStore(async (text, values) => (await pool.query(text, values)).rows); // pg
```

Two processes flushing at once never take the same entry. With Prisma, add this
model and let `prisma migrate` create the table:

```prisma
model TermsOutbox {
  seq           BigInt    @id @default(autoincrement())
  id            String    @unique
  kind          String
  surface       String
  accountId     String    @map("account_id")
  body          String
  createdAt     DateTime  @map("created_at") @db.Timestamptz(3)
  attempts      Int       @default(0)
  nextAttemptAt DateTime? @map("next_attempt_at") @db.Timestamptz(3)
  lastError     String?   @map("last_error")

  @@index([surface, accountId, seq], map: "terms_outbox_account")
  @@index([nextAttemptAt], map: "terms_outbox_due")
  @@map("terms_outbox")
}
```

Without Prisma, run `OUTBOX_TABLE_SQL` in a migration. It is the same table, so
a product that later moves to Prisma sees no drift.

`memoryOutboxStore()` keeps the outbox in the process. It is lost on restart, so
it is for tests, or for a product that accepts losing an acceptance made while
the service was down. Anything else implements `OutboxStore`.

## The snapshot

The rules decide from a snapshot of the legal archive: documents, versions,
what each surface covers and when each version binds where. It is signed by the
service, and this client binds only a snapshot whose signature holds for a key
pinned in `@ghub/terms-rules`; a new key reaches a product with a release of that
package, never with the snapshot it signs. A snapshot that fails is refused and
the one held stays. The cache never goes back to a lower serial.

It is checked for a newer one every 15 minutes, with its ETag, in the
background of whatever call notices it is due, and at once when the service
answers a standing from a newer snapshot than the one held. Nothing waits for
it.

Three sources, the newest serial wins: the snapshot bundled with the installed
`@ghub/terms-rules` (the floor), the one kept in a `snapshotStore` if you give
one, and the one the service serves. A `snapshotStore` is two functions,
`load()` and `save(snapshot)`, keeping `{ text, signature, etag }` anywhere (a
file, a row); what it loads is verified again, so it need not be trusted.

## Errors

`TermsApiError` carries the HTTP `status` (null where no answer came) and the
service's stable `code` (`subject.unknown`, `consent.unreadable`, ...).
`TermsUnavailableError` is thrown by the bound rules while no snapshot is held;
await `ready()` at start and use `stateOf`, which never throws for that.

Part of [GHub-Packages](https://github.com/Gelhaus-Solutions/GHub-Packages), the
packages the Gelhaus Solutions products share.

## Licence

Elastic License 2.0. Source-available: you may read, self-host and modify it for your own
organisation. You may not offer it as a service, and you may not circumvent the
licence-key functionality. See the `LICENSE` file in this package.

Copyright (c) 2026 Gelhaus Solutions (Enno Gelhaus). Built and maintained by
[Gelhaus Solutions](https://ennogelhaus.de).
