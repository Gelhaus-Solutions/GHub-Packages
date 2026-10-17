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

## Aurora

`aurora.css` is a surface of the modern language: modern's dark column forced (there is
no light theme), type one step denser, and frosted glass with slow coloured light behind
it. It is opt-in twice, and an app that does neither step compiles exactly what it did
before:

```css
@import "@ghub/tokens/modern.css";
@import "@ghub/tokens/aurora.css";
```

```html
<html data-aurora data-theme="dark"></html>
```

The import declares the `aurora:` variant, the `a-` utilities (`a-glass`, `bg-a-field`,
`rounded-a-glass`, `shadow-a-primary`, ...) and their values; the attribute switches them
on. The components in `@ghub/ui/modern` carry `aurora:` classes beside their own, so they
take the glass where both steps are made and nowhere else. With
`prefers-reduced-transparency` every pane becomes a solid plate, and with
`prefers-reduced-motion` nothing rises or drifts.

## Product marks and avatar tints

`modern.css` also carries two brand families beside the UI tokens, never in place of them:
the product marks (`--gm-mark-tide`, `-harbour`, `-iris`, `-rose`, `-ember`, `-amber`,
`-moss`, with `-paper` and `-ink` for details inside a hue) and the seven avatar tints with
their ink (`--gm-avatar-1` to `-7`, `--gm-avatar-ink`), as `m-mark-*` and `m-avatar-*`
utilities. Both are the same in light and dark: a mark is one file on any page, and a person
keeps their colour. `Avatar` in `@ghub/ui/modern` picks the tint from a stable id.

## Licence

Elastic License 2.0. Source-available: you may read, self-host and modify it for your own
organisation. You may not offer it as a service, and you may not circumvent the
licence-key functionality. See the `LICENSE` file in this package.

Copyright (c) 2026 Gelhaus Solutions (Enno Gelhaus). Built and maintained by
[Gelhaus Solutions](https://ennogelhaus.de).
