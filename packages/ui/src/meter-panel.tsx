import { Gauge } from "lucide-react";
import type { ReactNode } from "react";
import { Metric } from "./metric.js";
import { EmptyState } from "./panel.js";

/**
 * One declared meter, folded across every deployment of its app.
 *
 * Declared here rather than imported from the protocol package, for the reason
 * `HealthReading` is: this is the design system and it does not depend on the
 * wire. Both surfaces fold their own buckets into this and both draw it with
 * the component below, because the folding is a few lines either side and the
 * drawing is where two copies would quietly disagree about what a peak means.
 */
export interface MeterReadout {
  key: string;
  label: string;
  unit: string;
  aggregation: "sum" | "max";
  description: string | null;
  /** Today so far, folded across deployments. */
  today: number;
  /** The whole window: added up for a `sum` meter, the peak for a `max` one. */
  period: number;
  /** Oldest day first, one entry per day in the window including empty ones. */
  series: number[];
  days: number;
  /** Readings behind the window, so a thin period is visible as thin. */
  samples: number;
  /** When the last reading landed, or null if nothing has been reported. */
  lastAt: Date | null;
}

/** Coarse and deliberately so: this sits under a number, not beside a clock. */
function relative(timestamp: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

/**
 * Usage, rendered from what the app declared.
 *
 * Nothing here knows what any of these count. The manifest says a meter exists,
 * what to call it, what unit it is in and how it folds, and this draws that. An
 * app adding a meter costs no GControl release.
 *
 * It is on the customer's screen before it is on anybody else's, which is the
 * point of the panel rather than a nicety: these are the numbers the platform
 * is told about, so the customer being able to read them first is what makes
 * them checkable. The line at the bottom says so out loud.
 *
 * A declared meter with nothing reported still gets a tile. "We are not being
 * counted" is a thing worth being able to see.
 */
/** The words a meter panel says, supplied by whichever console renders it. */
export interface MeterCopy {
  footnote: ReactNode;
  nothingReported: ReactNode;
  today: ReactNode;
  last: ReactNode;
  periodLabel: (span: { days: number; aggregation: MeterReadout["aggregation"] }) => ReactNode;
}

export function MeterPanel({
  meters,
  emptyTitle,
  emptyDescription,
  copy,
}: {
  meters: readonly MeterReadout[];
  /**
   * Every word this panel says.
   *
   * Props rather than literals: every user-visible string in this product goes
   * through next-intl and a design-system component has no locale of its own.
   * The caller has one and this does not.
   *
   * The two empty-state props were OPTIONAL with English defaults, which is the
   * same as holding the copy. Required now, with the five below that were JSX
   * text and a template nobody had noticed.
   */
  emptyTitle: ReactNode;
  emptyDescription: ReactNode;
  /**
   * `periodLabel` takes the numbers because the sentence is about them: a `sum`
   * meter reports a total and a `max` meter reports the highest day, and saying
   * which is half the number's meaning.
   */
  copy: MeterCopy;
}) {
  if (meters.length === 0) {
    return <EmptyState icon={<Gauge />} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div>
      <div className="grid gap-x-6 gap-y-5 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {meters.map((meter) => (
          <Readout key={meter.key} meter={meter} copy={copy} />
        ))}
      </div>
      <p className="border-t border-hairline px-4 py-3 text-2xs text-fg-tertiary">
        {copy.footnote}
      </p>
    </div>
  );
}

function Readout({ meter, copy }: { meter: MeterReadout; copy: MeterCopy }) {
  // What the period means depends on how the meter folds, and saying which is
  // half the number's meaning. A month of peaks added together would describe
  // nothing, so a `max` meter reports the highest day rather than a total.
  const periodLabel = copy.periodLabel({ days: meter.days, aggregation: meter.aggregation });

  return (
    <div className="min-w-0">
      <Metric
        label={meter.label}
        value={format(meter.today)}
        unit={meter.unit}
        status="idle"
        // Two points are not a trend, and a flat line of zeroes is worse than
        // no line: it reads as reported zero rather than never reported.
        {...(meter.samples === 0 ? {} : { series: meter.series })}
      />
      <div className="mt-1.5 text-2xs text-fg-tertiary">
        {meter.samples === 0 ? (
          <span>{copy.nothingReported}</span>
        ) : (
          <>
            {copy.today} {periodLabel} {format(meter.period)} {meter.unit}
            {meter.lastAt === null ? null : (
              <>
                {" "}
                {copy.last} {relative(meter.lastAt.getTime())}
              </>
            )}
          </>
        )}
      </div>
      {meter.description === null ? null : (
        <div className="mt-1 text-2xs text-fg-tertiary">{meter.description}</div>
      )}
    </div>
  );
}

/**
 * Whole numbers stay whole and fractions keep three places.
 *
 * A meter may count documents or gigabyte-hours, and the same formatter has to
 * do both without turning 4 into 4.000 or 0.25 into 0.
 */
function format(value: number): string {
  if (Number.isInteger(value)) return value.toLocaleString("en-GB");
  return value.toLocaleString("en-GB", { maximumFractionDigits: 3 });
}
