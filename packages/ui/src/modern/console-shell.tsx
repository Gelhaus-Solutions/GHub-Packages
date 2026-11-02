import type { ReactNode } from "react";
import { cn } from "../cn.js";

/**
 * One link the shell draws: the caller supplies routing, as with `Tabs`, so this
 * package depends on no framework's link.
 */
export type ConsoleRenderLink = (props: {
  href: string;
  className: string;
  "aria-current": "page" | undefined;
  "aria-label"?: string;
  title?: string;
  children: ReactNode;
}) => ReactNode;

/** A workspace in the icon rail. */
export interface ConsoleRailItem {
  key: string;
  label: string;
  icon: ReactNode;
  href: string;
  current?: boolean;
  /** Something waits in it: a small count on the icon, and these words for a screen reader. */
  count?: number;
  countWords?: string;
}

/** A page of the current workspace, as a tab in the top bar. */
export interface ConsolePage {
  href: string;
  label: ReactNode;
  current?: boolean;
}

export interface ConsoleShellProps {
  /** The product's name, grey at the right of the top bar ("GFabric"). */
  product: string;
  /** What the console runs against, at the far left: an estate or site chip, the app's to draw. */
  context?: ReactNode;
  /** The current workspace, the blue tab after the context. */
  workspace: { label: string; icon: ReactNode; href: string };
  /** The workspace's pages; a workspace of one page passes none. */
  pages: readonly ConsolePage[];
  /** Names the page tabs for somebody moving by landmark. */
  pagesLabel: string;
  /** The rail's groups, top to bottom; a hairline sits between two groups. */
  rail: { label: string; groups: readonly (readonly ConsoleRailItem[])[] };
  /** Round buttons at the right of the top bar: search, what waits, the person. */
  actions?: ReactNode;
  renderLink: ConsoleRenderLink;
  /** "Skip to content", for the link that comes first. */
  skipLabel: string;
  children: ReactNode;
}

/** The round 32px icon button of the top bar, for a caller's own `<button>` or link. */
export const CONSOLE_ROUND =
  "relative inline-grid size-8 shrink-0 place-items-center rounded-full border border-m-subtle text-m-ink-2 hover:bg-m-hover hover:text-m-ink max-sm:size-11";

/**
 * The console's frame, modelled on UniFi Network (D118, D119 in GFabric): a
 * 48px top bar with the context, the workspace as a blue tab, the workspace's
 * pages as plain text tabs (the current one blue with a 2px underline) and the
 * product's name with round buttons at the right; under it a 52px icon rail of
 * workspaces and the page.
 *
 * Server rendered, no state. The pages are routes, so they are links with
 * `aria-current`, never `role="tab"` (see `Tabs`); on a narrow screen they wrap
 * under the top bar rather than scroll behind an edge (WCAG 1.4.10), and the
 * rail turns into a row above the page. The rail's links are icons, so each
 * carries its name as `aria-label` and as a tooltip.
 */
export function ConsoleShell({
  product,
  context,
  workspace,
  pages,
  pagesLabel,
  rail,
  actions,
  renderLink,
  skipLabel,
  children,
}: ConsoleShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-m-ground text-m-ink">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-30 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-m-control focus:bg-m-overlay focus:px-4 focus:text-m-label focus:text-m-accent-text"
      >
        {skipLabel}
      </a>
      <header className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 border-b border-m-hairline px-3">
        {context}
        {renderLink({
          href: workspace.href,
          className:
            "inline-flex h-12 shrink-0 items-center gap-1.5 px-1.5 text-[13px] font-medium text-m-accent-text no-underline hover:text-m-ink [&_svg]:size-[18px]",
          "aria-current": pages.length === 0 ? "page" : undefined,
          children: (
            <>
              <span aria-hidden="true" className="inline-flex">
                {workspace.icon}
              </span>
              {workspace.label}
            </>
          ),
        })}
        {pages.length === 0 ? null : (
          <nav aria-label={pagesLabel} className="flex min-w-0 flex-wrap items-stretch">
            {pages.map((page) => (
              <span key={page.href} className="flex">
                {renderLink({
                  href: page.href,
                  className: cn(
                    "inline-flex h-12 items-center whitespace-nowrap px-2.5 text-[13px] no-underline max-sm:h-11",
                    page.current === true
                      ? "text-m-accent-text shadow-[inset_0_-2px_0_var(--gm-accent-text)]"
                      : "text-m-ink-2 hover:text-m-ink",
                  ),
                  "aria-current": page.current === true ? "page" : undefined,
                  children: page.label,
                })}
              </span>
            ))}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-2 py-1.5">
          <span className="mr-1 hidden text-[13px] font-semibold tracking-[0.02em] text-m-ink-3 xl:inline">
            {product}
          </span>
          {actions}
        </div>
      </header>
      <div className="flex flex-1 flex-wrap items-stretch">
        <nav
          aria-label={rail.label}
          className="flex w-[52px] shrink-0 flex-col items-center gap-1 border-r border-m-hairline py-2.5 max-md:w-full max-md:flex-row max-md:flex-wrap max-md:border-r-0 max-md:border-b max-md:px-2"
        >
          {rail.groups.map((group, index) => (
            <div
              key={group.map((item) => item.key).join(" ")}
              className={cn(
                "flex flex-col items-center gap-1 max-md:flex-row",
                index > 0 &&
                  "mt-1.5 border-t border-m-subtle pt-2.5 max-md:mt-0 max-md:ml-1.5 max-md:border-t-0 max-md:border-l max-md:pt-0 max-md:pl-2.5",
              )}
            >
              {group.map((item) => (
                <span key={item.key} className="flex">
                  {renderLink({
                    href: item.href,
                    className: cn(
                      "relative grid size-9 place-items-center rounded-[8px] no-underline max-sm:size-11 [&_svg]:size-[18px]",
                      item.current === true
                        ? "bg-m-selected text-m-accent-text"
                        : "text-m-ink-3 hover:bg-m-hover hover:text-m-ink",
                    ),
                    "aria-current": item.current === true ? "page" : undefined,
                    "aria-label":
                      item.count === undefined || item.count === 0 || item.countWords === undefined
                        ? item.label
                        : `${item.label}, ${item.count} ${item.countWords}`,
                    title: item.label,
                    children: (
                      <>
                        <span aria-hidden="true" className="inline-flex">
                          {item.icon}
                        </span>
                        {item.count === undefined || item.count === 0 ? null : (
                          <span
                            aria-hidden="true"
                            className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-m-crit-fill px-1 text-center text-[10.5px] font-semibold leading-4 text-white"
                          >
                            {item.count > 99 ? "99+" : item.count}
                          </span>
                        )}
                      </>
                    ),
                  })}
                </span>
              ))}
            </div>
          ))}
        </nav>
        <main id="content" tabIndex={-1} className="flex min-w-0 flex-[999_1_560px] flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
