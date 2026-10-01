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
export { Tabs, type Tab, type TabsProps } from "./tabs.js";
export { Table, type Column, type TableProps } from "./table.js";
export { Input, type InputHeight, type InputProps } from "./input.js";
export { Consequence, type ConsequenceLine, type ConsequenceProps } from "./consequence.js";
export { Pagination, type PaginationProps } from "./pagination.js";
export { Provenance, type ProvenanceProps } from "./provenance.js";
