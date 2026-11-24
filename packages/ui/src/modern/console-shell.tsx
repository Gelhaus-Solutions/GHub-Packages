import type { ReactNode } from "react";
import { cn } from "../cn.js";
import { ConsoleGroupTab, ConsoleWorkspacesButton } from "./console-menu.js";

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

/** A page of the current workspace, as a tab in the top bar or a link in a group's list. */
export interface ConsolePageLink {
  href: string;
  label: ReactNode;
  current?: boolean;
  /** Words for a warn dot: something waits on the page. */
  flag?: string;
  /** How many things the page lists, shown beside it in a group's list. */
  count?: number;
}

/**
 * Several pages as one tab (D242 in GFabric): a click opens their list. A group the shell is
 * given with one page draws that page as a plain tab.
 */
export interface ConsolePageGroup {
  key: string;
  label: string;
  pages: readonly ConsolePageLink[];
}

export type ConsolePage = ConsolePageLink | ConsolePageGroup;

function isGroup(page: ConsolePage): page is ConsolePageGroup {
  return "pages" in page;
}

/** A warn dot and its words, after a label. */
function Flag({ words }: { words: string }) {
  return (
    <>
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-m-warn" />
      <span className="sr-only">, {words}</span>
    </>
  );
}

export interface ConsoleShellProps {
  /** The product's name, grey at the right of the top bar ("GFabric"). */
  product: string;
  /** What the console runs against, at the far left: an estate or site chip, the app's to draw. */
  context?: ReactNode;
  /** The current workspace, the blue tab after the context. */
  workspace: { label: string; icon: ReactNode; href: string };
  /** The workspace's pages and groups of pages; a workspace of one page passes none. */
  pages: readonly ConsolePage[];
  /** Names the page tabs for somebody moving by landmark. */
  pagesLabel: string;
  /**
   * The rail's groups, top to bottom; a hairline sits between two groups. Below 768px the rail
   * is a sheet that the workspace's button opens, and `label` names that button too.
   */
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
 * Server rendered; only a group's list and the narrow screen's workspaces open
 * and close in the browser. The pages are routes, so they are links with
 * `aria-current`, never `role="tab"` (see `Tabs`); a group of pages is one tab
 * whose click lists them (a disclosure of links). On a narrow screen the tabs
 * wrap under the top bar rather than scroll behind an edge (WCAG 1.4.10), and
 * below 768px the workspace's tab becomes a button that opens the workspaces as
 * a sheet, instead of the rail taking a row above the page. The rail's links are
 * icons, so each carries its name as `aria-label` and as a tooltip.
 */
/** A page's label as text, for the group tab that names it: a string, or the text inside. */
function textOf(label: ReactNode): string {
  if (typeof label === "string" || typeof label === "number") return String(label);
  if (Array.isArray(label)) return label.map(textOf).join("");
  if (label !== null && typeof label === "object" && "props" in label) {
    return textOf((label.props as { children?: ReactNode }).children);
  }
  return "";
}

function railLabel(item: ConsoleRailItem): string {
  return item.count === undefined || item.count === 0 || item.countWords === undefined
    ? item.label
    : `${item.label}, ${item.count} ${item.countWords}`;
}

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
        <ConsoleWorkspacesButton
          label={rail.label}
          workspace={{ label: workspace.label, icon: workspace.icon }}
        >
          {rail.groups.map((group, index) => (
            <ul
              key={group.map((item) => item.key).join(" ")}
              className={cn(
                "flex flex-col gap-0.5",
                index > 0 && "mt-1.5 border-t border-m-subtle pt-1.5",
              )}
            >
              {group.map((item) => (
                <li key={item.key} className="flex">
                  {renderLink({
                    href: item.href,
                    className: cn(
                      "flex min-h-11 flex-1 items-center gap-3 rounded-[8px] px-2.5 text-[14.5px] no-underline [&_svg]:size-[18px]",
                      item.current === true
                        ? "bg-m-selected text-m-accent-text"
                        : "text-m-ink hover:bg-m-hover",
                    ),
                    "aria-current": item.current === true ? "page" : undefined,
                    "aria-label": railLabel(item),
                    children: (
                      <>
                        <span aria-hidden="true" className="inline-flex text-m-ink-3">
                          {item.icon}
                        </span>
                        {item.label}
                        {item.count === undefined || item.count === 0 ? null : (
                          <span
                            aria-hidden="true"
                            className="ml-auto min-w-4 rounded-full bg-m-crit-fill px-1 text-center text-[10.5px] font-semibold leading-4 text-white"
                          >
                            {item.count > 99 ? "99+" : item.count}
                          </span>
                        )}
                      </>
                    ),
                  })}
                </li>
              ))}
            </ul>
          ))}
        </ConsoleWorkspacesButton>
        {renderLink({
          href: workspace.href,
          className:
            "inline-flex h-12 shrink-0 items-center gap-1.5 px-1.5 text-[13px] font-medium text-m-accent-text no-underline hover:text-m-ink max-md:hidden [&_svg]:size-[18px]",
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
            {pages.map((entry) => {
              const page = isGroup(entry) && entry.pages.length === 1 ? entry.pages[0] : entry;
              if (page === undefined) return null;
              if (isGroup(page)) {
                if (page.pages.length === 0) return null;
                const on = page.pages.find((p) => p.current === true);
                const flags = page.pages.flatMap((p) => (p.flag === undefined ? [] : [p.flag]));
                return (
                  <ConsoleGroupTab
                    key={page.key}
                    label={page.label}
                    current={on === undefined ? undefined : textOf(on.label)}
                    flag={flags.length === 0 ? undefined : flags.join(", ")}
                  >
                    <ul className="flex flex-col gap-0.5">
                      {page.pages.map((p) => (
                        <li key={p.href} className="flex">
                          {renderLink({
                            href: p.href,
                            className: cn(
                              "flex min-h-9 flex-1 items-center gap-2.5 whitespace-nowrap rounded-[6px] px-2.5 text-[13px] no-underline max-sm:min-h-12 max-sm:text-[15px]",
                              p.current === true
                                ? "bg-m-selected text-m-accent-text"
                                : "text-m-ink hover:bg-m-hover",
                            ),
                            "aria-current": p.current === true ? "page" : undefined,
                            children: (
                              <>
                                {p.label}
                                <span className="ml-auto flex items-center gap-2 pl-4">
                                  {p.count === undefined ? null : (
                                    <span className="font-mono text-[11.5px] tabular-nums text-m-ink-3">
                                      {p.count}
                                    </span>
                                  )}
                                  {p.flag === undefined ? null : <Flag words={p.flag} />}
                                </span>
                              </>
                            ),
                          })}
                        </li>
                      ))}
                    </ul>
                  </ConsoleGroupTab>
                );
              }
              return (
                <span key={page.href} className="flex">
                  {renderLink({
                    href: page.href,
                    className: cn(
                      "inline-flex h-12 items-center gap-1.5 whitespace-nowrap px-2.5 text-[13px] no-underline max-sm:h-11",
                      page.current === true
                        ? "text-m-accent-text shadow-[inset_0_-2px_0_var(--gm-accent-text)]"
                        : "text-m-ink-2 hover:text-m-ink",
                    ),
                    "aria-current": page.current === true ? "page" : undefined,
                    children: (
                      <>
                        {page.label}
                        {page.flag === undefined ? null : <Flag words={page.flag} />}
                      </>
                    ),
                  })}
                </span>
              );
            })}
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
          className="flex w-[52px] shrink-0 flex-col items-center gap-1 border-r border-m-hairline py-2.5 max-md:hidden"
        >
          {rail.groups.map((group, index) => (
            <div
              key={group.map((item) => item.key).join(" ")}
              className={cn(
                "flex flex-col items-center gap-1",
                index > 0 && "mt-1.5 border-t border-m-subtle pt-2.5",
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
                    "aria-label": railLabel(item),
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
