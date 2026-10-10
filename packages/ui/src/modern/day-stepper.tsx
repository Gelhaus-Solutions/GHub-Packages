"use client";

import { clsx } from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { cn } from "../cn.js";
import { AURORA_GLASS } from "./aurora.js";
import { buttonClasses } from "./button-classes.js";
import { Input } from "./input.js";
import { addDays, formatDate, parseDate } from "./zoned-time.js";

export interface DayStepperProps {
  /** The day shown, `YYYY-MM-DD`: the page's `?day=`. */
  day: string;
  /**
   * Once per commit, with a `YYYY-MM-DD` that differs from `day`. The caller
   * writes `?day=` with replace; this touches no history of its own.
   */
  onCommit: (day: string) => void;
  /**
   * The caller's words. `before` and `after` name the two arrows ("The day
   * before", "The day after"); `field` names the date field ("Day, as year,
   * month and day"); `day`, when given, is the visible word before the
   * controls ("Day"), and the field's name should start with it.
   */
  labels: {
    before: string;
    after: string;
    today: string;
    next: string;
    field: string;
    day?: string;
  };
  /** Today, `YYYY-MM-DD`, in the zone the page counts days in. */
  today: string;
  /**
   * The next date with changes. Null when there is none, which keeps the
   * button in place and inert; left out, the button is not drawn.
   */
  next?: string | null;
  /** The day in words, beside the field: "Friday 20 Nov 2026, 00:00 to 24:00 CET, Europe/Berlin". */
  caption?: ReactNode;
  /** The polite sentence once per commit: "20 Nov 2026: 9 versions come into force." */
  status?: string;
  /** Said when Enter or blur finds text that is not a date. Nothing is committed. */
  invalid?: ReactNode;
  className?: string;
}

/** The same film the modern button recipe uses for hover. */
const HOVER_FILM = "hover:bg-[linear-gradient(var(--gm-hover),var(--gm-hover))]";

const STEP = cn(
  "inline-grid size-9 shrink-0 place-items-center rounded-m-control border border-m-control bg-m-plate text-m-ink shadow-m-quiet max-sm:size-11 aurora:rounded-full aurora:border-a-edge-button aurora:bg-transparent aurora:shadow-none",
  HOVER_FILM,
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-m-ring",
);

/**
 * "On a date": the day before, a date field, the day after, Today and Next
 * date with changes, on one plate. Drawn for the GPlatform Terms staff
 * console, where a rollout's effect is read one day at a time.
 *
 * **The field commits on Enter or blur, never per keystroke**, as `AsOf` does
 * and for its reason: every commit loads a page, and a page that loads on every
 * digit of a year shows four wrong days before the right one. Text that is not
 * a date is kept for correcting and marked invalid, and nothing is committed.
 *
 * **The arrows are named in words**, "The day before" and "The day after",
 * because a chevron's name is otherwise "button". They step from the last day
 * committed, which is not always the `day` prop yet: a typed date committed by
 * the blur that pressing an arrow causes is the day the arrow steps from.
 *
 * **Next date with changes stays in place when there is none.** It is marked
 * `aria-disabled` rather than `disabled` and ignores the press, so pressing it
 * onto the last date with changes does not drop focus to the top of the page
 * the moment it runs out.
 *
 * **One polite status per commit**, said by the region under the plate. The
 * caller sets it once the new day has loaded, so what is said is what is shown.
 */
export function DayStepper({
  day,
  onCommit,
  labels,
  today,
  next,
  caption,
  status,
  invalid,
  className,
}: DayStepperProps) {
  const fieldId = useId();
  const captionId = useId();
  const errorId = useId();

  const [text, setText] = useState(day);
  const [synced, setSynced] = useState(day);
  const [refused, setRefused] = useState(false);
  /** The last day committed, ahead of the `day` prop until the caller catches up. */
  const current = useRef(day);

  // The address moved: the field follows it, adjusted during render like AsOf.
  if (day !== synced) {
    setSynced(day);
    setText(day);
    setRefused(false);
    current.current = day;
  }

  function go(to: string) {
    setRefused(false);
    setText(to);
    if (to === current.current) return;
    current.current = to;
    onCommit(to);
  }

  function settle() {
    const parsed = parseDate(text);
    if (parsed === null) {
      setRefused(true);
      return;
    }
    go(formatDate(parsed));
  }

  function step(days: number) {
    const from = parseDate(current.current);
    if (from === null) return;
    go(formatDate(addDays(from, days)));
  }

  const refusedAndSaid = refused && invalid !== undefined;
  const describedBy = [
    caption === undefined ? undefined : captionId,
    refusedAndSaid ? errorId : undefined,
  ]
    .filter((part) => part !== undefined)
    .join(" ");

  const verb = clsx(buttonClasses({ variant: "quiet", size: 36 }), "max-sm:h-11");
  const inert =
    "inline-flex h-9 cursor-default items-center px-0.5 text-m-label text-m-ink-off max-sm:h-11 " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-m-ring";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-m-panel bg-m-plate px-[18px] py-3.5 shadow-m-plate",
        AURORA_GLASS,
        className,
      )}
    >
      {labels.day === undefined ? null : (
        <label htmlFor={fieldId} className="text-m-label text-m-ink">
          {labels.day}
        </label>
      )}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={labels.before}
          onClick={() => {
            step(-1);
          }}
          className={STEP}
        >
          <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </button>
        <Input
          id={fieldId}
          height={36}
          mono
          type="text"
          autoComplete="off"
          spellCheck={false}
          aria-label={labels.field}
          aria-describedby={describedBy === "" ? undefined : describedBy}
          aria-invalid={refused ? true : undefined}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setRefused(false);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            settle();
          }}
          onBlur={settle}
          className={cn("w-[132px] max-sm:h-11", refused ? "border-m-crit" : "")}
        />
        <button
          type="button"
          aria-label={labels.after}
          onClick={() => {
            step(1);
          }}
          className={STEP}
        >
          <ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </button>
      </div>
      {caption === undefined ? null : (
        <span id={captionId} className="text-m-meta text-m-ink-2">
          {caption}
        </span>
      )}
      <span className="ml-auto flex gap-4">
        <button
          type="button"
          onClick={() => {
            go(today);
          }}
          className={verb}
        >
          {labels.today}
        </button>
        {next === undefined ? null : (
          <button
            type="button"
            aria-disabled={next === null ? true : undefined}
            onClick={() => {
              if (next !== null) go(next);
            }}
            className={next === null ? inert : verb}
          >
            {labels.next}
          </button>
        )}
      </span>
      {refusedAndSaid ? (
        <p id={errorId} className="basis-full text-m-meta text-m-crit-ink">
          {invalid}
        </p>
      ) : null}
      <p role="status" className="sr-only">
        {status ?? ""}
      </p>
    </div>
  );
}
