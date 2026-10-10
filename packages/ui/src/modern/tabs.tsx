import type { ReactNode } from "react";
import { cn } from "../cn.js";
import { Badge, type BadgeTone } from "./badge.js";

export interface Tab {
  href: string;
  label: ReactNode;
  current?: boolean;
  /**
   * How many the tab holds. Mono after the label on the underline tabs; a
   * badge on the segmented ones (a hover-filled pill on the current tab,
   * plain on the others, unless `countTone` says otherwise).
   */
  count?: ReactNode;
  /** The count's meaning when it is not a plain total (a solid accent "needs you"). */
  countTone?: BadgeTone;
  /**
   * Something on that tab needs doing: a 6px warn dot after the label, and
   * these words for a screen reader ("needs attention").
   */
  flag?: string;
}

/**
 * `underline` is a record's own tabs (an agreement's Overview, Document,
 * Activity); `segmented` is an area's lists (Agreements, Parties, Templates),
 * a pill track with the current list raised. Both are routes.
 */
export type TabsVariant = "underline" | "segmented";

/**
 * Tabs change the content under them, and each one is a route.
 *
 * **Real links, `aria-current`, no `role="tab"` and no arrow key handling.**
 * That combination is deliberate and it is the opposite of what a headless
 * library gives you. The ARIA tabs pattern describes a widget whose panels are
 * all present and swapped by script: arrow keys move between them, one tab stop
 * covers the set, and the browser's own history is not involved. These are
 * navigation. Announcing them as a tablist promises keyboard behaviour that is
 * not there, and taking the arrow keys to deliver it would break the one thing
 * links are for.
 *
 * **If it is not a route it is a `SegmentedControl`**, which is the widget this
 * is being mistaken for whenever somebody reaches for `role="tab"` here.
 *
 * The caller supplies the link element, because routing belongs to the app: in
 * Next that is `next/link`, and a design system reaching for it would make this
 * package depend on a framework two products might not share.
 */
export interface TabsProps {
  tabs: readonly Tab[];
  /**
   * Renders one link. Receives the href, the content and the classes this
   * component decided, so the caller supplies routing and nothing else.
   */
  renderLink: (props: {
    href: string;
    className: string;
    "aria-current": "page" | undefined;
    children: ReactNode;
  }) => ReactNode;
  /** Names the set for somebody moving by landmark. */
  label: string;
  variant?: TabsVariant;
  className?: string;
}

function Flag({ words }: { words: string }) {
  return (
    <>
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-m-warn" />
      <span className="sr-only">, {words}</span>
    </>
  );
}

export function Tabs({ tabs, renderLink, label, variant = "underline", className }: TabsProps) {
  if (variant === "segmented") {
    return (
      <nav
        aria-label={label}
        className={cn(
          "flex w-max max-w-full gap-0.5 overflow-x-auto rounded-full border border-m-ink/8 bg-m-ink/6 p-[3px] [scrollbar-width:none]",
          className,
        )}
      >
        {tabs.map((tab) => (
          <span key={tab.href} className="shrink-0">
            {renderLink({
              href: tab.href,
              className: cn(
                "inline-flex h-[30px] items-center gap-2 rounded-full pr-2 pl-3.5 text-[13.5px] leading-none whitespace-nowrap max-sm:h-11",
                tab.current === true
                  ? "bg-m-plate font-medium text-m-ink shadow-m-plate aurora:bg-a-raised-strong aurora:shadow-a-raised-strong"
                  : "text-m-ink-2 hover:text-m-ink",
                tab.count === undefined ? "pr-3.5" : "",
              ),
              "aria-current": tab.current === true ? "page" : undefined,
              children: (
                <>
                  {tab.label}
                  {tab.count === undefined ? null : (
                    <Badge tone={tab.countTone ?? (tab.current === true ? "quiet" : "plain")}>
                      {tab.count}
                    </Badge>
                  )}
                  {tab.flag === undefined ? null : <Flag words={tab.flag} />}
                </>
              ),
            })}
          </span>
        ))}
      </nav>
    );
  }
  return (
    <nav aria-label={label} className={cn("border-b border-m-hairline", className)}>
      {/*
       * Wrapped rather than scrolled on a narrow screen: a row that scrolls
       * sideways hides tabs behind an edge nobody sees (WCAG 1.4.10), and this
       * is a server component, so it cannot scroll the current one into view.
       */}
      <ul className="flex flex-wrap gap-x-6 gap-y-2">
        {tabs.map((tab) => (
          <li key={tab.href}>
            {renderLink({
              href: tab.href,
              /*
               * The underline is 2px of accent on the current tab and 2px of
               * nothing on the others, so the row does not shift by two pixels
               * when the selection moves.
               */
              className: cn(
                "-mb-px inline-block border-b-2 pb-3 text-m-body whitespace-nowrap",
                // Aurora: 40 high at 14, and the current tab's rule is a 2px
                // bar of light rather than a border, so it can glow.
                "aurora:relative aurora:inline-flex aurora:h-10 aurora:items-center aurora:border-b-0 aurora:pb-0 aurora:text-[14px] aurora:leading-none",
                tab.current === true
                  ? "border-m-accent text-m-ink aurora:font-medium aurora:after:absolute aurora:after:inset-x-0 aurora:after:-bottom-px aurora:after:h-0.5 aurora:after:rounded-[2px] aurora:after:bg-m-accent aurora:after:shadow-[0_0_10px_var(--gm-accent)]"
                  : "border-transparent text-m-ink-3 aurora:text-m-ink-2 aurora:hover:text-m-ink",
              ),
              "aria-current": tab.current === true ? "page" : undefined,
              children:
                tab.count === undefined && tab.flag === undefined ? (
                  tab.label
                ) : (
                  <span className="inline-flex items-center gap-[7px]">
                    {tab.label}
                    {tab.count === undefined ? null : (
                      <span className="font-mono text-[12px] font-normal text-m-ink-3">
                        {tab.count}
                      </span>
                    )}
                    {tab.flag === undefined ? null : <Flag words={tab.flag} />}
                  </span>
                ),
            })}
          </li>
        ))}
      </ul>
    </nav>
  );
}
