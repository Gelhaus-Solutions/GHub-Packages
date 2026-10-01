import type { ReactNode } from "react";
import { cn } from "./cn.js";

/**
 * Paging controls for a server-paged list.
 *
 * Deliberately not infinite scroll. A control plane list is something people
 * navigate deliberately, often with a colleague reading over their shoulder or
 * a ticket open beside it, and "page 3 of 47" is a position you can say out
 * loud and come back to. Infinite scroll has no such position and no end.
 *
 * The range and the total are both shown because they answer different
 * questions. The range says where you are; the total says how much there is,
 * which is most of what a filter is for. "Showing 1 to 50 of 1,284" and
 * "Showing 1 to 12 of 12" look the same at a glance until you read the number,
 * and that number is often the whole answer.
 *
 * Rendered as links rather than buttons when `hrefFor` is given, so the page is
 * in the URL: a filtered, sorted, paged view is then something somebody can
 * paste into a ticket, which is most of what a support console is for.
 */
export interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  /** Builds the URL for a given offset. Omit for a button-driven list. */
  hrefFor?: (offset: number) => string;
  onOffsetChange?: (offset: number) => void;
  /**
   * Props rather than literals: every user-visible string in this product goes
   * through next-intl, and a design-system component has no locale of its own.
   * The caller has one and this does not.
   *
   * That was already written here and only half done. `previousLabel` and
   * `nextLabel` were props with English DEFAULTS, which is the same thing as
   * holding the copy: the one real call site passed neither, so both consoles
   * rendered this package's English. The summary line was worse and is the
   * reason these are now required rather than optional.
   *
   * ## Why these are functions
   *
   * The summary used to be assembled in JSX from five fragments: "Showing",
   * the range, "to", "of", the total, the noun. Five fragments concatenated in
   * source order is not a string with a missing key, it is a sentence with no
   * grammar, and no amount of keying the pieces would make it translatable:
   * word order is the first thing a language changes.
   *
   * So the caller gets ONE message with arguments. It takes a function rather
   * than a string because the arithmetic belongs here, in one place, and not
   * copied into every call site: this component knows what `from`, `to`, `page`
   * and `pages` are, and the caller knows how to say them.
   *
   * The return is a node rather than a string so a caller can emphasise the
   * numbers inside its own sentence, which is what `t.rich` is for and what the
   * numeric spans here used to do from the wrong side of the boundary.
   */
  summaryLabel: (counts: { from: number; to: number; total: number }) => ReactNode;
  pageLabel: (counts: { page: number; pages: number }) => ReactNode;
  /** What an empty list says. Rendered instead of the summary. */
  emptyLabel: ReactNode;
  previousLabel: string;
  nextLabel: string;
  className?: string;
}

export function Pagination({
  total,
  limit,
  offset,
  hrefFor,
  onOffsetChange,
  summaryLabel,
  pageLabel,
  emptyLabel,
  previousLabel,
  nextLabel,
  className,
}: PaginationProps) {
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));

  const previous = Math.max(0, offset - limit);
  const next = offset + limit;
  const canGoBack = offset > 0;
  const canGoForward = next < total;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 px-4 py-2.5",
        "border-t border-(--gc-border-hairline) bg-inset rounded-b-(--radius-panel)",
        className,
      )}
    >
      <p className="text-2xs text-fg-tertiary">
        {total === 0 ? emptyLabel : summaryLabel({ from, to, total })}
      </p>

      <div className="flex items-center gap-2">
        <span className="numeric text-2xs text-fg-tertiary">{pageLabel({ page, pages })}</span>
        <Step
          label={previousLabel}
          disabled={!canGoBack}
          href={hrefFor === undefined ? undefined : hrefFor(previous)}
          onClick={onOffsetChange === undefined ? undefined : () => onOffsetChange(previous)}
        />
        <Step
          label={nextLabel}
          disabled={!canGoForward}
          href={hrefFor === undefined ? undefined : hrefFor(next)}
          onClick={onOffsetChange === undefined ? undefined : () => onOffsetChange(next)}
        />
      </div>
    </div>
  );
}

const stepClasses = [
  "inline-flex h-6 items-center rounded-(--radius-sm) border px-2 text-2xs",
  "border-(--gc-border-subtle) bg-raised text-fg-secondary",
  "transition-colors duration-(--duration-instant)",
  "hover:bg-overlay hover:text-fg",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--gc-ring)",
];

function Step({
  label,
  disabled,
  href,
  onClick,
}: {
  label: string;
  disabled: boolean;
  href?: string;
  onClick?: () => void;
}): ReactNode {
  // A disabled step is a span rather than a dead link. An anchor with no href
  // is not focusable and an anchor that goes nowhere is worse: it looks
  // available and answers by doing nothing.
  if (disabled || (href === undefined && onClick === undefined)) {
    return (
      <span aria-disabled="true" className={cn(stepClasses, "opacity-40 pointer-events-none")}>
        {label}
      </span>
    );
  }

  if (href !== undefined) {
    return (
      <a href={href} className={cn(stepClasses)}>
        {label}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} className={cn(stepClasses)}>
      {label}
    </button>
  );
}

// `format` is gone with the copy. It read `value.toLocaleString("en-GB")`, which
// is a locale decided in a package that has none: a thousands separator is a
// comma here, a full stop in several places this product ships to, and a space
// in others. The numbers now leave raw and the caller's own formatter says them.
