import type { ReactNode } from "react";
import { Sparkline } from "./charts/sparkline.js";
import { cn } from "./cn.js";
import type { Status } from "./status.js";

/**
 * Numbers. Every value a human might compare is set in mono with tabular figures,
 * so columns line up and a changing digit does not shift the layout. That is the
 * single rule that makes a dense dashboard readable.
 */
export function Metric({
  label,
  value,
  unit,
  status = "idle",
  series,
  hint,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: string;
  status?: Status;
  /** Recent history. A number without a trend is half a story. */
  series?: readonly number[];
  hint?: ReactNode;
  className?: string;
}) {
  const statusText: Record<Status, string> = {
    ok: "text-ok-ink",
    warn: "text-warn-ink",
    crit: "text-crit-ink",
    info: "text-info-ink",
    locked: "text-locked-ink",
    idle: "text-fg",
  };

  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-2xs uppercase tracking-[0.08em] text-fg-tertiary truncate">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={cn("numeric text-lg leading-none", statusText[status])}>{value}</span>
        {unit === undefined ? null : <span className="text-xs text-fg-tertiary">{unit}</span>}
      </div>
      {series === undefined ? null : (
        <Sparkline className="mt-2" values={series} status={status} height={22} />
      )}
      {hint === undefined ? null : (
        <div className="mt-1.5 text-2xs text-fg-tertiary truncate">{hint}</div>
      )}
    </div>
  );
}

/** A row of metrics, hairline-separated. The dashboard's top band. */
export function MetricRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid divide-y divide-(--gc-border-hairline) sm:grid-cols-2 sm:divide-y-0 sm:divide-x lg:grid-cols-4",
        "[&>*]:px-4 [&>*]:py-3.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Countdown for lease expiry, which is the single most important number in
 * GControl: it is how long the current entitlement picture is guaranteed for.
 * Rendered as a duration rather than a timestamp because "23h 41m" is what
 * someone actually needs to know.
 */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0s";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${String(secs).padStart(2, "0")}s`;
  return `${secs}s`;
}

/** Relative time, for "last seen" style columns. */
export function formatAgo(from: Date, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
