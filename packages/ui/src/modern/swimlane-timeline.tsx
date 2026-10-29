import type { ReactNode } from "react";
import { cn } from "../cn.js";

/**
 * How something got to where it is and what comes next, over one range of
 * time: a row of labelled events, one lane per concern whose bars are the
 * state it was in, a line at now, and hatched bars past it for what approved
 * changes will do. GLockdown's overview timeline, in modern's tokens, drawn
 * first for GFabric's overview (D14).
 *
 * **Placed by time, worded by the caller.** Every event, bar and tick carries
 * its instant, and the component only turns instants into positions. What a
 * bar says, how a time reads and in which zone are the caller's, because they
 * are the app's messages and the app's clock, and a component that formatted
 * dates would format them in one language.
 *
 * **The drawing is hidden from a screen reader and a list says the same.** A
 * lane of bars is a picture of intervals; read in DOM order it is a run of
 * labels with no times. So the visual is `aria-hidden` and the same events and
 * stretches follow as lists, each entry with its time in words.
 *
 * On a phone the strip keeps its width and scrolls sideways, as the canvas
 * draws it: squeezed below 820px the labels would stack into each other.
 */

export type SwimlaneLevel = "ok" | "warn" | "crit" | "info" | "idle" | "accent";

export interface SwimlaneEvent {
  key: string;
  /** ISO instant; places the marker. */
  at: string;
  /** The time as the caller shows it, beside the label: "02:04". */
  time: string;
  level: SwimlaneLevel;
  /** A string, so its width can be judged when the events are set on rows. */
  label: string;
}

export interface SwimlaneBar {
  key: string;
  from: string;
  to: string;
  level: SwimlaneLevel;
  /** A string, because it is cut with an ellipsis and repeated as the bar's title. */
  label: string;
  /** The stretch in words for the list a screen reader reads: "02:04 to 02:41". */
  span: string;
  /** What an approved change will do: hatched, in the accent. Lies after now. */
  planned?: boolean;
}

export interface SwimlaneLane {
  key: string;
  label: ReactNode;
  bars: readonly SwimlaneBar[];
}

export interface SwimlaneTick {
  at: string;
  label: string;
}

export interface SwimlaneLabels {
  /** The event row's name in the first column: "Events". */
  events: ReactNode;
  /** The pill on the axis at now: "now 04:35". */
  now: string;
  /** The accessible names of the two lists that stand in for the drawing. */
  eventList: string;
  laneList: string;
}

export interface SwimlaneTimelineProps {
  start: string;
  end: string;
  now: string;
  events: readonly SwimlaneEvent[];
  lanes: readonly SwimlaneLane[];
  ticks: readonly SwimlaneTick[];
  labels: SwimlaneLabels;
  className?: string;
}

/** Rows on the event row; a fifth event that collides takes the freest of them. */
export const EVENT_ROWS = 4;
/**
 * How much of the strip a label takes, in per cent of the narrowest strip (820px less the lane
 * column): 13px Geist runs about 7px a character, and the marker and the gaps take 3 per cent.
 */
const PER_CHARACTER = 1;
const MARKER = 3;
/** Past this a label runs to the left of its marker, so it does not leave the strip. */
const FLIP_AT = 55;
/** The first column and the gap after it, in px: where the strip starts. */
const LANE_COLUMN = 110;
const COLUMN_GAP = 12;

/** Where an instant falls between start and end, 0 to 1, clamped. */
export function timelineFraction(at: string, start: string, end: string): number {
  const from = Date.parse(start);
  const span = Date.parse(end) - from;
  if (!(span > 0)) return 0;
  return Math.min(1, Math.max(0, (Date.parse(at) - from) / span));
}

export interface PlacedEvent {
  key: string;
  /** Per cent of the strip. */
  x: number;
  row: number;
  /** Which way the label runs from its marker. */
  side: "right" | "left";
  /**
   * False when no row had room: the marker stands alone, with its time and label as its title,
   * and the list a screen reader gets still says it in full.
   */
  labelled: boolean;
}

/**
 * Each event on the first row its label does not collide on, in time order.
 * When every row is taken it goes where it overlaps least, so a dense range
 * still shows every marker even if two labels touch.
 */
export function placeEvents(
  events: readonly Pick<SwimlaneEvent, "key" | "at" | "time" | "label">[],
  start: string,
  end: string,
): PlacedEvent[] {
  const ordered = [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const taken: [number, number][][] = Array.from({ length: EVENT_ROWS }, () => []);
  return ordered.map((event) => {
    const x = timelineFraction(event.at, start, end) * 100;
    const side = x > FLIP_AT ? "left" : "right";
    const width = MARKER + (event.time.length + 1 + event.label.length) * PER_CHARACTER;
    const span: [number, number] = side === "right" ? [x, x + width] : [x - width, x];
    const overlap = (row: [number, number][]) =>
      row.reduce(
        (sum, [a, b]) => sum + Math.max(0, Math.min(b, span[1]) - Math.max(a, span[0])),
        0,
      );
    let row = taken.findIndex((placed) => overlap(placed) === 0);
    const labelled = row !== -1;
    if (row === -1) {
      row = taken.reduce(
        (best, placed, i) => (overlap(placed) < overlap(taken[best] ?? []) ? i : best),
        0,
      );
    }
    // A marker without its label takes only its own width.
    taken[row]?.push(labelled ? span : [x - MARKER / 2, x + MARKER / 2]);
    return { key: event.key, x, row, side, labelled };
  });
}

/* The marker is a graphic and owes 3:1; crit is filled so it reads without its hue. */
const DOT: Readonly<Record<SwimlaneLevel, string>> = {
  ok: "text-m-ok",
  warn: "text-m-warn",
  crit: "text-m-crit bg-current",
  info: "text-m-info",
  idle: "text-m-idle",
  accent: "text-m-accent",
};

/*
 * A bar is its level at a quarter over the glass with an edge at a half, crit
 * a step stronger. Written out in full, because Tailwind finds a class by
 * reading the source and never sees one assembled at run time.
 */
const BAR: Readonly<Record<SwimlaneLevel, string>> = {
  ok: "bg-[color-mix(in_oklch,var(--gm-ok)_26%,transparent)] border-[color-mix(in_oklch,var(--gm-ok)_55%,transparent)]",
  warn: "bg-[color-mix(in_oklch,var(--gm-warn)_26%,transparent)] border-[color-mix(in_oklch,var(--gm-warn)_55%,transparent)]",
  crit: "bg-[color-mix(in_oklch,var(--gm-crit)_30%,transparent)] border-[color-mix(in_oklch,var(--gm-crit)_60%,transparent)]",
  info: "bg-[color-mix(in_oklch,var(--gm-info)_26%,transparent)] border-[color-mix(in_oklch,var(--gm-info)_55%,transparent)]",
  accent:
    "bg-[color-mix(in_oklch,var(--gm-accent)_26%,transparent)] border-[color-mix(in_oklch,var(--gm-accent)_55%,transparent)]",
  idle: "bg-m-hover border-m-hairline text-m-ink-2",
};

const PLANNED =
  "border-dashed border-m-accent bg-[repeating-linear-gradient(135deg,color-mix(in_oklch,var(--gm-accent)_26%,transparent)_0_6px,transparent_6px_12px)]";
const FUTURE =
  "absolute inset-y-0 right-0 rounded-[6px] bg-[repeating-linear-gradient(135deg,var(--gm-hover)_0_6px,transparent_6px_12px)]";

const percent = (fraction: number) => `${(fraction * 100).toFixed(2)}%`;

export function SwimlaneTimeline({
  start,
  end,
  now,
  events,
  lanes,
  ticks,
  labels,
  className,
}: SwimlaneTimelineProps) {
  const at = (instant: string) => timelineFraction(instant, start, end);
  const nowAt = at(now);
  const placed = new Map(placeEvents(events, start, end).map((p) => [p.key, p]));
  const future = <div className={FUTURE} style={{ left: percent(nowAt) }} />;
  return (
    <div className={cn("flex flex-col", className)}>
      <div className="overflow-x-auto">
        <div
          aria-hidden="true"
          className="relative grid min-w-[820px] grid-cols-[110px_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5"
        >
          <span className="text-[13px] leading-[18px] text-m-ink-2">{labels.events}</span>
          <div className="relative" style={{ height: EVENT_ROWS * 24 + 2 }}>
            {nowAt < 1 ? future : null}
            {events.map((event) => {
              const p = placed.get(event.key);
              if (p === undefined) return null;
              return (
                <div
                  key={event.key}
                  {...(p.labelled ? {} : { title: `${event.time} ${event.label}` })}
                  className={cn(
                    "absolute flex items-center gap-1.5 whitespace-nowrap text-[13px] leading-[18px] text-m-ink",
                    p.side === "left" ? "flex-row-reverse" : "",
                  )}
                  style={{
                    top: p.row * 24,
                    ...(p.side === "left"
                      ? { right: `${(100 - p.x).toFixed(2)}%` }
                      : { left: `${p.x.toFixed(2)}%` }),
                  }}
                >
                  <span
                    className={cn(
                      "box-border size-2.5 flex-none rounded-full border-2 border-current",
                      DOT[event.level],
                    )}
                  />
                  {p.labelled ? (
                    <>
                      <span className="font-mono text-[12px] text-m-ink-3">{event.time}</span>
                      <span>{event.label}</span>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
          {lanes.map((lane) => (
            <Lane key={lane.key} lane={lane} at={at} future={nowAt < 1 ? future : null} />
          ))}
          <span />
          <div className="relative h-[22px] font-mono text-[11.5px] leading-[22px] text-m-ink-3">
            {ticks.map((tick) => (
              <span
                key={tick.at}
                className="absolute top-0 -translate-x-1/2 whitespace-nowrap"
                style={{ left: percent(at(tick.at)) }}
              >
                {tick.label}
              </span>
            ))}
            <span
              className={cn(
                "absolute top-0 whitespace-nowrap rounded-full bg-m-ink px-2 font-medium text-m-ground",
                // At either end the pill turns inward rather than leaving the strip.
                nowAt > 0.92 ? "-translate-x-full" : nowAt < 0.08 ? "" : "-translate-x-1/2",
              )}
              style={{ left: percent(nowAt) }}
            >
              {labels.now}
            </span>
          </div>
          <div
            className="pointer-events-none absolute top-0 bottom-[22px] -ml-px w-0.5 rounded-[1px] bg-m-ink"
            style={{
              left: `calc(${LANE_COLUMN + COLUMN_GAP}px + (100% - ${LANE_COLUMN + COLUMN_GAP}px) * ${nowAt.toFixed(4)})`,
            }}
          />
        </div>
      </div>
      <div className="sr-only">
        <ol aria-label={labels.eventList}>
          {events.map((event) => (
            <li key={event.key}>
              {event.time}: {event.label}
            </li>
          ))}
        </ol>
        <ul aria-label={labels.laneList}>
          {lanes.map((lane) => (
            <li key={lane.key}>
              {lane.label}
              <ul>
                {lane.bars.map((bar) => (
                  <li key={bar.key}>
                    {bar.span}: {bar.label}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Lane({
  lane,
  at,
  future,
}: {
  lane: SwimlaneLane;
  at: (instant: string) => number;
  future: ReactNode;
}) {
  return (
    <>
      <span className="text-[13px] leading-[18px] text-m-ink-2">{lane.label}</span>
      <div className="relative h-[26px]">
        {future}
        {lane.bars.map((bar) => {
          const from = at(bar.from);
          const width = Math.max(0, at(bar.to) - from);
          return (
            <div
              key={bar.key}
              title={bar.label}
              className={cn(
                "absolute top-0 box-border flex h-[26px] items-center overflow-hidden rounded-full border px-2.5 text-[12.5px] font-medium leading-none whitespace-nowrap text-m-ink",
                bar.planned === true ? PLANNED : BAR[bar.level],
              )}
              style={{ left: percent(from), width: `calc(${percent(width)} - 3px)` }}
            >
              <span className="truncate">{bar.label}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
