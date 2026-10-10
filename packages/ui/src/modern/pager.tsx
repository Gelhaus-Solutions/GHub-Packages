import type { ReactNode } from "react";
import { cn } from "../cn.js";

export interface PagerProps {
  /** "1–20 of 4,288", at the left. */
  summary: ReactNode;
  page: number;
  pages: number;
  /** The address of a page, for the caller's link. */
  href: (page: number) => string;
  renderLink: (props: {
    href: string;
    className: string;
    "aria-current"?: "page";
    "aria-label"?: string;
    children: ReactNode;
  }) => ReactNode;
  /** Names the set: "Pages". */
  label?: string;
  /** Read for the arrows: "Previous page", "Next page". */
  previousLabel?: string;
  nextLabel?: string;
  className?: string;
}

/**
 * Which page numbers to show: the first, the last, the current one and its
 * neighbours, with `null` where a run is left out.
 */
export function pagerPages(page: number, pages: number): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  const keep = new Set([1, 2, 3, page - 1, page, page + 1, pages]);
  const out: (number | null)[] = [];
  for (let one = 1; one <= pages; one += 1) {
    if (keep.has(one)) out.push(one);
    else if (out.at(-1) !== null) out.push(null);
  }
  return out;
}

const ITEM =
  "inline-grid h-[26px] min-w-7 place-items-center rounded-full px-2 font-mono text-[12px] tabular-nums max-sm:h-11 max-sm:min-w-11";

/**
 * Pages of a list the server renders from `?page=`: the count at the left,
 * and at the right a segmented pill of page links with the current one
 * raised, a gap where pages are left out, the last page and a next arrow.
 * Links, so a page is an address and the browser's history works.
 */
export function Pager({
  summary,
  page,
  pages,
  href,
  renderLink,
  label = "Pages",
  previousLabel = "Previous page",
  nextLabel = "Next page",
  className,
}: PagerProps) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <p className="text-[12.5px] text-m-ink-3">{summary}</p>
      {pages <= 1 ? null : (
        <nav
          aria-label={label}
          className="flex items-center gap-0.5 rounded-full border border-m-ink/8 bg-m-ink/6 p-[3px]"
        >
          {page > 1
            ? renderLink({
                href: href(page - 1),
                "aria-label": previousLabel,
                className: cn(ITEM, "text-m-ink-2 hover:text-m-ink"),
                children: <span aria-hidden="true">‹</span>,
              })
            : null}
          {pagerPages(page, pages).map((one, index) =>
            one === null ? (
              <span
                key={`gap-${String(index)}`}
                aria-hidden="true"
                className={cn(ITEM, "text-m-ink-3")}
              >
                …
              </span>
            ) : (
              <span key={one}>
                {renderLink({
                  href: href(one),
                  ...(one === page ? { "aria-current": "page" as const } : {}),
                  className: cn(
                    ITEM,
                    one === page
                      ? "bg-m-plate text-m-ink shadow-m-plate aurora:bg-a-raised-strong aurora:shadow-a-raised-strong"
                      : "text-m-ink-2 hover:text-m-ink",
                  ),
                  children: String(one),
                })}
              </span>
            ),
          )}
          {page < pages
            ? renderLink({
                href: href(page + 1),
                "aria-label": nextLabel,
                className: cn(ITEM, "text-m-ink-2 hover:text-m-ink"),
                children: <span aria-hidden="true">›</span>,
              })
            : null}
        </nav>
      )}
    </div>
  );
}
