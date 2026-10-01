"use client";

import { ChevronsUpDown } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { cn } from "./cn.js";
import { Menu, type MenuItem } from "./popover.js";

/**
 * The band that names what every screen below it is about.
 *
 * A console that serves more than one organisation, site or deployment has a
 * question every screen silently depends on: which one am I looking at. Today
 * both consoles answer it with a set of links styled as navigation, which is
 * the worst of both, because it reads as "go here" and behaves as "change what
 * everything means".
 *
 * **The scope is in the URL, and the options are anchors carrying it.** Not
 * state, not a stored preference. A view pasted into a ticket has to mean the
 * same thing to whoever opens it, and a scope kept in local storage is the
 * first thing that makes two people's screenshots of one URL disagree.
 *
 * **Never a default when the reader is staff.** With no scope chosen the band
 * is the chooser rather than quietly picking the first organisation: a member
 * of staff who did not notice which customer they were looking at is the whole
 * failure this is meant to prevent.
 */
export interface ScopeOption {
  key: string;
  label: ReactNode;
  /** The id, slug or reference. Mono, because it is what gets pasted. */
  slug?: ReactNode;
  /**
   * Where this option goes, as data rather than as a function.
   *
   * `hrefFor` and `renderOption` are functions, and a server component cannot
   * pass a function to a client component, which this is. Supplying `href` on
   * each option is therefore the only way a server-rendered screen can make
   * this band a switcher at all. The two function props remain for a client
   * caller that wants its router's link.
   */
  href?: string;
}

export interface ScopeBandProps {
  /** The chosen scope's name, or nothing where none is chosen yet. */
  label?: ReactNode;
  /** The chosen scope's id. Sits in secondary: it is a value, not an aside. */
  slug?: ReactNode;
  /** One line qualifying the scope. "You are not a member" is the sharp case. */
  note?: ReactNode;
  options?: readonly ScopeOption[];
  /** The anchor each option points at. Carries the scope in the query. */
  hrefFor?: (option: ScopeOption) => string;
  /** Renders one option's link, so this package stays free of a router. */
  renderOption?: (
    option: ScopeOption,
    props: { className: string; children: ReactNode },
  ) => ReactNode;
  /** What the switcher's button says. Defaults to naming the act, not the thing. */
  actionLabel?: string;
  /**
   * What the band says before a scope is chosen. A prop rather than a literal:
   * every user-visible string goes through next-intl and this package has no
   * locale of its own.
   */
  emptyLabel?: ReactNode;
  /** Anything belonging to the scope rather than to the screen. */
  trailing?: ReactNode;
  className?: string;
}

export function ScopeBand({
  label,
  slug,
  note,
  options,
  hrefFor,
  renderOption,
  actionLabel = "Change scope",
  emptyLabel = "Nothing chosen yet",
  trailing,
  className,
}: ScopeBandProps) {
  const button = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);

  // One option is not a switcher. Offering a menu that can only make the choice
  // already made is a control that does nothing, and a reader learns to ignore
  // it before the day there are two.
  // A switcher needs somewhere for its options to go, and that can now arrive
  // either way: as a function from a client caller, or as an `href` on each
  // option from a server one.
  const linkable = (option: ScopeOption) =>
    renderOption !== undefined || hrefFor?.(option) !== undefined || option.href !== undefined;
  const switchable =
    options !== undefined && options.length > 1 && options.every((option) => linkable(option));

  const items: MenuItem[] =
    options === undefined
      ? []
      : options.map((option) => ({
          key: option.key,
          label: (
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{option.label}</span>
              {option.slug === undefined ? null : (
                <span className="numeric truncate text-3xs text-fg-tertiary">{option.slug}</span>
              )}
            </span>
          ),
          ...(renderOption === undefined
            ? { href: hrefFor?.(option) ?? option.href }
            : {
                render: (props: { className: string; children: ReactNode }) =>
                  renderOption(option, props),
              }),
        }));

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-(--gc-border-hairline) bg-inset px-8 py-2.5",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0">
          {label === undefined ? (
            <span className="text-sm text-fg-tertiary">{emptyLabel}</span>
          ) : (
            <span className="truncate text-sm font-medium text-fg">{label}</span>
          )}
          {slug === undefined ? null : (
            // Secondary rather than tertiary: this is the value somebody copies
            // into a ticket, not an explanation of the value.
            <span className="numeric ml-2 text-2xs text-fg-secondary">{slug}</span>
          )}
          {note === undefined ? null : <p className="mt-0.5 text-2xs text-fg-tertiary">{note}</p>}
        </div>

        {switchable ? (
          <>
            <button
              ref={button}
              type="button"
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={() => setOpen((was) => !was)}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-(--radius-md) border border-(--gc-border-control) bg-raised px-2.5",
                "text-2xs text-fg-secondary transition-colors duration-(--duration-instant)",
                "hover:border-(--gc-border-strong) hover:text-fg",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--gc-ring)",
              )}
            >
              {actionLabel}
              <ChevronsUpDown className="size-3 shrink-0" aria-hidden="true" />
            </button>
            <Menu
              anchor={button}
              open={open}
              onClose={() => setOpen(false)}
              label={actionLabel}
              items={items}
              matchAnchorWidth
              className="max-h-[60vh] overflow-y-auto"
            />
          </>
        ) : null}
      </div>

      {trailing === undefined ? null : <div className="shrink-0">{trailing}</div>}
    </div>
  );
}
