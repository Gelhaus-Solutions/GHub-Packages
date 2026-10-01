# @ghub/ui

The design system of the Gelhaus Solutions product family. Direction: precision control
room. Dark-first, dense, hairline borders, mono numerals, one accent reserved for live
state and primary action.

Components are hand-rolled. No Radix, no shadcn, no headless component library:
accessibility is implemented rather than inherited, and the bar is WCAG 2.2 AA with a
contrast test that enforces the colour half of it.

Three of the components render an application's own manifest rather than anything this
package knows about: `GeneratedForm` draws a settings schema, `HealthPanel` draws declared
health values, `MeterPanel` draws declared usage. An application adding a setting or a
metric costs no release of anything.

Tokens live in `@ghub/tokens/theme.css`, which you import alongside this.

```ts
import { Badge, HealthPanel, Panel } from "@ghub/ui";
```

## Entry points

| Entry point          | What it holds                                                 |
| -------------------- | ------------------------------------------------------------- |
| `@ghub/ui`           | Console: the control room components                          |
| `@ghub/ui/modern`    | Modern: the consumer-facing language, styled by `modern.css`  |
| `@ghub/ui/charts`    | The two chart components, and the only place charts are drawn |
| `@ghub/ui/behaviour` | What both languages share: the behaviour, with nothing drawn  |

ESM only.

## Moving from `@ghub/gctl-ui`

Until 0.2.6 this package was published as `@ghub/gctl-ui`. 0.3.0 is the same code under
the new name, with one removal: the panel bridge (`@ghub/gctl-ui/panels`) is GControl's
protocol rather than part of a design system, so it stayed with GControl. Nothing in this
package depends on a GControl package any more.

Part of [GHub-Packages](https://github.com/Gelhaus-Solutions/GHub-Packages), the packages
the Gelhaus Solutions products share. It is the family's design system rather than a
general-purpose component library, and it changes when the family's design does.

## Licence

Elastic License 2.0. Source-available: you may read, self-host and modify it for your own
organisation. You may not offer it as a service, and you may not circumvent the
licence-key functionality. See the `LICENSE` file in this package.

Copyright (c) 2026 Gelhaus Solutions (Enno Gelhaus). Built and maintained by
[Gelhaus Solutions](https://ennogelhaus.de).
