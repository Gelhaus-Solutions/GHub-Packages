# @ghub/tokens

The design tokens behind `@ghub/ui`: colour, type, spacing, radii, motion and the
light and dark palettes, as Tailwind v4 CSS.

Separate from the component package because tokens outlive components. A surface that wants
the visual language without the components imports this alone.

```css
@import "@ghub/tokens/base.css";
@import "@ghub/tokens/theme.css";
```

Part of [GHub-Packages](https://github.com/Gelhaus-Solutions/GHub-Packages), the packages
the Gelhaus Solutions products share. It is the family's palette rather than a
general-purpose theme, and it changes when the family's design does.

Until 0.2.3 this package was published as `@ghub/gctl-config-tailwind`.

## Licence

Elastic License 2.0. Source-available: you may read, self-host and modify it for your own
organisation. You may not offer it as a service, and you may not circumvent the
licence-key functionality. See the `LICENSE` file in this package.

Copyright (c) 2026 Gelhaus Solutions (Enno Gelhaus). Built and maintained by
[Gelhaus Solutions](https://ennogelhaus.de).
