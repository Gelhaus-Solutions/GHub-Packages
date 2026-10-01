# GHub-Packages

The packages the Gelhaus Solutions products share. A package lives here when it is
published and more than one product depends on it. A package only one product uses
stays in that product's repository.

| Package                           | What it is                                                  |
| --------------------------------- | ----------------------------------------------------------- |
| [`@ghub/ui`](packages/ui)         | The design system: hand-rolled, accessible React components |
| [`@ghub/tokens`](packages/tokens) | The design tokens behind it, as a Tailwind v4 theme         |

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

A change to a published package carries a changeset (`pnpm changeset`).

## Licence

Elastic License 2.0. Source-available: you may read, self-host and modify it for your own
organisation. You may not offer it as a service, and you may not circumvent the
licence-key functionality. See [LICENSE](LICENSE).

Copyright (c) 2026 Gelhaus Solutions (Enno Gelhaus). Built and maintained by
[Gelhaus Solutions](https://ennogelhaus.de).
