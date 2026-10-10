# GHub-Packages

The packages the Gelhaus Solutions products share. A package lives here when it is
published and more than one product depends on it. A package only one product uses
stays in that product's repository.

| Package                                           | What it is                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [`@ghub/ui`](packages/ui)                         | The design system: hand-rolled, accessible React components                           |
| [`@ghub/tokens`](packages/tokens)                 | The design tokens behind it, as a Tailwind v4 theme                                   |
| [`@ghub/totp`](packages/totp)                     | TOTP (RFC 6238) for sign-in, with no runtime dependencies                             |
| [`@ghub/terms-rules`](packages/terms-rules)       | The consent rules: where an account stands with its terms, from a signed snapshot     |
| [`@ghub/terms-client`](packages/terms-client)     | A product's client for GPlatform Terms: standings, acceptances, an outbox             |
| [`@ghub/gmint-protocol`](packages/gmint-protocol) | GMint's wire protocol: signed, channel-bound requests, HPKE-sealed responses          |
| [`@ghub/gmint-sdk`](packages/gmint-sdk)           | The GMint client: short-lived, narrowly scoped GitHub App tokens, verified end to end |

## Working on it

Node 22 and pnpm 11.

```sh
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```

`@ghub/ui`'s contrast tests read the token files from `packages/tokens` directly, so a
palette change that breaks a WCAG 2.2 AA ratio fails here, before it reaches any product.

`@ghub/terms-client`'s outbox tests run against Postgres too when
`TERMS_CLIENT_TEST_DATABASE_URL` names a database to try them in (each run makes a schema of
its own and drops it); without it they are skipped.

A change to a published package carries a changeset (`pnpm changeset`).

## Licence

Elastic License 2.0. Source-available: you may read, self-host and modify it for your own
organisation. You may not offer it as a service, and you may not circumvent the
licence-key functionality. See [LICENSE](LICENSE).

Copyright (c) 2026 Gelhaus Solutions (Enno Gelhaus). Built and maintained by
[Gelhaus Solutions](https://ennogelhaus.de).
