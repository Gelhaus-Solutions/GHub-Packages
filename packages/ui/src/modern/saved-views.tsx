import type { ReactNode } from "react";
import { cn } from "../cn.js";
import { Badge, type BadgeTone } from "./badge.js";

export interface SavedView {
  key: string;
  label: ReactNode;
  href: string;
  /** How many the view holds. */
  count?: ReactNode;
  current?: boolean;
  /**
   * What its count means when it is not a plain total: `accent-wash` for
   * "needs me", `warn` for "links run out within 7 d". The current view's
   * count is always solid accent.
   */
  tone?: BadgeTone;
}

export interface SavedViewsProps {
  views: readonly SavedView[];
  /** Names the set: "Saved views". */
  label: string;
  /** The caller's link (routing belongs to the app). */
  renderLink: (props: {
    href: string;
    className: string;
    "aria-current": "page" | undefined;
    children: ReactNode;
  }) => ReactNode;
  className?: string;
}

/**
 * The saved views of a list (K16): a wrapping row of pill links, each with
 * its count, the current one lit in the accent. Links that set `?view=`, so
 * a view is an address somebody can send, with `aria-current` rather than a
 * tab role: they navigate, they do not swap panels.
 */
export function SavedViews({ views, label, renderLink, className }: SavedViewsProps) {
  return (
    <nav aria-label={label} className={cn("flex flex-wrap gap-1.5", className)}>
      {views.map((view) => (
        <span key={view.key}>
          {renderLink({
            href: view.href,
            "aria-current": view.current === true ? "page" : undefined,
            className: cn(
              "inline-flex h-8 items-center gap-2 rounded-full border pr-1.5 pl-3 text-[13px] leading-none whitespace-nowrap max-sm:h-11",
              view.current === true
                ? "border-m-accent/50 bg-m-accent-wash font-medium text-m-ink shadow-[inset_0_1px_0_color-mix(in_oklch,oklch(1_0_0)_14%,transparent),0_0_18px_-8px_var(--gm-accent)]"
                : "border-m-ink/10 bg-m-plate/40 text-m-ink-2 hover:border-m-ink/22 hover:text-m-ink",
              view.count === undefined ? "pr-3" : "",
            ),
            children: (
              <>
                {view.label}
                {view.count === undefined ? null : (
                  <Badge tone={view.current === true ? "accent" : (view.tone ?? "quiet")}>
                    {view.count}
                  </Badge>
                )}
              </>
            ),
          })}
        </span>
      ))}
    </nav>
  );
}
