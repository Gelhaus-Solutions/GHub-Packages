import type { ReactNode } from "react";
import { cn } from "../cn.js";
import { Badge, type BadgeTone } from "./badge.js";
import { DEFAULT_ZONE } from "./zoned-time.js";

/**
 * A record of what happened, row by row, that nobody can change.
 *
 * An audit log, a person's activity, the history of a group. Each row is the
 * time to the second (in mono, the day under it), a dot in the level's colour,
 * what happened, who did it, the reason they gave in quotes where there was
 * one, and a chip naming the kind of event. It is a list rather than a table:
 * the rows are read top to bottom, not compared across columns.
 *
 * **The level is never colour alone.** The dot is `aria-hidden`; the kind chip
 * carries the same level in words and tint, so a monochrome screen and a
 * screen reader both get it.
 *
 * **The footer says what the log is.** "12 of 1,284 events, newest first. None
 * can be changed or removed." The second sentence is the property that makes
 * it a record, so it is stated where the reader finishes rather than assumed.
 * Views, search and Export are the caller's (`SavedViews`, `ListFilters`, a
 * link), passed in as `toolbar`, because which views a log has is the app's.
 */
export type EventLevel = "ok" | "warn" | "crit" | "info" | "idle" | "accent";

export interface EventLogEntry {
  key: string;
  /** ISO 8601 with an offset or `Z`. */
  at: string;
  level?: EventLevel;
  what: ReactNode;
  who?: ReactNode;
  /** What they gave as the reason, shown in quotes. */
  reason?: string;
  /** The kind of event, as a chip: "Sign-in", "Rule changed". */
  kind?: ReactNode;
}

export interface EventLogLabels {
  /** "12 of 1,284 events, newest first. None can be changed or removed." */
  line: (shown: number, total: number) => string;
  /** The list's accessible name: "Audit log". */
  list: string;
  /** Said where there is nothing yet. */
  empty: ReactNode;
}

export interface EventLogProps {
  entries: readonly EventLogEntry[];
  /** All the events there are, of which `entries` is a page. Defaults to the entries shown. */
  total?: number;
  labels: EventLogLabels;
  /** IANA zone the times are read in. Europe/Berlin by default. */
  timeZone?: string;
  /** The row above the list: views, search, Export. */
  toolbar?: ReactNode;
  /** The pager, under the line. */
  footer?: ReactNode;
  /** Tighter rows and no reason line, for a log in an aside. */
  narrow?: boolean;
  className?: string;
}

const DOT: Readonly<Record<EventLevel, string>> = {
  ok: "bg-m-ok",
  warn: "bg-m-warn",
  crit: "bg-m-crit",
  info: "bg-m-info",
  idle: "bg-m-idle",
  accent: "bg-m-accent",
};

const CHIP: Readonly<Record<EventLevel, BadgeTone>> = {
  ok: "ok",
  warn: "warn",
  crit: "crit",
  info: "quiet",
  idle: "quiet",
  accent: "accent-wash",
};

function clock(at: string, timeZone: string): { time: string; day: string } {
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return { time: at, day: "" };
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(when);
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone }).format(
    when,
  );
  return { time, day };
}

export function EventLog({
  entries,
  total,
  labels,
  timeZone = DEFAULT_ZONE,
  toolbar,
  footer,
  narrow = false,
  className,
}: EventLogProps) {
  const all = total ?? entries.length;
  return (
    <div className={cn("flex flex-col", className)}>
      {toolbar === undefined ? null : (
        <div className="flex flex-wrap items-center gap-2 pb-3">{toolbar}</div>
      )}
      {entries.length === 0 ? (
        <p className="py-4 text-[13px] text-m-ink-3">{labels.empty}</p>
      ) : (
        <ol aria-label={labels.list} className="flex flex-col">
          {entries.map((entry) => {
            const { time, day } = clock(entry.at, timeZone);
            const level = entry.level ?? "idle";
            return (
              <li
                key={entry.key}
                className={cn(
                  "grid items-start gap-x-3 border-t border-m-hairline first:border-t-0",
                  narrow
                    ? "grid-cols-[72px_10px_minmax(0,1fr)] py-2.5"
                    : "grid-cols-[92px_10px_minmax(0,1fr)_auto] px-4 py-[11px]",
                )}
              >
                <time
                  dateTime={entry.at}
                  className="flex flex-col font-mono text-[12px] leading-[17px] tabular-nums text-m-ink-2"
                >
                  <span>{time}</span>
                  <span className="text-m-ink-3">{day}</span>
                </time>
                <span
                  aria-hidden="true"
                  className={cn("mt-[5px] size-2 rounded-full", DOT[level])}
                />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[14px] font-medium leading-[19px] text-m-ink">
                    {entry.what}
                  </span>
                  {entry.who === undefined ? null : (
                    <span className="text-[12.5px] leading-[18px] text-m-ink-3">{entry.who}</span>
                  )}
                  {entry.reason === undefined || narrow ? null : (
                    <q className="text-[13px] leading-[19px] text-m-ink-2">{entry.reason}</q>
                  )}
                  {narrow && entry.kind !== undefined ? (
                    <span className="mt-0.5">
                      <Badge tone={CHIP[level]}>{entry.kind}</Badge>
                    </span>
                  ) : null}
                </div>
                {narrow || entry.kind === undefined ? null : (
                  <Badge tone={CHIP[level]}>{entry.kind}</Badge>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <p className={cn("text-[12.5px] leading-[18px] text-m-ink-3", narrow ? "pt-2" : "px-4 pt-3")}>
        {labels.line(entries.length, all)}
      </p>
      {footer === undefined ? null : <div className="pt-3">{footer}</div>}
    </div>
  );
}
