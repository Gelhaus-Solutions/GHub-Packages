import type { ReactNode } from "react";
import { cn } from "./cn.js";
import type { Status } from "./status.js";

/**
 * Tabs, in two variants that are one component.
 *
 * `surface` is a band that is the chrome of a whole screen, sitting on the
 * sheet with its own bottom hairline. `inPage` is a strip inside a record or a
 * settings screen, dividing one subject into sections.
 *
 * One component rather than two, because the only differences are where the
 * underline sits and whether there is a trailing slot. Two components would be
 * two places to fix the day the underline moves, and both consoles have
 * hand-written both shapes already: app panels and settings sections here, the
 * cloud chrome and the catalog's per-level tabs there.
 *
 * **Below 700px it scrolls sideways rather than collapsing into a menu.** A tab
 * strip that becomes a dropdown hides which sections exist, and the reason a
 * record has tabs at all is that the set of them is information.
 */
export interface TabItem {
  key: string;
  label: ReactNode;
  count?: number;
  /**
   * Set only where the count is a state rather than a total, following the
   * same rule as a rail item: a section with two things wanting an answer is a
   * different fact from a section with eleven rows in it.
   */
  countStatus?: Status;
  /**
   * A dot after the label, for a tab whose content wants an answer.
   *
   * Separate from a count because it is a different claim: a count says how
   * many, and this says "there is something in here", which is what a reader
   * needs when the number would be one. Warn rather than crit, because a tab is
   * a place to look rather than the thing that is wrong.
   */
  attention?: boolean;
}

const countInk: Record<Status, string> = {
  ok: "text-ok-ink",
  warn: "text-warn-ink",
  crit: "text-crit-ink",
  info: "text-info-ink",
  locked: "text-locked-ink",
  idle: "text-fg-tertiary",
};

export interface TabBandProps {
  items: readonly TabItem[];
  /** The `key` of the active tab. */
  active: string;
  variant?: "surface" | "inPage";
  /**
   * Renders one tab's link, so this package stays free of a router. Same
   * precedent as `NavItem` and `rowLinkClasses`.
   */
  render: (
    item: TabItem,
    props: { className: string; children: ReactNode; "aria-current": "page" | undefined },
  ) => ReactNode;
  /** Sits hard right. Only on the `surface` variant, where there is room. */
  trailing?: ReactNode;
  className?: string;
}

export function TabBand({
  items,
  active,
  variant = "surface",
  render,
  trailing,
  className,
}: TabBandProps) {
  return (
    <div
      className={cn(
        "flex items-stretch border-b border-(--gc-border-hairline)",
        variant === "surface" ? "h-11 bg-base px-8" : "h-[34px]",
        className,
      )}
    >
      <nav className="flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto">
        {items.map((item) => {
          const on = item.key === active;
          return (
            <div key={item.key} className="relative flex shrink-0 items-stretch">
              {render(item, {
                "aria-current": on ? "page" : undefined,
                className: cn(
                  "flex items-center gap-2 whitespace-nowrap px-3 text-sm",
                  "transition-colors duration-(--duration-quick)",
                  "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--gc-ring)",
                  on ? "font-medium text-fg" : "text-fg-tertiary hover:text-fg-secondary",
                ),
                children: (
                  <>
                    <span>{item.label}</span>
                    {item.attention === true ? (
                      <span
                        aria-hidden="true"
                        className="size-[5px] shrink-0 rounded-full bg-warn"
                      />
                    ) : null}
                    {item.count === undefined ? null : (
                      <span
                        className={cn(
                          "numeric text-3xs",
                          item.countStatus === undefined
                            ? "text-fg-tertiary"
                            : countInk[item.countStatus],
                        )}
                      >
                        {item.count}
                      </span>
                    )}
                  </>
                ),
              })}
              {/*
               * The underline sits on the container's own bottom hairline
               * rather than under the label, inset from each side, so the tab
               * strip reads as one edge with a lit segment rather than as a set
               * of separately underlined words. The artboard moves it at 140ms,
               * which is `--duration-quick`, and it is on the colour rather
               * than on the bar: the bar is per-tab and mounts where it lands,
               * so it has nothing to travel along.
               */}
              {on ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-1.5 -bottom-px h-0.5 rounded-full bg-accent"
                />
              ) : null}
            </div>
          );
        })}
      </nav>
      {trailing === undefined || variant === "inPage" ? null : (
        <div className="flex shrink-0 items-center gap-2 pl-4">{trailing}</div>
      )}
    </div>
  );
}
