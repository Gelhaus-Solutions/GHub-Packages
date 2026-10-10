import type { ReactNode } from "react";
import { cn } from "../cn.js";
import { AURORA_GLASS } from "./aurora.js";

/** A tile's level: its label's ink and dot, and its light when hot. */
export type StatLevel = "ok" | "warn" | "crit" | "info" | "accent" | "idle";

export interface StatTileProps {
  label: ReactNode;
  level: StatLevel;
  /** The figure. */
  value: ReactNode;
  /** A ring instead of a dot, for a figure that is uncertain. */
  uncertain?: boolean;
  /** The change beside the figure ("+2 wk"), in a crit wash when it is bad. */
  delta?: { text: ReactNode; bad?: boolean };
  /** One quiet line under the figure. */
  meta?: ReactNode;
  /** Up to 14 bars of recent history, decoration only (the meta says it). */
  spark?: readonly number[];
  /** The worst news on the screen: lit in its level. */
  hot?: boolean;
  /** 28/32 instead of 30/34, for a row of four on a record's page. */
  compact?: boolean;
  /** Where the figure is counted: a tile is always a link to its list. */
  href: string;
  renderLink: (props: { href: string; className: string; children: ReactNode }) => ReactNode;
  className?: string;
}

const INK: Readonly<Record<StatLevel, string>> = {
  ok: "text-m-ok-ink",
  warn: "text-m-warn-ink",
  crit: "text-m-crit-ink",
  info: "text-m-info-ink",
  accent: "text-m-accent-text",
  idle: "text-m-ink-2",
};
const DOT: Readonly<Record<StatLevel, string>> = {
  ok: "bg-m-ok",
  warn: "bg-m-warn",
  crit: "bg-m-crit",
  info: "bg-m-info",
  accent: "bg-m-accent shadow-[0_0_8px_var(--gm-accent)]",
  idle: "bg-m-idle",
};
const RING: Readonly<Record<StatLevel, string>> = {
  ok: "border-m-ok",
  warn: "border-m-warn",
  crit: "border-m-crit",
  info: "border-m-info",
  accent: "border-m-accent",
  idle: "border-m-idle",
};
const SPARK: Readonly<Record<StatLevel, string>> = {
  ok: "bg-m-ok",
  warn: "bg-m-warn",
  crit: "bg-m-crit",
  info: "bg-m-info",
  accent: "bg-m-accent",
  idle: "bg-m-idle",
};
const HOT: Readonly<Record<StatLevel, string>> = {
  ok: "border-m-ok/45 aurora:border-m-ok/45 bg-[linear-gradient(160deg,color-mix(in_oklch,var(--gm-ok)_18%,transparent),transparent_70%)] shadow-[0_14px_32px_-18px_color-mix(in_oklch,var(--gm-ok)_70%,transparent)]",
  warn: "border-m-warn/45 aurora:border-m-warn/45 bg-[linear-gradient(160deg,color-mix(in_oklch,var(--gm-warn)_18%,transparent),transparent_70%)] shadow-[0_14px_32px_-18px_color-mix(in_oklch,var(--gm-warn)_70%,transparent)]",
  crit: "border-m-crit/45 aurora:border-m-crit/45 bg-[linear-gradient(160deg,color-mix(in_oklch,var(--gm-crit)_18%,transparent),transparent_70%)] shadow-[0_14px_32px_-18px_color-mix(in_oklch,var(--gm-crit)_70%,transparent)]",
  info: "border-m-info/45 aurora:border-m-info/45 bg-[linear-gradient(160deg,color-mix(in_oklch,var(--gm-info)_18%,transparent),transparent_70%)] shadow-[0_14px_32px_-18px_color-mix(in_oklch,var(--gm-info)_70%,transparent)]",
  accent:
    "border-m-accent/45 aurora:border-m-accent/45 bg-[linear-gradient(160deg,color-mix(in_oklch,var(--gm-accent)_18%,transparent),transparent_70%)] shadow-[0_14px_32px_-18px_color-mix(in_oklch,var(--gm-accent)_70%,transparent)]",
  idle: "",
};

/**
 * One figure that leads to its list (K11): a label in its level with a dot,
 * the number, an optional change and a quiet line, and an optional sparkline.
 * Always a link to the exact filtered list it counts, because a figure nobody
 * can open is a figure nobody acts on. A hot tile is the worst news on the
 * screen and is lit in its level.
 */
export function StatTile({
  label,
  level,
  value,
  uncertain = false,
  delta,
  meta,
  spark,
  hot = false,
  compact = false,
  href,
  renderLink,
  className,
}: StatTileProps) {
  const high = spark === undefined || spark.length === 0 ? 1 : Math.max(1, ...spark);
  return renderLink({
    href,
    className: cn(
      "group flex min-w-0 flex-col rounded-m-card border border-m-subtle bg-m-plate px-4 pt-3.5 pb-3 text-m-ink shadow-m-plate no-underline",
      "transition-[translate,border-color] duration-[180ms] hover:-translate-y-px hover:border-m-ink/20 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
      AURORA_GLASS,
      hot ? HOT[level] : "aurora:hover:border-m-ink/20",
      className,
    ),
    children: (
      <>
        <span
          className={cn(
            "flex items-center gap-[7px] text-[12.5px] leading-4 font-medium",
            INK[level],
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-[7px] shrink-0 rounded-full",
              uncertain ? cn("border-[1.5px]", RING[level]) : DOT[level],
            )}
          />
          {label}
        </span>
        <span className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span
            className={cn(
              "font-semibold tracking-[-0.03em] tabular-nums",
              compact ? "text-[28px] leading-8" : "text-[30px] leading-[34px]",
            )}
          >
            {value}
          </span>
          {delta === undefined ? null : (
            <span
              className={cn(
                "inline-flex h-5 items-center rounded-full px-[7px] font-mono text-[11px] leading-none tabular-nums",
                delta.bad === true ? "bg-m-crit-wash text-m-crit-ink" : "bg-m-hover text-m-ink-2",
              )}
            >
              {delta.text}
            </span>
          )}
        </span>
        {meta === undefined ? null : (
          <span className="mt-0.5 text-[12px] leading-4 text-m-ink-3">{meta}</span>
        )}
        {spark === undefined || spark.length === 0 ? null : (
          <span aria-hidden="true" className="mt-auto flex h-[22px] items-end gap-0.5 pt-2.5">
            {spark.slice(-14).map((one, index) => (
              <span
                key={index}
                className={cn("flex-1 rounded-[2px] opacity-60", SPARK[level])}
                style={{ height: `${String(Math.max(8, Math.round((one / high) * 100)))}%` }}
              />
            ))}
          </span>
        )}
      </>
    ),
  });
}

export interface StatTilesProps {
  /** Names the row: "At a glance". */
  label: string;
  /** Equal columns from desktop up: five on a dashboard, four on a record. */
  columns?: 4 | 5;
  children: ReactNode;
  className?: string;
}

/** A row of tiles: equal columns from desktop, as many as fit below. */
export function StatTiles({ label, columns = 5, children, className }: StatTilesProps) {
  return (
    <section
      aria-label={label}
      className={cn(
        "grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(168px,1fr))]",
        columns === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </section>
  );
}
