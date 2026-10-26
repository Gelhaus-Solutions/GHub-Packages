# @ghub/ui

## 0.16.0

### Minor Changes

- `PlaceMark` in `@ghub/ui/modern` (GPlatform Identity, G62): a company's or a group's mark, its uploaded logo on the plate in a rounded square, or until it has one the kind's glyph on the kind's colour, a building on the accent for a company and a network on the info colour for a group. Never a letter tile, so two companies with the same initials no longer look alike and nothing reads as a logo nobody chose. A logo that fails to load falls back to the glyph. `WorkspacePicker` draws it for its company and group rows, and a place's `picture` is now that place's logo as well as the account's picture. `ImageCrop` takes `shape="square"`, which crops a logo under that rounded square rather than under a circle.

## 0.15.1

### Patch Changes

- `PickerDialog` starts the highlight on the first row that can be chosen after every load, so Enter after a search opens what was found. It used to start on the first row, which in a tree (GPlatform Integrate's project picker) is a group or a company shown only for where its projects sit, and Enter there did nothing.

## 0.15.0

### Minor Changes

- `PickerDialog` (modern) takes `views`, an `action` and a `note`, drawn for GPlatform Integrate's project picker (canvas A2). Views are a second axis beside the facets, for a list somebody reads from a different end ("Recent", "Starred", "All"): a row of tabs under the search, one at a time, a radio group to a keyboard (one tab stop, the arrows move), and the chosen key reaches `load` as `view`, back on page 1. A popup given no views asks exactly what it asked before. `action` is one control at the end of the search row, such as a button that starts a new one; `note` is a line at the start of the foot saying what the list covers.

## 0.14.0

### Minor Changes

- Four parts for acts and records in `@ghub/ui/modern`, drawn for GPlatform Identity. `ReasonField` is a reason somebody else reads, with a live count that says how many characters are missing until the minimum (40 by default) and that it is enough from there; `reasonIsEnough` is the same rule for the act's disabled state. `ShownOnce` shows a secret for the only time it will be shown, with Copy that says it copied and a warn line. `ProveItIsYou` draws proving it is you inside the act that asked: passkey first, the app's password field, or a session that never had one, with a failure laid over the way tried, taking focus when it appears; the ceremony stays the app's. `EventLog` is a record nobody can change: rows with the time to the second and the day, a level dot, what happened, who, the reason in quotes and a kind chip that carries the level, and the line that says none of it can be changed or removed.

## 0.13.0

### Minor Changes

- The rail and the top of it in Aurora, drawn for GPlatform Identity. `WorkspacePicker` (modern) is one control for every place a reader can be: their account, each company, each group and staff, grouped by kind with a mark that says the kind (a round picture, a square monogram in the accent or info colour, an amber STAFF chip), a search field past eight places, links drawn by the app through `render`, arrows, Home, End and Escape. `RecordPager` (modern) says "3 of 9" and links the records either side, keeping a disabled stand-in where there is none. `NavRail`, `NavGroup` and `NavItem` gain Aurora classes: the rail as its own pane of glass, items 32 high on a 10px corner with the current one raised, and counts as badges on the level's wash; console markup is unchanged outside Aurora. `ChoiceCards` gains Aurora classes (a 14px card, the chosen one lit by an accent or crit gradient, a 5px ring) and `consequences`, a list unfolded under the chosen card only.

## 0.12.0

### Minor Changes

- a731a47: `FormDialog` and `LeaveGuard` in `@ghub/ui/modern` (D158, drawn for GPlatform Legal). `FormDialog` is a popup that holds a form, so what a form needs is made without leaving it and the form behind keeps what was typed: its fields scroll between a head and a pinned foot, focus starts on the first field, and Escape and the scrim close it unless `dismissible` is false while it holds typed input; as an `alertdialog` it asks a question. `LeaveGuard` asks before a dirty form is left by a link (the rail, a breadcrumb, a Cancel link): Stay and finish, leave and keep it for later, or discard it and leave. It pairs with `useDraftKeeper`, which keeps the text and offers it back. Every popup, `PickerDialog` included, now carries the page's own auroras as frosted glass over a 74 per cent scrim (`AURORA_POPUP`, `AURORA_SCRIM`), never a flat grey card, and they share one modal contract.

## 0.11.0

### Minor Changes

- ddb108d: `Combobox` searches on the server when given `load`: the options are what it answers for the typed text (150 ms after typing stops, a load the text moved past aborted), `options` then holds only the committed one, and a committed server option keeps its label. `browse` adds a last row ("Search and filter all 38") that hands the typed text to a picker; Enter on it does the same. Without either, nothing changes.
- b3f07de: `PickerDialog` in `@ghub/ui/modern`: the popup behind a picker whose list piles up (D157, drawn for GPlatform Legal). The caller's `load` answers one page for the search, the facets and the page, so the server searches, filters and pages; the search applies on Enter and after 300 ms, and a load the query moved past is aborted. Choosing one, the primary names whom and Enter on the highlighted row confirms; choosing several, rows tick, the foot holds the chosen as chips from any page, and "Chosen only" lists them. Rows are columns the caller describes, scrolling sideways below `minWidth`; a row that cannot be chosen says why. The modal contract is Go to's: portalled, Tab trapped, Escape and the scrim close, focus returns.

## 0.10.1

### Patch Changes

- `Combobox` portals its list to the body and positions it `fixed` under the field, as `Popover` does, flipping above it where the viewport has no room below and following a scroll in any ancestor. It used to hang absolutely inside the field, inside the field's stacking context: on Aurora every section is one, so the section after the field's own painted over the open list, its labels and controls lying across the options, and an ancestor's `overflow` could clip it. A press inside the portalled list still counts as inside the combobox.

## 0.10.0

### Minor Changes

- 3293221: The product marks and the avatar tints from the GPlatform Identity bundle, upstream. `@ghub/tokens` adds `--gm-mark-tide` to `--gm-mark-moss` with `--gm-mark-paper` and `--gm-mark-ink`, and the seven avatar tints `--gm-avatar-1` to `-7` with `--gm-avatar-ink`, theme-independent, as `m-mark-*` and `m-avatar-*` utilities. `@ghub/ui/modern` adds `Avatar` (the picture, or the initial on a tint picked from a stable id by `avatarTint`, the hash identity-chrome and Identity share; an optional badge such as a pencil), `ProductMark` (a product's mark or its initial) and `ProductChip` (the mark and the name in a pill). The tints are measured: the initial clears 9.5:1 on every one, and every mark hue clears 3:1 on white and on the dark ground.

## 0.9.0

### Minor Changes

- 60566dc: `Dialog` takes `sheet`: below 600 wide it becomes a full height sheet, the body taking the width and scrolling on its own and the footer pinned at the bottom (GPlatform Identity sheet 34, C4's crop). Without it nothing changes.

## 0.8.1

### Patch Changes

- a72e99d: `Dialog` no longer moves focus back to its panel when the caller re-renders. A caller passing a new `onClose` on every render (`() => setOpen(false)`) re-ran its open effect on each keystroke in a field inside it, so focus left the field after every character; Escape now reads the latest `onClose` instead.

## 0.8.0

### Minor Changes

- 5e8f119: Modern gains the two controls drawn for GPlatform Identity's picture dialog (sheet 34, C4). `Slider` is a styled native range input named by its visible label, with the value in words as `aria-valuetext` and printed at its end. `ImageCrop` moves and scales a picture under a fixed circle: drag, or with the crop focused the arrows move it a pixel, Shift and an arrow ten, plus and minus zoom by a tenth, and Home resets, each announced in the caller's words. The zoom is the caller's, so a `Slider` can drive it, and the crop reports the square inside the circle in the picture's own pixels; `drawCrop` draws that square onto a canvas at a size. The arithmetic is exported as `cropArea`, `clampCropPosition`, `zoomCropPosition` and `cropBaseScale`.

## 0.7.0

### Minor Changes

- b438d95: Modern gains the case and list blocks drawn for GPlatform Legal: `ClockLine` (K6), `CaseTimeline` (K7), `LifecycleStepper` (K8), `NextStep` (K9), `LinkPage` with `LINK_PAGE_PRIMARY` and `LINK_PAGE_SECONDARY` (K10), `StatTile` and `StatTiles` (K11), `DistributionBar` (K13), `SavedViews` (K16), `BulkBar` with `BULK_PRIMARY` and `BULK_SECONDARY` (K17), `Checkbox`, and a link-based `Pager` with `pagerPages`. `Tabs` takes `variant: "segmented"` for an area's lists, and a `count` and a `flag` per tab. `Table` takes `selection` (a checkbox column, select-all for the page, and a bulk bar in the header's place) and `minWidth`.

## 0.6.0

### Minor Changes

- a578f9e: Aurora, an opt-in surface of the modern language: dark only, denser type, frosted glass. `@ghub/tokens` adds `aurora.css`, which declares an `aurora:` variant keyed to `data-aurora` on the root, forces modern's dark values, sets Aurora's type steps, and defines the glass (`a-glass`, `a-glass-rail`, `a-glass-menu`), the `a-` colours, shadows, radii and type steps, paper colours for a printed page, the rise and drift motion with an `a-stagger` utility, and solid plates under `prefers-reduced-transparency`. `modern.css` moves its type and radius steps from `@theme inline` to `@theme`, so they compile to variables a surface can redeclare; the computed values are unchanged.

  Every `@ghub/ui/modern` component, and `SegmentedControl`, `Combobox`, `CodeInput`, `CopyChip`, `Popover`, `Menu`, `Sheet` and `StateBand`, carries `aurora:` classes beside its own: glass sections with their head inside, tables, lists and panels that go flat inside a section, pill buttons with the primary's glow, 12px fields with an accent focus ring, pill statuses, lit banners and refusals, glowing tab rules, glass menus. An app that does not import `aurora.css` has no `aurora` variant and compiles none of them, so it renders exactly as before. New in modern: `GlassPanel` (a pane of glass for facts, forms, asides and cards; modern's plate off Aurora), `Badge` (the one count pill, with a visually hidden word), the `AURORA_*` class recipes, and two optional `PageHead` props, `status` (a chip beside the title) and `meta` (a quiet line under the lede). `Status` takes `large` for that chip.

## 0.5.1

### Patch Changes

- 26c571e: Tabs wrap on a narrow screen instead of running past its edge, and a label never breaks. FilterButton takes `typed`, for a value that can be typed as well as picked (a day in a From or To facet): the filter field is then always drawn, and what `parse` reads from it is offered first after Any.

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
