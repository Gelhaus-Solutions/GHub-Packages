import type { ReactNode } from "react";
import { cn } from "../cn.js";
import { Status, type StatusLevel } from "./status.js";

/** One deadline: what is owed, on what basis, by when, and where it stands. */
export interface Clock {
  key: string;
  /** What is owed, by whom: "Gitroom Limited answers". */
  label: ReactNode;
  /** The law or clause and its period: "Contract: 5 working days from forwarding". */
  basis?: ReactNode;
  /**
   * The due date as the reader should see it, already in Europe/Berlin with
   * its zone where a time matters. Null until the clock starts, and then the
   * row says so rather than showing a date that does not exist yet.
   */
  due: ReactNode | null;
  /**
   * The state as a level and a word, decided on the server from now, the due
   * date and the working-day calendar, never in the browser from dates:
   * "Done 9 Oct" ok, "Due today" warn, "2 working days late" crit,
   * "70 h 35 min left" warn, "Due 2 Nov" info, "Starts when forwarded" idle.
   */
  level: StatusLevel;
  word: string;
}

export interface ClockLineProps {
  /** Ordered by date by the caller; a clock that is done stays, in ok. */
  clocks: readonly Clock[];
  /** Names the list. */
  label: string;
  /** Shown in the date column for a clock that has not started. */
  notStarted?: ReactNode;
  className?: string;
}

/**
 * Deadlines as words with a level (K6): one row per clock, the thing owed
 * first, then its basis, its date in mono and a status pill.
 *
 * **A list, not a table**, so each row reads as one sentence to a screen
 * reader, label first, and the word carries the state rather than the colour.
 * Inside a glass section the rows run to the pane's edges, ruled above.
 */
export function ClockLine({
  clocks,
  label,
  notStarted = "not started",
  className,
}: ClockLineProps) {
  return (
    <ul
      aria-label={label}
      data-m-flush=""
      className={cn("flex flex-col aurora:in-data-m-body:-mx-[18px]", className)}
    >
      {clocks.map((clock) => (
        <li
          key={clock.key}
          className={cn(
            "grid min-h-[50px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-t border-m-hairline px-[18px] py-2",
            "sm:grid-cols-[minmax(0,1fr)_auto_auto]",
          )}
        >
          <div className="min-w-0 max-sm:col-span-2">
            <p className="text-m-body text-m-ink">{clock.label}</p>
            {clock.basis === undefined ? null : (
              <p className="text-m-meta text-m-ink-3">{clock.basis}</p>
            )}
          </div>
          <span className="font-mono text-m-meta whitespace-nowrap text-m-ink-2 tabular-nums">
            {clock.due ?? notStarted}
          </span>
          <span className="flex justify-end">
            <Status level={clock.level} chip>
              {clock.word}
            </Status>
          </span>
        </li>
      ))}
    </ul>
  );
}
