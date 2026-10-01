import { Activity } from "lucide-react";
import type { ReactNode } from "react";
import { Metric } from "./metric.js";
import { EmptyState } from "./panel.js";
import { Badge, StatusDot, type Status } from "./status.js";

/**
 * One declared health value, joined to what was actually reported.
 *
 * Declared here rather than imported from the protocol package, because this is
 * the design system and it does not depend on the wire. The two unions below are
 * the manifest's own, restated: a renderer that imported the protocol to learn
 * the word "gauge" would make the design system a dependant of the contract, and
 * the contract is not what decides how a tile looks.
 *
 * Both surfaces derive these from a manifest and a run of samples, and both draw
 * them with this. Sharing the drawing is the point: the derivation is a few
 * lines either side, and two copies of the *rendering* is how one of them
 * quietly starts colouring a critical value like a warning.
 */
export interface HealthReading {
  key: string;
  label: string;
  type: "gauge" | "counter" | "state";
  display: "number" | "chart" | "badge";
  unit: string | null;
  description: string | null;
  /** Null when the app has not reported this key yet. */
  value: string | number | null;
  severity: "ok" | "warn" | "crit" | "idle";
  /** Oldest to newest, for the sparkline. Empty for state values. */
  series: number[];
}

/**
 * Health, rendered from what the app declared.
 *
 * Nothing here knows what any of these values mean. The manifest says a key
 * exists, what to call it, how to draw it and where its thresholds are, and this
 * draws exactly that. An app adding a metric costs no GControl release, which is
 * the whole point of the manifest being a UI contract.
 *
 * A declared value the app has stopped reporting still gets a tile, marked as
 * not reported. A metric that vanishes from a dashboard the moment it breaks is
 * the least useful thing a dashboard can do.
 */

const severityStatus: Record<HealthReading["severity"], Status> = {
  ok: "ok",
  warn: "warn",
  crit: "crit",
  idle: "idle",
};

export function HealthPanel({
  readings,
  emptyTitle,
  emptyDescription,
  notReported,
  declaredAbsent,
}: {
  readings: readonly HealthReading[];
  /**
   * Every word this panel says.
   *
   * Props rather than literals: every user-visible string in this product goes
   * through next-intl and a design-system component has no locale of its own.
   * The caller has one and this does not.
   *
   * That paragraph was already here and covered two of the four. The other two
   * were JSX text inside `Reading`, and `emptyTitle` and `emptyDescription`
   * were OPTIONAL with English defaults, which is the same as holding the copy:
   * a caller that passes neither renders this package's English. Required now,
   * so a new consumer cannot inherit a language by accident.
   */
  emptyTitle: ReactNode;
  emptyDescription: ReactNode;
  /** What one reading says when the app declared it and never sent it. */
  notReported: ReactNode;
  declaredAbsent: ReactNode;
}) {
  if (readings.length === 0) {
    return <EmptyState icon={<Activity />} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="grid gap-x-6 gap-y-5 p-4 sm:grid-cols-2 lg:grid-cols-3">
      {readings.map((reading) => (
        <Reading
          key={reading.key}
          reading={reading}
          notReported={notReported}
          declaredAbsent={declaredAbsent}
        />
      ))}
    </div>
  );
}

function Reading({
  reading,
  notReported,
  declaredAbsent,
}: {
  reading: HealthReading;
  notReported: ReactNode;
  declaredAbsent: ReactNode;
}) {
  const status = severityStatus[reading.severity];

  if (reading.value === null) {
    return (
      <div className="min-w-0">
        <div className="truncate text-2xs uppercase tracking-[0.08em] text-fg-tertiary">
          {reading.label}
        </div>
        <div className="mt-1 text-sm text-fg-tertiary">{notReported}</div>
        <div className="mt-1.5 text-2xs text-fg-tertiary">{declaredAbsent}</div>
      </div>
    );
  }

  if (reading.display === "badge" || reading.type === "state") {
    return (
      <div className="min-w-0">
        <div className="truncate text-2xs uppercase tracking-[0.08em] text-fg-tertiary">
          {reading.label}
        </div>
        <div className="mt-1.5">
          <Badge status={status === "idle" ? "idle" : status} size="md">
            {String(reading.value)}
          </Badge>
        </div>
        {reading.description === null ? null : (
          <div className="mt-1.5 truncate text-2xs text-fg-tertiary">{reading.description}</div>
        )}
      </div>
    );
  }

  if (reading.display === "number") {
    return (
      <div className="min-w-0">
        <div className="truncate text-2xs uppercase tracking-[0.08em] text-fg-tertiary">
          {reading.label}
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <StatusDot status={status} />
          <span className="numeric text-lg leading-none text-fg">{String(reading.value)}</span>
          {reading.unit === null ? null : (
            <span className="text-xs text-fg-tertiary">{reading.unit}</span>
          )}
        </div>
        {reading.description === null ? null : (
          <div className="mt-1.5 truncate text-2xs text-fg-tertiary">{reading.description}</div>
        )}
      </div>
    );
  }

  // `chart`: the same number with its history under it.
  return (
    <Metric
      label={reading.label}
      value={String(reading.value)}
      status={status}
      {...(reading.unit === null ? {} : { unit: reading.unit })}
      {...(reading.description === null ? {} : { hint: reading.description })}
      // A number without a trend is half a story, but two points are not a
      // trend either: below that the tile is just the number.
      {...(reading.series.length < 2 ? {} : { series: reading.series })}
    />
  );
}
