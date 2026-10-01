import { cn } from "../cn.js";
import type { Status } from "../status.js";

/**
 * Hand-rolled SVG sparkline.
 *
 * ECharts is the right tool for a real timeseries panel, but a sparkline inside a
 * table cell or a metric tile must render server-side, cost nothing, and never
 * pull a chart runtime into a list of forty rows. So this one is SVG, and the
 * ECharts wrapper is reserved for the interactive panels.
 */
export interface SparklineProps {
  values: readonly number[];
  status?: Status;
  height?: number;
  className?: string;
  /** Draws a baseline at this value, for thresholds. */
  threshold?: number;
  "aria-label"?: string;
}

const strokeFor: Record<Status, string> = {
  ok: "var(--gc-ok)",
  warn: "var(--gc-warn)",
  crit: "var(--gc-crit)",
  info: "var(--gc-info)",
  locked: "var(--gc-locked)",
  idle: "var(--gc-accent)",
};

export function Sparkline({
  values,
  status = "idle",
  height = 28,
  threshold,
  className,
  ...props
}: SparklineProps) {
  if (values.length < 2) {
    return (
      <div className={cn("h-(--h)", className)} style={{ ["--h" as string]: `${height}px` }} />
    );
  }

  const width = 100;

  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const dataSpan = dataMax - dataMin || 1;

  /*
   * The threshold only joins the scale when it is near the data. A warn line five
   * times above a healthy series would otherwise flatten that series into a
   * straight line at the bottom of the box, which is the opposite of what a
   * sparkline is for: the healthy case still needs to show its shape.
   */
  const thresholdInScale =
    threshold !== undefined && threshold >= dataMin - dataSpan && threshold <= dataMax + dataSpan;

  const min = thresholdInScale ? Math.min(dataMin, threshold) : dataMin;
  const max = thresholdInScale ? Math.max(dataMax, threshold) : dataMax;
  // A flat series should sit in the middle rather than divide by zero.
  const span = max - min || 1;

  const x = (i: number) => (i / (values.length - 1)) * width;
  const y = (v: number) => height - ((v - min) / span) * (height - 2) - 1;

  const line = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(v).toFixed(2)}`)
    .join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const last = values[values.length - 1] ?? 0;

  const stroke = strokeFor[status];
  const gradientId = `spark-${status}-${values.length}-${Math.round(last * 100)}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("w-full block", className)}
      style={{ height }}
      role={props["aria-label"] === undefined ? "presentation" : "img"}
      aria-label={props["aria-label"]}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>

      {!thresholdInScale || threshold === undefined ? null : (
        <line
          x1="0"
          x2={width}
          y1={y(threshold)}
          y2={y(threshold)}
          stroke="var(--gc-chart-grid)"
          strokeWidth="1"
          strokeDasharray="2 2"
          vectorEffect="non-scaling-stroke"
        />
      )}

      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* The current value gets a dot: it is the one point anyone reads. */}
      <circle cx={width} cy={y(last)} r="1.6" fill={stroke} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
