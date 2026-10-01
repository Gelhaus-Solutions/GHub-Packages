import type { ReactNode } from "react";
import { cn } from "./cn.js";
import type { Status } from "./status.js";

/**
 * The phone tab bar: five destinations at most, always visible.
 *
 * Operator screens get opened on a phone during an incident, which is exactly
 * when a hamburger is the wrong control. A menu that has to be opened before it
 * can be read costs a tap and a decision at the moment somebody has neither to
 * spare, and it hides the one thing they came to check.
 *
 * **Five is a limit, not a guideline.** Past five the targets stop being
 * thumb-sized on a narrow phone, and this takes only what fits rather than
 * shrinking to accommodate: the sixth destination belongs behind a `Sheet`,
 * with the rail's full set of groups in it.
 *
 * The bar is 56px and every item is at least 44px of hit area, which is the
 * smallest target that can be hit reliably by a thumb. `env(safe-area-inset-bottom)`
 * is added below that, because on a phone with a home indicator the bottom
 * 34 points belong to the system and a tab drawn into them is a tab that
 * dismisses the app instead.
 */
export interface BottomTab {
  /** A 20px icon. The label alone is too small to aim at. */
  icon: ReactNode;
  label: string;
  href: string;
  /** A count that needs a person. Never a total: this is the last place for one. */
  badge?: number;
  /** Colours the badge. Set it only where the number is a state. */
  badgeStatus?: Extract<Status, "warn" | "crit">;
}

const badgeInk: Record<NonNullable<BottomTab["badgeStatus"]>, string> = {
  warn: "bg-warn-wash text-warn-ink",
  crit: "bg-crit-wash text-crit-ink",
};

export function BottomTabs({
  items,
  active,
  renderItem,
  ariaLabel = "Sections",
  className,
}: {
  /**
   * Props rather than literals: every user-visible string in this product goes
   * through next-intl, and a design-system component has no locale of its own.
   * The caller has one and this does not.
   */
  ariaLabel?: string;
  /** At most five. Anything past the fifth is dropped rather than squeezed. */
  items: readonly BottomTab[];
  /** The href of the destination being shown. */
  active?: string;
  /**
   * Renders one tab's link, so this package stays free of a router.
   *
   * Only a client caller can pass this, since it is a function. Omit it and
   * each tab is a plain anchor, which is what a server-rendered layout needs
   * and is a full page load.
   */
  renderItem?: (
    tab: BottomTab,
    props: { className: string; children: ReactNode; "aria-current": "page" | undefined },
  ) => ReactNode;
  className?: string;
}) {
  const shown = items.slice(0, 5);

  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "flex items-stretch border-t border-(--gc-border-hairline) bg-base",
        // The bar's own height, then whatever the device reserves under it.
        "h-14 pb-[env(safe-area-inset-bottom)] box-content",
        className,
      )}
    >
      {shown.map((tab) => {
        const current = active !== undefined && tab.href === active;
        const itemClass = cn(
          "relative flex min-h-11 flex-1 flex-col items-center justify-center gap-1 px-1",
          "transition-colors duration-(--duration-instant)",
          "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--gc-ring)",
          current ? "text-fg-accent" : "text-fg-tertiary",
        );

        const body = (
          <>
            <span className="relative flex">
              {tab.icon}
              {tab.badge === undefined ? null : (
                <span
                  className={cn(
                    "numeric absolute -right-2.5 -top-1.5 min-w-[15px] rounded-full px-1 text-center text-3xs leading-[15px]",
                    tab.badgeStatus === undefined
                      ? "bg-inset text-fg-secondary"
                      : badgeInk[tab.badgeStatus],
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </span>
            {/* The label is 10px and never truncated to an ellipsis: a tab
                reading "Deploy..." is a tab nobody can identify. Five short
                words is the constraint that keeps this honest. */}
            <span className="text-3xs leading-[13px]">{tab.label}</span>
          </>
        );

        const currentAttr = current ? ("page" as const) : undefined;

        if (renderItem !== undefined) {
          return (
            <span key={tab.href} className="contents">
              {renderItem(tab, {
                className: itemClass,
                children: body,
                "aria-current": currentAttr,
              })}
            </span>
          );
        }

        return (
          <a key={tab.href} href={tab.href} aria-current={currentAttr} className={itemClass}>
            {body}
          </a>
        );
      })}
    </nav>
  );
}
