# @ghub/ui

## 0.4.0

### Minor Changes

- 455ca35: Modern's label type step is `text-m-label` (`--text-m-label`), no longer `text-m-control`. The old name collided with the control edge colour `--color-m-control`, and Tailwind 4 compiles a `text-*` utility whose name is both a colour and a size to the colour alone, so every label, control text and column head set in it rendered in the 36% alpha edge ink at the inherited size and failed AA. `border-m-control`, `rounded-m-control` and the colour itself are unchanged.

  Upgrade `@ghub/tokens` and `@ghub/ui` together, and replace any `text-m-control` of your own with `text-m-label`.

- 15694cd: Modern gains nine components drawn for the GPlatform Terms staff console: `Button` (with `buttonClasses` for a link styled as a button), `ZonedDateTime` and `ZonedDateTimeInput`, `AsOf`, `TypedConfirmation`, `ReorderList`, `MailPreview`, `BilingualReader`, `Hash` and `Standing`. `cn` now keeps a type step (`text-m-meta`, `text-2xs` and the rest) beside an ink class instead of dropping it as a second colour.
