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
 * draws it: squeezed below 820px the labels would stack into each other. It
 * opens at now, the end somebody looks at first.
 *
 * **Events too close to tell apart are one marker.** A first pass that raises
 * twenty findings in a minute would put twenty markers on one spot and bury
 * every label under the next. They are drawn as a group instead: the marker of
 * its most severe event, that event's label with the count of the rest, and
 * every one of them in its title. A bar too narrow to hold a word is a sliver,
 * so a stretch of a minute does not swell into a pill over the next.
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
  /** After a group's label, the events it also holds: "and 16 more". Unset, "+16". */
  more?: (count: number) => string;
  /** Over the stretch before `watchedFrom`, and to a screen reader: "Not watched before 20:05". */
  unwatched?: string;
}

export interface SwimlaneTimelineProps {
  start: string;
  end: string;
  now: string;
  /**
   * When watching began, if after `start`: before it there is no data, which is not the same as
   * nothing wrong, so the stretch is hatched faintly rather than left blank.
   */
  watchedFrom?: string;
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
/** Events within this many per cent of a group's first are drawn in it: apart they would touch. */
export const GROUP_WITHIN = 1.5;
/** A bar narrower than this, in per cent, cannot hold its padding and a word: it is a sliver. */
export const SLIVER_BELOW = 4;

/** Which event speaks for a group: the most severe, and of those the first. */
const SEVERITY: Readonly<Record<SwimlaneLevel, number>> = {
  crit: 5,
  warn: 4,
  accent: 3,
  info: 2,
  ok: 1,
  idle: 0,
};

/** Where an instant falls between start and end, 0 to 1, clamped. */
export function timelineFraction(at: string, start: string, end: string): number {
  const from = Date.parse(start);
  const span = Date.parse(end) - from;
  if (!(span > 0)) return 0;
  return Math.min(1, Math.max(0, (Date.parse(at) - from) / span));
}

export interface EventGroup<E extends Pick<SwimlaneEvent, "key" | "at" | "level"> = SwimlaneEvent> {
  /** The leading event's key, so a group of one keeps its event's. */
  key: string;
  /** The event drawn and labelled for the group. */
  lead: E;
  /** All of them, in time order, the lead among them. */
  events: E[];
}

/**
 * Events in time order, each joined to the group before it when it falls within GROUP_WITHIN of
 * that group's first event. Measured from the first, so a long run of close events still breaks
 * into groups no wider than that, rather than chaining across the strip.
 */
export function groupEvents<E extends Pick<SwimlaneEvent, "key" | "at" | "level">>(
  events: readonly E[],
  start: string,
  end: string,
): EventGroup<E>[] {
  const ordered = [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const groups: (EventGroup<E> & { x: number })[] = [];
  for (const event of ordered) {
    const x = timelineFraction(event.at, start, end) * 100;
    const last = groups.at(-1);
    if (last !== undefined && x - last.x <= GROUP_WITHIN) {
      last.events.push(event);
      if (SEVERITY[event.level] > SEVERITY[last.lead.level]) {
        last.lead = event;
        last.key = event.key;
      }
    } else {
      groups.push({ key: event.key, lead: event, events: [event], x });
    }
  }
  return groups.map(({ key, lead, events: held }) => ({ key, lead, events: held }));
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
/* Before watching began: finer and the other way, so it does not read as what comes next. */
const UNWATCHED =
  "absolute inset-y-0 left-0 rounded-[6px] bg-[repeating-linear-gradient(45deg,var(--gm-hover)_0_4px,transparent_4px_10px)]";
/** Below this share of the strip the stretch keeps its hatch but has no room for its words. */
const UNWATCHED_WORDS_FROM = 0.12;

const percent = (fraction: number) => `${(fraction * 100).toFixed(2)}%`;

/**
 * The stretch of the axis the now pill covers, in per cent, for a pill `width` wide at `x`: it
 * turns inward at either end, as it is drawn.
 */
export function nowPill(x: number, width: number): [number, number] {
  if (x > 92) return [x - width, x];
  if (x < 8) return [x, x + width];
  return [x - width / 2, x + width / 2];
}

export function SwimlaneTimeline({
  start,
  end,
  now,
  watchedFrom,
  events,
  lanes,
  ticks,
  labels,
  className,
}: SwimlaneTimelineProps) {
  const at = (instant: string) => timelineFraction(instant, start, end);
  const nowAt = at(now);
  const watchedAt = watchedFrom === undefined ? 0 : at(watchedFrom);
  const unwatched =
    watchedAt > 0 ? <div className={UNWATCHED} style={{ width: percent(watchedAt) }} /> : null;
  const more = labels.more ?? ((count: number) => `+${count}`);
  // A group stands where its first event happened and speaks with its lead's words.
  const groups = groupEvents(events, start, end).map((group) => ({
    ...group,
    at: group.events[0]?.at ?? group.lead.at,
    label:
      group.events.length > 1
        ? `${group.lead.label} ${more(group.events.length - 1)}`
        : group.lead.label,
  }));
  const placed = new Map(
    placeEvents(
      groups.map((group) => ({
        key: group.key,
        at: group.at,
        time: group.lead.time,
        label: group.label,
      })),
      start,
      end,
    ).map((p) => [p.key, p]),
  );
  const future = <div className={FUTURE} style={{ left: percent(nowAt) }} />;
  // A tick under the now pill would show only its first digit beside it: it goes.
  const pill = nowPill(nowAt * 100, labels.now.length * PER_CHARACTER + MARKER);
  const shown = ticks.filter((tick) => {
    const x = at(tick.at) * 100;
    const half = (tick.label.length * PER_CHARACTER) / 2;
    return x + half < pill[0] || x - half > pill[1];
  });
  return (
    <div className={cn("flex flex-col", className)}>
      {/*
       * Reversed, so a strip wider than its pane opens scrolled to its end: now and the latest
       * stretches are in view, and the past is a swipe back. No script measures anything.
       */}
      <div className="flex flex-row-reverse overflow-x-auto">
        <div
          aria-hidden="true"
          className="relative grid min-w-[820px] flex-1 grid-cols-[110px_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5"
        >
          <span className="text-[13px] leading-[18px] text-m-ink-2">{labels.events}</span>
          <div className="relative" style={{ height: EVENT_ROWS * 24 + 2 }}>
            {unwatched}
            {watchedAt >= UNWATCHED_WORDS_FROM && labels.unwatched !== undefined ? (
              <span
                className="absolute inset-y-0 left-0 flex items-center justify-center text-[12.5px] leading-[18px] text-m-ink-3"
                style={{ width: percent(watchedAt) }}
              >
                {labels.unwatched}
              </span>
            ) : null}
            {nowAt < 1 ? future : null}
            {groups.map((group) => {
              const p = placed.get(group.key);
              if (p === undefined) return null;
              const event = group.lead;
              // A group's title names every event it holds; a lone marker's names its own.
              const title =
                group.events.length > 1
                  ? group.events.map((held) => `${held.time} ${held.label}`).join("\n")
                  : p.labelled
                    ? undefined
                    : `${event.time} ${event.label}`;
              return (
                <div
                  key={group.key}
                  {...(title === undefined ? {} : { title })}
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
                      <span>{group.label}</span>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
          {lanes.map((lane) => (
            <Lane
              key={lane.key}
              lane={lane}
              at={at}
              past={unwatched}
              future={nowAt < 1 ? future : null}
            />
          ))}
          <span />
          <div className="relative h-[22px] font-mono text-[11.5px] leading-[22px] text-m-ink-3">
            {shown.map((tick) => (
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
        {watchedAt > 0 && labels.unwatched !== undefined ? <p>{labels.unwatched}</p> : null}
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
  past,
  future,
}: {
  lane: SwimlaneLane;
  at: (instant: string) => number;
  past: ReactNode;
  future: ReactNode;
}) {
  return (
    <>
      <span className="text-[13px] leading-[18px] text-m-ink-2">{lane.label}</span>
      <div className="relative h-[26px]">
        {past}
        {future}
        {lane.bars.map((bar) => {
          const from = at(bar.from);
          const width = Math.max(0, at(bar.to) - from);
          const sliver = width * 100 < SLIVER_BELOW;
          return (
            <div
              key={bar.key}
              title={bar.label}
              className={cn(
                "absolute top-0 box-border flex h-[26px] items-center overflow-hidden rounded-full border text-[12.5px] font-medium leading-none whitespace-nowrap text-m-ink",
                sliver ? "px-0" : "px-2.5",
                bar.planned === true ? PLANNED : BAR[bar.level],
              )}
              style={{
                left: percent(from),
                width: sliver
                  ? `max(4px, calc(${percent(width)} - 3px))`
                  : `calc(${percent(width)} - 3px)`,
              }}
            >
              {sliver ? null : <span className="truncate">{bar.label}</span>}
            </div>
          );
        })}
      </div>
    </>
  );
}
