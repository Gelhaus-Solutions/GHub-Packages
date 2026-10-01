import type { ReactNode } from "react";
import { cn } from "./cn.js";
import { StatusDot, type Status } from "./status.js";

/**
 * The readout band: the strip across the top of the content column that says
 * what this deployment's standing is, on every screen, in the same place.
 *
 * It is chrome rather than page content, and that is the whole argument for it.
 * Standing used to be a row of metric tiles on the dashboard, which meant the
 * one fact that changes what every other screen means was legible on exactly
 * one of them. An operator arrives here mid-incident, from a link, on whichever
 * screen the link pointed at. Lease, upstream reachability, chain head and
 * version have to be readable without navigating first.
 *
 * Cells carry their own right hairline rather than being separated by divider
 * elements, and the band puts a `flex-1` spacer after the last one, so anything
 * trailing sits hard right without the caller having to know that rule.
 */
export function ReadoutBand({
  children,
  trailing,
  className,
}: {
  /** The cells, in reading order. */
  children: ReactNode;
  /** Sits hard right: a search affordance, one ghost button, or a quiet fact. */
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-[46px] shrink-0 items-stretch overflow-x-auto border-b border-(--gc-border-hairline) bg-base",
        className,
      )}
    >
      {children}
      <div className="min-w-4 flex-1" />
      {trailing === undefined ? null : (
        <div className="flex shrink-0 items-center gap-2 pr-[18px]">{trailing}</div>
      )}
    </div>
  );
}

/**
 * What a cell looks like when its reading is the one that changes what
 * everything under it means.
 *
 * Emergency is the case this exists for: while a deployment is contained, every
 * other number on that screen is a number about a deployment that is serving
 * nobody, and a cell in the ordinary tertiary-on-base is not saying so. Wash
 * rather than a solid fill, because the band is chrome and a solid block of
 * crit at the top of every screen is an alarm nobody can silence.
 */
const emphasisSurface: Record<Status, string> = {
  ok: "bg-ok-wash",
  warn: "bg-warn-wash",
  crit: "bg-crit-wash",
  info: "bg-info-wash",
  locked: "bg-locked-wash",
  idle: "bg-idle-wash",
};

// `-ink` rather than the status colour, because this colours a label and a
// value rather than a mark: text owes 4.5:1 and the status colour does not
// reach it on a light surface. See the ink block in the theme.
const emphasisInk: Record<Status, string> = {
  ok: "text-ok-ink",
  warn: "text-warn-ink",
  crit: "text-crit-ink",
  info: "text-info-ink",
  locked: "text-locked-ink",
  idle: "text-fg-secondary",
};

export interface ReadoutCellProps {
  /** Uppercase and small. What the reading is, never what it means. */
  label: ReactNode;
  /** The reading itself. Mono, because it is something somebody compares. */
  children: ReactNode;
  /** Draws a dot before the value. Use it where the reading has a standing. */
  status?: Status;
  /**
   * The one looping animation in the product, and it is a claim: this value is
   * live and is being refreshed. Never decorative.
   */
  pulse?: boolean;
  /** Takes the status colour for the label, the value and the background. */
  emphasis?: boolean;
  className?: string;
}

export function ReadoutCell({
  label,
  children,
  status,
  pulse = false,
  emphasis = false,
  className,
}: ReadoutCellProps) {
  const lit = emphasis && status !== undefined;

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col justify-center gap-0.5 border-r border-(--gc-border-hairline) px-[18px]",
        lit && emphasisSurface[status],
        className,
      )}
    >
      <span className={cn("label-caps whitespace-nowrap", lit && emphasisInk[status])}>
        {label}
      </span>
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        {status === undefined ? null : (
          // 1.4s rather than the ping utility's 1s. The product's one animation
          // should read as a heartbeat rather than as something demanding to be
          // clicked, and `motion-reduce` inside StatusDot still removes it.
          <StatusDot
            status={status}
            size="sm"
            pulse={pulse}
            className="[&>span]:[animation-duration:1.4s]"
          />
        )}
        {/*
         * The `xs` step with the band's own leading. The band is one line in a
         * 46px box, so it wants tighter leading than the same size gets in a
         * paragraph, and the alternative was a size that is not on the scale.
         */}
        <span className={cn("numeric text-xs leading-4", lit ? emphasisInk[status] : "text-fg")}>
          {children}
        </span>
      </span>
    </div>
  );
}
