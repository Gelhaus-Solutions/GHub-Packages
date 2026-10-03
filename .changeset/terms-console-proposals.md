---
"@ghub/tokens": minor
"@ghub/ui": minor
---

Modern gains the five component proposals drawn for the GPlatform Terms staff console: `DiffViewer` (a unified, paragraph-level comparison with word marks and folds), `FilterButton` and `ListFilters` (one filter row for every list, with the count line as its only live region), `VersionState` and `ChangeLine` (a version's state decided from the version, and the sentence and diffstat saying what it changed), `GoTo` with `GoToButton` and `useSlashToOpen` (open anything by name from every screen, "/" from anywhere outside a field), and `Agenda`, `DayStepper`, `useDraftKeeper` with `DraftKeeperBanner` (a dated list, a day stepper that commits on Enter or blur, and unsaved draft text kept in session storage and offered back). `VERSION_STATE_WORDS` exports the default English words for the eight version states. Modern's `Section` takes two optional slots in its head row, `note` (quiet words after the count) and `aside` (a verb or a dated line, pushed right); a section using neither renders exactly as before.

`@ghub/tokens` adds five diff films to `modern.css` in both themes, mapped as `m-diff-add`, `m-diff-add-word`, `m-diff-del`, `m-diff-del-word` and `m-diff-band`. `DiffViewer` draws with them, so upgrade `@ghub/tokens` and `@ghub/ui` together: on an older `modern.css` the viewer renders without its films and an added paragraph looks unchanged, with nothing going red.
