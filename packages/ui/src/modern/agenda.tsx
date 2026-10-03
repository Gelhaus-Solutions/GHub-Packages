import type { ReactNode } from "react";
import { cn } from "../cn.js";

/** One dated row: a day block beside what happens then. */
export interface AgendaItem {
  /** The full instant, ISO 8601 with its offset, for the `time` element. */
  at: string;
  /** Weekday and date, already worded: "Thu 8 Oct". */
  day: ReactNode;
  /** The clock time with its zone: "00:00 CEST". Set in mono. */
  time: ReactNode;
  /** How far away: "in 5 days". Outside the `time` element, because it is not the instant. */
  distance?: ReactNode;
  /**
   * What happens: a Status word first, then every version and campaign it
   * names as a link. The caller's own markup, laid out in a column.
   */
  children: ReactNode;
}

export interface AgendaProps {
  items: readonly AgendaItem[];
  /** Names the list: "Coming up". */
  label: string;
  /** Said instead of an empty list: "Nothing is announced or comes into force before 2 Dec 2026." */
  empty: ReactNode;
  className?: string;
}

/**
 * A dated list of what is coming: each row a day block (weekday and date, the
 * time with its zone, how far away) beside what happens, on its own plate.
 * Drawn for the GPlatform Terms staff console's home and product pages.
 *
 * **An ordered list, because the order is the dates.** `role="list"` restates
 * what `ol` already is, for the reason `ReorderList` gives: Safari drops list
 * semantics under `list-style: none`, and "2 of 5" is worth hearing here.
 *
 * **The date is a `time` element carrying the full instant**, so the day block
 * can say "Thu 8 Oct" for the eye while the instant it stands for stays in the
 * markup for anything that reads it.
 *
 * No keyboard of its own: the links in a row are the only stops in it. An
 * empty agenda is a sentence saying so, in quiet ink, never an empty list.
 */
export function Agenda({ items, label, empty, className }: AgendaProps) {
  if (items.length === 0) {
    return <p className={cn("text-m-body text-m-ink-3", className)}>{empty}</p>;
  }

  return (
    <ol role="list" aria-label={label} className={cn("flex flex-col gap-2", className)}>
      {items.map((item, index) => (
        <li
          key={`${item.at}:${String(index)}`}
          className="grid grid-cols-[104px_minmax(0,1fr)] gap-4 rounded-m-panel bg-m-plate px-[18px] py-4 shadow-m-plate"
        >
          <div>
            <time dateTime={item.at} className="block">
              <span className="block text-m-body font-semibold text-m-ink">{item.day}</span>
              <span className="block font-mono text-m-meta text-m-ink-2 tabular-nums">
                {item.time}
              </span>
            </time>
            {item.distance === undefined ? null : (
              <p className="text-m-meta text-m-ink-3">{item.distance}</p>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-2">{item.children}</div>
        </li>
      ))}
    </ol>
  );
}
