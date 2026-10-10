import type { ReactNode } from "react";
import { cn } from "../cn.js";

/** A segment's colour: a level, at a strength (100, 70, 45, 40 or 22 per cent). */
export interface DistributionSegment {
  key: string;
  label: ReactNode;
  value: number;
  level: "ok" | "warn" | "crit" | "info" | "accent" | "idle" | "ink";
  strength?: 100 | 70 | 45 | 40 | 22;
  /** Read in its level's ink in the legend: a share that is bad news. */
  bad?: boolean;
}

export interface DistributionBarProps {
  segments: readonly DistributionSegment[];
  /** Formats a count for the legend (thousands separators). */
  format?: (value: number) => string;
  className?: string;
}

const FILL: Readonly<Record<DistributionSegment["level"], string>> = {
  ok: "var(--gm-ok)",
  warn: "var(--gm-warn)",
  crit: "var(--gm-crit)",
  info: "var(--gm-info)",
  accent: "var(--gm-accent)",
  idle: "var(--gm-idle)",
  ink: "var(--gm-ink)",
};
const INK: Readonly<Record<DistributionSegment["level"], string>> = {
  ok: "text-m-ok-ink",
  warn: "text-m-warn-ink",
  crit: "text-m-crit-ink",
  info: "text-m-info-ink",
  accent: "text-m-accent-text",
  idle: "text-m-ink-2",
  ink: "text-m-ink-2",
};

function fill(segment: DistributionSegment): string {
  const strength = segment.strength ?? 100;
  return strength === 100
    ? FILL[segment.level]
    : `color-mix(in oklch, ${FILL[segment.level]} ${String(strength)}%, transparent)`;
}

/**
 * Shares of a whole as one bar (K13), with a legend that carries the numbers.
 * The bar is decoration (`aria-hidden`); a small bad share keeps a 4px
 * minimum so it never vanishes, and the legend says it in its level's ink.
 */
export function DistributionBar({
  segments,
  format = (value) => value.toLocaleString("en-GB"),
  className,
}: DistributionBarProps) {
  const total = segments.reduce((sum, one) => sum + Math.max(0, one.value), 0);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span aria-hidden="true" className="flex h-2 gap-[3px] overflow-hidden rounded-full">
        {segments
          .filter((one) => one.value > 0)
          .map((one) => (
            <span
              key={one.key}
              className="h-2 min-w-1 rounded-[2px] first:rounded-l-full last:rounded-r-full"
              style={{
                flexGrow: total === 0 ? 1 : one.value / total,
                flexBasis: 0,
                background: fill(one),
              }}
            />
          ))}
      </span>
      <ul className="flex flex-wrap gap-x-3.5 gap-y-1">
        {segments.map((one) => (
          <li
            key={one.key}
            className={cn(
              "flex items-center gap-1.5 text-[12px] leading-4",
              one.bad === true ? INK[one.level] : "text-m-ink-2",
            )}
          >
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-[2px]"
              style={{ background: fill(one) }}
            />
            {one.label}
            <span className="font-mono tabular-nums">{format(one.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
