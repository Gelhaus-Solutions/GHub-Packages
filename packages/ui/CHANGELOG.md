# @ghub/ui

## 0.5.0

### Minor Changes

- e1e454f: Modern gains the five component proposals drawn for the GPlatform Terms staff console: `DiffViewer` (a unified, paragraph-level comparison with word marks and folds), `FilterButton` and `ListFilters` (one filter row for every list, with the count line as its only live region), `VersionState` and `ChangeLine` (a version's state decided from the version, and the sentence and diffstat saying what it changed), `GoTo` with `GoToButton` and `useSlashToOpen` (open anything by name from every screen, "/" from anywhere outside a field), and `Agenda`, `DayStepper`, `useDraftKeeper` with `DraftKeeperBanner` (a dated list, a day stepper that commits on Enter or blur, and unsaved draft text kept in session storage and offered back). `VERSION_STATE_WORDS` exports the default English words for the eight version states. Modern's `Section` takes two optional slots in its head row, `note` (quiet words after the count) and `aside` (a verb or a dated line, pushed right); a section using neither renders exactly as before.

  `@ghub/tokens` adds five diff films to `modern.css` in both themes, mapped as `m-diff-add`, `m-diff-add-word`, `m-diff-del`, `m-diff-del-word` and `m-diff-band`. `DiffViewer` draws with them, so upgrade `@ghub/tokens` and `@ghub/ui` together: on an older `modern.css` the viewer renders without its films and an added paragraph looks unchanged, with nothing going red.

## 0.4.1

### Patch Changes

- The `license` field now reads `SEE LICENSE IN LICENSE`. These packages are Elastic License 2.0 with a non-commercial rider, and the bare `Elastic-2.0` identifier in package metadata said ELv2 alone, which is not what the LICENSE file grants. No code change; read the LICENSE in the package.

## 0.4.0

### Minor Changes

- 455ca35: Modern's label type step is `text-m-label` (`--text-m-label`), no longer `text-m-control`. The old name collided with the control edge colour `--color-m-control`, and Tailwind 4 compiles a `text-*` utility whose name is both a colour and a size to the colour alone, so every label, control text and column head set in it rendered in the 36% alpha edge ink at the inherited size and failed AA. `border-m-control`, `rounded-m-control` and the colour itself are unchanged.

  Upgrade `@ghub/tokens` and `@ghub/ui` together, and replace any `text-m-control` of your own with `text-m-label`.

- 15694cd: Modern gains nine components drawn for the GPlatform Terms staff console: `Button` (with `buttonClasses` for a link styled as a button), `ZonedDateTime` and `ZonedDateTimeInput`, `AsOf`, `TypedConfirmation`, `ReorderList`, `MailPreview`, `BilingualReader`, `Hash` and `Standing`. `cn` now keeps a type step (`text-m-meta`, `text-2xs` and the rest) beside an ink class instead of dropping it as a second colour.
