import type { ReactNode } from "react";
import { cn } from "../cn.js";

export interface Tab {
  href: string;
  label: ReactNode;
  current?: boolean;
}

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
  className?: string;
}

export function Tabs({ tabs, renderLink, label, className }: TabsProps) {
  return (
    <nav aria-label={label} className={cn("border-b border-m-hairline", className)}>
      <ul className="flex gap-6">
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
                "-mb-px inline-block border-b-2 pb-3 text-m-body",
                tab.current === true
                  ? "border-m-accent text-m-ink"
                  : "border-transparent text-m-ink-3",
              ),
              "aria-current": tab.current === true ? "page" : undefined,
              children: tab.label,
            })}
          </li>
        ))}
      </ul>
    </nav>
  );
}
