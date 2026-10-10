/**
 * Modern: the consumer-facing design language, for GPlatform SSO and Billing.
 *
 * **Behind its own subpath, `@ghub/ui/modern`, and that is a mechanism
 * decision rather than tidiness.** `dist/index.js` is HARDLINKED into three
 * GPlatform trees, so the moment it is rebuilt those apps read the new bytes.
 * A new `export ... from "./modern/page-head.js"` in the root index would
 * therefore reach all three instantly while the FILE it points at reached only
 * whichever of them last ran an install, and the two that did not would fail at
 * build on a path inside `node_modules/.pnpm/@ghub+ui@file+..`, which
 * reads as a corrupt install rather than a stale copy.
 *
 * Keeping modern out of the root index means `dist/index.js` does not change at
 * all, so console's three consumers are untouched by anything in here until
 * somebody imports it deliberately and runs `pnpm install --force` first.
 *
 * ADOPTING THIS TAKES TWO STEPS BEFORE THE FIRST IMPORT, IN THIS ORDER, AND
 * SKIPPING THE SECOND IS SILENT.
 *
 *   1. `pnpm install --force` in the consuming repo. `modern.css` is a NEW file
 *      in a package GPlatform links by `file:`, and pnpm hardlinks a snapshot,
 *      so a new file reaches only whoever installs after it was built. Measured
 *      2026-09-19: all three GPlatform trees hold `theme.css` and `base.css`
 *      and no `modern.css` at all.
 *   2. `@import "@ghub/tokens/modern.css";` in that app's
 *      `globals.css`, beside the `theme.css` import rather than instead of it.
 *
 * Without the second, these components render UNSTYLED and nothing goes red.
 * The consumers' `@source` glob is recursive and already reaches
 * `dist/modern/*.js`, so Tailwind sees `bg-m-plate` and finds no
 * `--color-m-plate` to resolve it against, and an unknown utility is not
 * emitted rather than being an error. Typecheck passes, lint passes, the build
 * succeeds, and the screen is colourless.
 *
 * **A missing background does not look like a fault, it looks like a choice.**
 * That is why step 2 is the dangerous one: somebody will assume modern is meant
 * to look flat, and the person who made neither the import nor the decision
 * will end up defending it.
 *
 * **Aurora** is a surface of this language, not a third one: modern's dark
 * column forced, denser type, and frosted glass. The components here carry its
 * classes under an `aurora:` variant that exists only in an app importing
 * `@ghub/tokens/aurora.css`, and match only under `data-aurora` on the root.
 * Every other app compiles exactly what it did before. `GlassPanel`, `Badge`
 * and the `AURORA_*` recipes are the pieces drawn for it.
 *
 * Console stays on the root export and on `theme.css`. Nothing here is a
 * replacement for anything there: they are two languages, and the seven control
 * room instruments modern leaves out stay in console because that is where they
 * are read.
 */

export { PageHead, type PageHeadProps } from "./page-head.js";
export { RecordRow, type RecordRowProps } from "./record-row.js";
export { Money, type MoneyProps } from "./money.js";
export { SummaryPair, type SummaryPairProps } from "./summary-pair.js";
export {
  FormField,
  type FormFieldProps,
  type FormFieldRule,
  type FormFieldControlProps,
} from "./form-field.js";
export { Banner, type BannerProps, type BannerTone } from "./banner.js";
export { Disclosure, type DisclosureProps } from "./disclosure.js";
export { Card, type CardProps } from "./card.js";
export { Section, type SectionProps } from "./section.js";
export { Status, type StatusLevel, type StatusProps } from "./status.js";
export { Refusal, type RefusalProps, type RefusalSeverity } from "./refusal.js";
export { Tabs, type Tab, type TabsProps, type TabsVariant } from "./tabs.js";
export { Table, type Column, type TableProps, type TableSelection } from "./table.js";
export { Input, type InputHeight, type InputProps } from "./input.js";
export { Consequence, type ConsequenceLine, type ConsequenceProps } from "./consequence.js";
export { Pagination, type PaginationProps } from "./pagination.js";
export { Provenance, type ProvenanceProps } from "./provenance.js";

// Drawn for the GPlatform Terms staff console and general enough to share.
export { Button, type ButtonProps } from "./button.js";
export {
  buttonClasses,
  type ButtonClassOptions,
  type ButtonSize,
  type ButtonVariant,
} from "./button-classes.js";
export { TypedConfirmation, type TypedConfirmationProps } from "./typed-confirmation.js";
export { typedConfirmationMatches } from "./typed-confirmation-match.js";
export { Hash, type HashProps, type HashVerdict } from "./hash.js";
export {
  ZonedDateTime,
  ZonedDateTimeInput,
  type ZonedChange,
  type ZonedChangeSource,
  type ZonedDateTimeInputProps,
  type ZonedDateTimeProps,
} from "./zoned-date-time.js";
export {
  DEFAULT_ZONE,
  hrefWithAt,
  type ClockGap,
  type ZonedOutcome,
  type ZonedReading,
} from "./zoned-time.js";
export { AsOf, writeAt, type AsOfMode, type AsOfProps } from "./as-of.js";
export {
  ReorderList,
  type ReorderListItem,
  type ReorderListProps,
  type ReorderMove,
} from "./reorder-list.js";
export {
  MailPreview,
  type MailPreviewHeaderLabels,
  type MailPreviewProps,
  type MailPreviewState,
} from "./mail-preview.js";
export {
  BilingualReader,
  type BilingualReaderLayout,
  type BilingualReaderProps,
  type BilingualText,
} from "./bilingual-reader.js";
export {
  Standing,
  type StandingObjection,
  type StandingProps,
  type StandingValue,
} from "./standing.js";
export {
  DiffViewer,
  type DiffBlock,
  type DiffLine,
  type DiffPart,
  type DiffViewerProps,
} from "./diff-viewer.js";
export { FilterButton, type FilterButtonProps, type FilterOption } from "./filter-button.js";
export { ListFilters, type ListFiltersProps } from "./list-filters.js";
export {
  VERSION_STATE_WORDS,
  VersionState,
  type VersionStateProps,
  type VersionStateValue,
} from "./version-state.js";
export { ChangeLine, type ChangeLineProps } from "./change-line.js";
export {
  GoTo,
  GoToButton,
  useSlashToOpen,
  type GoToButtonProps,
  type GoToGroup,
  type GoToOption,
  type GoToProps,
} from "./go-to.js";
export { Agenda, type AgendaItem, type AgendaProps } from "./agenda.js";
export { DayStepper, type DayStepperProps } from "./day-stepper.js";
export { GlassPanel, type GlassPanelProps, type GlassTone } from "./glass-panel.js";
export { ClockLine, type Clock, type ClockLineProps } from "./clock-line.js";
export {
  CaseTimeline,
  type CaseTimelineProps,
  type TimelineEntry,
  type TimelineKind,
  type TimelineOrder,
  type TimelineShow,
} from "./case-timeline.js";
export {
  LifecycleStepper,
  type LifecycleStep,
  type LifecycleStepperProps,
  type StepState,
} from "./lifecycle-stepper.js";
export {
  NextStep,
  type NextStepClock,
  type NextStepProps,
  type NextStepTone,
} from "./next-step.js";
export {
  LINK_PAGE_PRIMARY,
  LINK_PAGE_SECONDARY,
  LinkPage,
  type LinkPageLanguage,
  type LinkPageOutcome,
  type LinkPageProps,
} from "./link-page.js";
export { Badge, type BadgeProps, type BadgeTone } from "./badge.js";
export { Checkbox, type CheckboxProps } from "./checkbox.js";
export { BULK_PRIMARY, BULK_SECONDARY, BulkBar, type BulkBarProps } from "./bulk-bar.js";
export { SavedViews, type SavedView, type SavedViewsProps } from "./saved-views.js";
export { Pager, pagerPages, type PagerProps } from "./pager.js";
export {
  StatTile,
  StatTiles,
  type StatLevel,
  type StatTileProps,
  type StatTilesProps,
} from "./stat-tile.js";
export {
  DistributionBar,
  type DistributionBarProps,
  type DistributionSegment,
} from "./distribution-bar.js";
export {
  AURORA_FIELD,
  AURORA_FLAT,
  AURORA_GLASS,
  AURORA_IN_SECTION,
  AURORA_LIST_IN_SECTION,
  AURORA_MENU,
  AURORA_TRACK,
  AURORA_TRACK_ITEM,
  AURORA_TRACK_OFF,
  AURORA_TRACK_ON,
} from "./aurora.js";
export {
  DraftKeeperBanner,
  useDraftKeeper,
  type DraftKeeper,
  type DraftKeeperBannerProps,
  type DraftKeeperOptions,
  type RestoredDraft,
} from "./draft-keeper.js";
