"use client";

import { useEffect, useId, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { cn } from "../cn.js";
import { CopyChip } from "../copy-chip.js";
import { SegmentedControl } from "../segmented-control.js";
import { ZonedDateTimeInput, type ZonedChange } from "./zoned-date-time.js";
import {
  DEFAULT_ZONE,
  evaluateFields,
  fieldsFromIso,
  hrefWithAt,
  type ZonedOutcome,
  type ZonedReading,
} from "./zoned-time.js";

export type AsOfMode = "now" | "date";

export interface AsOfProps {
  /**
   * "Standings as of". Shown, names the radiogroup, and leads the date
   * field's name. A string for the reason `SegmentedControl` gives: the group's
   * accessible name is passed in from the side that has a locale.
   */
  label: string;
  /** "Now". */
  nowLabel: string;
  /** "A date". */
  dateLabel: string;
  /** The date field's own name, joined after `label`: "Date". */
  fieldLabel: string;
  datePlaceholder?: string;
  zone?: string;
  /** The `?at=` the page was rendered from, or null for now. */
  defaultValue?: string | null;
  /**
   * Follows the URL when it moves for some other reason, such as a link back
   * to now. A value that only echoes what this last committed changes nothing,
   * so a caller can pass `?at=` straight through.
   */
  value?: string | null;
  /**
   * Once per commit: ISO 8601 with the offset for a date, `null` for now. The
   * caller writes `?at=`, with `writeAt` or its router; this does not touch
   * history on its own.
   */
  onCommit: (at: string | null, reading: ZonedReading | null) => void;
  /** "Now is 16 Oct 2026, 11:04 CEST". The caller's, because it knows the clock it rendered by. */
  nowText: ReactNode;
  /** "from 00:00 CET". The start of the chosen day, in words. */
  startOfDay: (reading: ZonedReading) => ReactNode;
  /**
   * The polite sentence once per commit: "Standings recomputed for 21 Nov
   * 2026, 00:00 CET." Receives `null` for now.
   */
  announcement: (reading: ZonedReading | null) => string;
  /** Said when Enter or blur finds text that is not a date. Nothing is committed. */
  invalid?: ReactNode;
  /** The link to these standings, offered as a CopyChip. */
  link?: { href: string; label: string };
  className?: string;
}

function outcomeOf(at: string | null, zone: string): ZonedOutcome {
  const parsed = at === null ? null : fieldsFromIso(at, zone);
  return evaluateFields({ date: parsed?.date ?? at ?? "", time: "", choice: null }, zone, true);
}

/**
 * "Standings as of": now, or the start of a chosen day, written into the link.
 *
 * A SegmentedControl and a date field side by side do not say what they
 * change, and nothing wrote the instant into the URL, so a standing could not
 * be pasted into a ticket as it was seen. This is the label, the choice, the
 * date-only `ZonedDateTimeInput`, the instant in words and the link, as one
 * object on one plate.
 *
 * **It commits on Enter or blur, never per keystroke.** Every commit
 * recomputes a page on the server, and a page that recomputes on every digit
 * of a year is a page that shows four wrong answers before the right one.
 * Choosing Now commits at once, and so does choosing A date when the field
 * already holds one, because the plate would otherwise say one instant while
 * the page showed another.
 *
 * **The field is hidden at Now, not unmounted**, so the date somebody chose
 * survives a look at the present and is still there when they switch back.
 *
 * Drawn for the GPlatform Terms staff console, on a plate under the page head.
 */
export function AsOf({
  label,
  nowLabel,
  dateLabel,
  fieldLabel,
  datePlaceholder,
  zone = DEFAULT_ZONE,
  defaultValue,
  value,
  onCommit,
  nowText,
  startOfDay,
  announcement,
  invalid,
  link,
  className,
}: AsOfProps) {
  const labelId = useId();
  const fieldId = useId();
  const errorId = useId();
  const initial = value !== undefined ? value : (defaultValue ?? null);

  const [mode, setMode] = useState<AsOfMode>(initial === null ? "now" : "date");
  const [committed, setCommitted] = useState<string | null>(initial);
  const [outcome, setOutcome] = useState<ZonedOutcome>(() => outcomeOf(initial, zone));
  const [fieldValue, setFieldValue] = useState<string | undefined>(value ?? undefined);
  const [refused, setRefused] = useState(false);
  const [said, setSaid] = useState("");
  const [synced, setSynced] = useState(value);

  const choices = useRef<HTMLDivElement>(null);
  const focusField = useRef(false);
  const leavingForNow = useRef(false);

  /*
   * The URL moved under us. Adjusted during render, like the field does, so the
   * plate never paints the old choice beside the new page. A null leaves the
   * date in the field: that is the point of hiding it rather than clearing it.
   */
  if (value !== undefined && value !== synced) {
    setSynced(value);
    if (value !== committed) {
      setCommitted(value);
      setMode(value === null ? "now" : "date");
      setRefused(false);
      if (value !== null) {
        setFieldValue(value);
        setOutcome(outcomeOf(value, zone));
      }
    }
  }

  function commit(at: string | null, reading: ZonedReading | null) {
    // Once per commit means once per change: a blur that changed nothing is
    // not a recomputation, and announcing it would be a sentence about nothing.
    if (at === committed) return;
    setCommitted(at);
    setSaid(announcement(reading));
    onCommit(at, reading);
  }

  function settle(next: ZonedOutcome) {
    if (next.reading !== null) {
      setRefused(false);
      commit(next.reading.iso, next.reading);
    } else if (next.state === "invalid") {
      setRefused(true);
    }
  }

  function choose(next: AsOfMode) {
    if (next === mode) {
      // A press on A date while it is already chosen still settles what was typed.
      if (next === "date") settle(outcome);
      return;
    }
    setMode(next);
    setRefused(false);
    if (next === "now") {
      commit(null, null);
      return;
    }
    focusField.current = true;
    settle(outcome);
  }

  /*
   * Focus follows A date into the field after the render that unhides it. Not
   * in `choose`: SegmentedControl moves focus to the radio it just selected
   * after calling back, and a hidden field cannot take focus anyway, so this
   * has to run once both of those are done.
   */
  useEffect(() => {
    if (mode !== "date" || !focusField.current) return;
    focusField.current = false;
    document.getElementById(fieldId)?.focus();
  }, [mode, fieldId]);

  /*
   * Leaving the field for Now is choosing Now, not committing the half-typed
   * date on the way past. Seen in the capture phase, before the field's own
   * blur reports the commit. Safari does not focus a button on click, so there
   * the date is committed first and Now a moment later, which is two commits
   * and still the right answer.
   */
  function onBlurCapture(event: FocusEvent<HTMLDivElement>) {
    const now = choices.current?.querySelector('[role="radio"]');
    leavingForNow.current = now != null && event.relatedTarget === now;
  }

  const refusedAndSaid = refused && invalid !== undefined;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-3 rounded-m-panel bg-m-plate px-[18px] py-3.5 shadow-m-plate",
        className,
      )}
    >
      <span id={labelId} className="text-m-label text-m-ink">
        {label}
      </span>
      <div ref={choices} className="contents">
        <SegmentedControl<AsOfMode>
          label={label}
          options={[
            { key: "now", label: nowLabel },
            { key: "date", label: dateLabel },
          ]}
          value={mode}
          onChange={choose}
        />
      </div>

      {/*
       * `hidden` on a wrapper with no classes of its own, so no display utility
       * can outrank it. The field inside keeps its text and its state.
       */}
      <div hidden={mode === "now"} onBlurCapture={onBlurCapture}>
        <ZonedDateTimeInput
          dateOnly
          id={fieldId}
          zone={zone}
          height={36}
          dateLabel={fieldLabel}
          labelledBy={labelId}
          datePlaceholder={datePlaceholder}
          defaultValue={initial}
          value={fieldValue}
          startOfDay={startOfDay}
          aria-describedby={refusedAndSaid ? errorId : undefined}
          aria-invalid={refusedAndSaid ? true : undefined}
          onChange={(_value, change: ZonedChange) => {
            setOutcome(change.outcome);
            if (change.via === "typing") setRefused(false);
          }}
          onCommit={(_value, change: ZonedChange) => {
            if (change.via === "blur" && leavingForNow.current) {
              leavingForNow.current = false;
              return;
            }
            settle(change.outcome);
          }}
        />
      </div>

      {mode === "now" ? <span className="text-m-meta text-m-ink-2">{nowText}</span> : null}
      {mode === "date" && refusedAndSaid ? (
        <p id={errorId} className="basis-full text-m-meta text-m-crit-ink">
          {invalid}
        </p>
      ) : null}
      {link === undefined ? null : (
        <CopyChip value={link.href} label={link.label} className="ml-auto" />
      )}
      <span role="status" className="sr-only">
        {said}
      </span>
    </div>
  );
}

/**
 * Write the instant into `?at=` with `history.replaceState`, and return the new
 * address, for an `onCommit` that wants exactly what the design describes.
 *
 * Replace rather than push: stepping through five dates to find the one that
 * matters is not five places somebody wants the Back button to visit. Nothing
 * here asks the server for the new page. In Next, follow it with
 * `router.refresh()`, or use `router.replace` instead of this.
 */
export function writeAt(at: string | null, param = "at"): string {
  const href = hrefWithAt(window.location.href, at, param);
  window.history.replaceState(window.history.state, "", href);
  return href;
}
