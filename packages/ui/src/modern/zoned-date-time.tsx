"use client";

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "../cn.js";
import { FormField } from "./form-field.js";
import { Input, type InputHeight } from "./input.js";
import {
  DEFAULT_ZONE,
  evaluateFields,
  fieldsFromIso,
  normaliseFields,
  stepFields,
  type ClockGap,
  type Occurrence,
  type ZonedFields,
  type ZonedOutcome,
  type ZonedReading,
} from "./zoned-time.js";

/**
 * How a change came about. Typing is told apart from everything else because
 * the design validates on blur and never while typing: a refusal that appears
 * on the third keystroke tells somebody they are wrong before they have
 * finished being right. A key step, a paste or a choice is a finished act.
 */
export type ZonedChangeSource = "typing" | "step" | "paste" | "choice" | "enter" | "blur";

export interface ZonedChange {
  /** What the fields mean now, including why there is no instant when there is none. */
  outcome: ZonedOutcome;
  via: ZonedChangeSource;
}

interface ZonedSharedProps {
  /**
   * The IANA zone every typed time is read in. Berlin by default, because that
   * is where the legal dates this was drawn for live; a zone name the runtime
   * does not know throws on first render rather than quietly reading UTC.
   */
  zone?: string;
  /** ISO 8601, with or without an offset, or a bare date in date-only mode. */
  defaultValue?: string | null;
  /**
   * Re-seeds the fields when it CHANGES to something other than what the
   * control last emitted, for a caller that resets the form or offers a fix as
   * a button. Not a fully controlled value: a half-typed date is not an
   * instant, so it cannot round-trip through the caller, and the text has to
   * live here.
   */
  value?: string | null;
  /**
   * Every edit. `value` is ISO 8601 with its offset, or `null` while the
   * fields are empty, incomplete, invalid, ambiguous or missing.
   */
  onChange?: (value: string | null, change: ZonedChange) => void;
  /** Enter in either field, or focus leaving the control. Never per keystroke. */
  onCommit?: (value: string | null, change: ZonedChange) => void;
  height?: InputHeight;
  /** The date field's own name, e.g. "Date". Joined after the field's label. */
  dateLabel: string;
  /** An example of the format, never the label. */
  datePlaceholder?: string;
  /**
   * The polite sentence when the zone changes as the date moves, e.g. "Now
   * CET, plus one hour." Built by the caller from the two readings, because
   * "plus one hour" is words. Absent, nothing is announced.
   */
  zoneChange?: (now: ZonedReading, before: ZonedReading) => string;
  /** Posts the instant with a form, as ISO 8601 with the offset, or empty. */
  name?: string;
}

/** A date and a time. */
export interface ZonedTimeModeProps {
  dateOnly?: false;
  /** The time field's own name, e.g. "Time". */
  timeLabel: string;
  timePlaceholder?: string;
  /** "02:30 happens twice that night. Which one?" Receives the typed time. */
  ambiguousLegend: (time: string) => ReactNode;
  /** "The first, CEST +02:00". Receives the earlier of the two instants. */
  ambiguousFirst: (reading: ZonedReading) => ReactNode;
  /** "The second, CET +01:00". Receives the later one. */
  ambiguousSecond: (reading: ZonedReading) => ReactNode;
}

/** The same control without the time: the instant is the start of that day. */
export interface ZonedDateOnlyModeProps {
  dateOnly: true;
  /**
   * What the start of the day is, in words: "from 00:00 CET, the start of that
   * day". Absent, the clock reading and zone are shown without words.
   */
  startOfDay?: (reading: ZonedReading) => ReactNode;
}

/**
 * What a surrounding field hands over: the shape of `FormFieldControlProps`,
 * plus the id of whatever names the whole control.
 */
export interface ZonedControlWiring {
  /** Lands on the date field, so a label pointing at it focuses the first part. */
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  /**
   * The element naming the whole control. Each field is then announced as
   * that name followed by its own: "In force from Date", "In force from Time".
   */
  labelledBy?: string;
  className?: string;
}

export type ZonedDateTimeInputProps = ZonedSharedProps &
  ZonedControlWiring &
  (ZonedTimeModeProps | ZonedDateOnlyModeProps);

interface FieldState {
  fields: ZonedFields;
  /** What the caller last heard, so a `value` that merely echoes it is not a re-seed. */
  emitted: string | null;
  /** The last complete reading, which a zone change is measured from. */
  anchor: ZonedReading | null;
  /** The live region's sentence. */
  said: string;
  /** The `value` prop as last seen, to notice when it moves. */
  synced: string | null | undefined;
}

const EMPTY: ZonedFields = { date: "", time: "", choice: null };

function seed(value: string | null | undefined, zone: string, dateOnly: boolean): ZonedFields {
  if (value === null || value === undefined || value.trim() === "") return EMPTY;
  const parsed = fieldsFromIso(value, zone);
  // A value that is not ISO is shown as it came rather than dropped, so a
  // hand-edited link reads as a refused date instead of as an empty field.
  if (parsed === null) return { ...EMPTY, date: value };
  return { date: parsed.date, time: dateOnly ? "" : (parsed.time ?? ""), choice: parsed.choice };
}

/*
 * The focus ring is stated here rather than inherited, because the global one
 * draws console's ring colour and this is modern: 2px of m-ring at offset 2,
 * and never animated.
 */
const RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-m-ring";

/**
 * A date, a time, and the zone they mean, read off the two rather than typed.
 *
 * `Input` takes text and nothing in the package knew a zone, so a time sent
 * without an offset was one keystroke away on every legal form. This is the
 * control that cannot produce one: **it emits ISO 8601 with the offset or it
 * emits nothing.** A half-typed date, the hour the clocks go back before
 * somebody has said which one, and the hour the clocks skip all emit `null`,
 * and the caller learns why from the outcome beside it.
 *
 * **The zone is an `output`, never a field.** Nobody types CET. The offset is a
 * fact about the date and time already typed, so it is derived from them and
 * shown beside them, and it changes when the date crosses a change of clocks.
 *
 * **Typed entry is the contract, and there is no calendar.** The design makes
 * the calendar optional, and a picker is a second way to enter the same thing
 * with its own focus trap and its own month arithmetic. The keys do what a
 * picker would: Arrow Up and Down step a day or a minute, Page Up and Down a
 * month or an hour, and a pasted ISO string fills both fields at once.
 *
 * This is the bare control, for a place that names it some other way. A form
 * wants `ZonedDateTime`, which puts it in a `FormField` and says what is wrong
 * in the hint slot.
 */
export function ZonedDateTimeInput(props: ZonedDateTimeInputProps) {
  const {
    zone = DEFAULT_ZONE,
    defaultValue,
    value,
    onChange,
    onCommit,
    height = 44,
    dateLabel,
    datePlaceholder,
    zoneChange,
    name,
    id,
    labelledBy,
    className,
  } = props;
  const time = props.dateOnly === true ? null : props;
  const dateOnly = time === null;
  const startOfDay = props.dateOnly === true ? props.startOfDay : undefined;

  const base = useId();
  const dateId = id ?? `${base}-date`;
  const timeId = `${base}-time`;
  const readoutId = `${base}-zone`;
  const dateNameId = `${base}-date-name`;
  const timeNameId = `${base}-time-name`;

  const [state, setState] = useState<FieldState>(() => {
    const fields = seed(value !== undefined ? value : defaultValue, zone, dateOnly);
    const reading = evaluateFields(fields, zone, dateOnly).reading;
    return { fields, emitted: reading?.iso ?? null, anchor: reading, said: "", synced: value };
  });

  /*
   * The caller moved `value`. Adjusted during render rather than in an effect,
   * so the new fields paint in the same frame as the change and a reset never
   * flashes the old date first. Nothing is emitted: the caller already knows.
   */
  if (value !== undefined && value !== state.synced) {
    if (value === state.emitted) {
      setState({ ...state, synced: value });
    } else {
      const fields = seed(value, zone, dateOnly);
      const reading = evaluateFields(fields, zone, dateOnly).reading;
      setState({ ...state, fields, synced: value, emitted: value, anchor: reading });
    }
  }

  const outcome = evaluateFields(state.fields, zone, dateOnly);
  const current = outcome.reading?.iso ?? null;

  /*
   * Where the caret was before a key step. The step rewrites the whole value
   * and a browser puts the caret at the end when script sets it, which would
   * make the next press of the same key feel like it hit a different field.
   */
  const caret = useRef<{ input: HTMLInputElement; start: number; end: number } | null>(null);
  useLayoutEffect(() => {
    const pending = caret.current;
    if (pending === null) return;
    caret.current = null;
    if (document.activeElement === pending.input) {
      pending.input.setSelectionRange(pending.start, pending.end);
    }
  });

  function apply(proposed: ZonedFields, via: ZonedChangeSource) {
    const next = evaluateFields(proposed, zone, dateOnly);
    // An answer to "which one" belongs to the time it was asked about.
    const fields = next.ambiguous === null ? { ...proposed, choice: null } : proposed;
    const iso = next.reading?.iso ?? null;

    let { anchor, said } = state;
    if (next.reading !== null) {
      /*
       * Announced only when the offset itself moves, and never for a choice
       * between the two readings of a doubled hour: the radio the person just
       * pressed already says "CET +01:00", and repeating it talks over them.
       */
      if (
        zoneChange !== undefined &&
        via !== "choice" &&
        anchor !== null &&
        anchor.offsetMinutes !== next.reading.offsetMinutes
      ) {
        said = zoneChange(next.reading, anchor);
      }
      anchor = next.reading;
    }

    setState({ ...state, fields, emitted: iso, anchor, said });
    onChange?.(iso, { outcome: next, via });
  }

  function commit(via: "enter" | "blur") {
    onCommit?.(current, { outcome, via });
  }

  const onKeyDown = (part: "date" | "time") => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      commit("enter");
      return;
    }
    // A modifier is somebody selecting or moving by word, not stepping.
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const next = stepFields(state.fields, part, event.key, zone, Date.now());
    if (next === null) return;
    event.preventDefault();
    const input = event.currentTarget;
    if (input.value !== "" && input.selectionStart !== null && input.selectionEnd !== null) {
      caret.current = { input, start: input.selectionStart, end: input.selectionEnd };
    }
    apply(next, "step");
  };

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    /*
     * Only a full date and time is taken over. A bare date pasted into the date
     * field is ordinary text and the browser pastes it as such; intercepting it
     * would also swallow a paste into the middle of what is already there.
     */
    const parsed = fieldsFromIso(event.clipboardData.getData("text/plain"), zone);
    if (parsed === null || parsed.time === null) return;
    event.preventDefault();
    apply({ date: parsed.date, time: dateOnly ? "" : parsed.time, choice: parsed.choice }, "paste");
  }

  function onBlur(event: FocusEvent<HTMLDivElement>) {
    const tidy = normaliseFields(state.fields);
    if (tidy.date !== state.fields.date || tidy.time !== state.fields.time) {
      setState({ ...state, fields: tidy });
    }
    // Moving between the two fields is not leaving.
    if (event.currentTarget.contains(event.relatedTarget)) return;
    commit("blur");
  }

  const describedBy = [readoutId, props["aria-describedby"]].filter(Boolean).join(" ");
  const field = {
    height,
    mono: true,
    autoComplete: "off",
    spellCheck: false,
    onPaste,
    "aria-describedby": describedBy,
    "aria-invalid": props["aria-invalid"],
  } as const;
  const both = outcome.ambiguous;
  const reading = outcome.reading;

  return (
    <div onBlur={onBlur} className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Input
          {...field}
          id={dateId}
          value={state.fields.date}
          placeholder={datePlaceholder}
          aria-labelledby={[labelledBy, dateNameId].filter(Boolean).join(" ")}
          onChange={(event) => apply({ ...state.fields, date: event.target.value }, "typing")}
          onKeyDown={onKeyDown("date")}
          // Ten characters and room for the caret. Mono, so 11ch is 11 digits.
          className={cn("w-[calc(11ch_+_1.5rem_+_2px)] shrink-0", RING)}
        />
        {time === null ? null : (
          <Input
            {...field}
            id={timeId}
            value={state.fields.time}
            placeholder={time.timePlaceholder}
            aria-labelledby={[labelledBy, timeNameId].filter(Boolean).join(" ")}
            onChange={(event) => apply({ ...state.fields, time: event.target.value }, "typing")}
            onKeyDown={onKeyDown("time")}
            className={cn("w-[calc(6ch_+_1.5rem_+_2px)] shrink-0", RING)}
          />
        )}
        {/*
         * `output` carries an implicit status role, which some browsers make a
         * polite live region. Switched off: the readout changes on every
         * keystroke that completes a date, and the one sentence worth hearing
         * is the zone change, said once below. It is reachable instead as the
         * description of both fields.
         */}
        {dateOnly ? (
          <output
            id={readoutId}
            htmlFor={dateId}
            aria-live="off"
            className="inline-flex items-center text-m-meta text-m-ink-2"
          >
            {reading === null ? null : startOfDay !== undefined ? (
              startOfDay(reading)
            ) : (
              <span className="font-mono tabular-nums">{`${reading.time} ${reading.abbreviation}`}</span>
            )}
          </output>
        ) : (
          <output
            id={readoutId}
            htmlFor={`${dateId} ${timeId}`}
            aria-live="off"
            className={cn(
              "inline-flex shrink-0 items-center rounded-m-control bg-m-sunken px-3 aurora:rounded-a-field aurora:bg-a-well",
              "font-mono text-m-label text-m-ink-2 tabular-nums",
              height === 44 ? "h-11" : "h-9",
            )}
          >
            {/*
             * Until the two fields name one instant there is no offset to show,
             * and a guess would be a fact about some other time. The zone's own
             * name is true whatever is typed.
             */}
            {reading === null ? zone : `${reading.abbreviation} ${reading.offset}`}
          </output>
        )}
      </div>

      {time !== null && both !== null ? (
        /*
         * The hour the clocks go back happens twice, and only the person knows
         * which one the letter meant. Asked, not defaulted: a default here is
         * an hour of legal time decided by whichever radio came first. Native
         * radios, so the group is one tab stop and the arrows choose.
         */
        <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
          <legend className="mb-1.5 text-m-meta text-m-ink-2">
            {time.ambiguousLegend(both.earlier.time)}
          </legend>
          {(["earlier", "later"] as const satisfies readonly Occurrence[]).map((occurrence) => (
            <label
              key={occurrence}
              className="flex min-h-6 items-center gap-1.5 text-m-meta text-m-ink"
            >
              <input
                type="radio"
                name={`${base}-occurrence`}
                value={occurrence}
                checked={state.fields.choice === occurrence}
                onChange={() => apply({ ...state.fields, choice: occurrence }, "choice")}
                className={cn("size-4 shrink-0 accent-m-accent", RING)}
              />
              {occurrence === "earlier"
                ? time.ambiguousFirst(both.earlier)
                : time.ambiguousSecond(both.later)}
            </label>
          ))}
        </fieldset>
      ) : null}

      {/*
       * The fields' own names, referenced rather than shown: the visible label
       * names the whole control, and each field adds one word to it.
       */}
      <span id={dateNameId} hidden>
        {dateLabel}
      </span>
      {time === null ? null : (
        <span id={timeNameId} hidden>
          {time.timeLabel}
        </span>
      )}
      {zoneChange === undefined ? null : (
        <span role="status" className="sr-only">
          {state.said}
        </span>
      )}
      {name === undefined ? null : <input type="hidden" name={name} value={current ?? ""} />}
    </div>
  );
}

/** The field around the control: label, hint, and the refusals it can work out itself. */
export interface ZonedFieldProps {
  label: ReactNode;
  /** "Europe/Berlin. The zone follows the date and is always sent with the time." */
  hint?: ReactNode;
  /** The caller's own refusal, e.g. a date in the future. Wins over anything derived. */
  error?: ReactNode;
  /** Text that is not a date or not a time, said once focus leaves. */
  invalid?: (field: "date" | "time") => ReactNode;
  className?: string;
}

export type ZonedDateTimeProps = ZonedSharedProps &
  ZonedFieldProps &
  (
    | (ZonedTimeModeProps & {
        /**
         * "28 Mar 2027, 02:30 does not exist in Europe/Berlin: clocks go from
         * 02:00 to 03:00. Pick 03:00 CEST or later." Required with a time,
         * because the field cannot emit this hour and must be able to say why.
         */
        missingHour: (gap: ClockGap) => ReactNode;
      })
    | (ZonedDateOnlyModeProps & { missingHour?: undefined })
  );

/**
 * `ZonedDateTimeInput` in a `FormField`, so the hour that does not exist is an
 * error in the hint slot, wired to both fields by the same `aria-describedby`
 * as every other refusal in a form.
 *
 * The refusal follows the design's timing: it appears when focus leaves, on
 * Enter, or after a key step or a paste lands on it, and it goes as soon as
 * somebody starts typing again. The question about a doubled hour is not a
 * refusal and is not delayed: it appears with the time that raises it, so Tab
 * reaches it next.
 */
export function ZonedDateTime(props: ZonedDateTimeProps) {
  const { label, hint, error, invalid, missingHour, className, onChange, onCommit, ...control } =
    props;
  const labelId = useId();
  // The outcome as of the last finished act, or null while somebody is typing.
  const [shown, setShown] = useState<ZonedOutcome | null>(null);

  let derived: ReactNode | undefined;
  if (shown?.state === "missing" && shown.gap !== null && missingHour !== undefined) {
    derived = missingHour(shown.gap);
  } else if (shown?.state === "invalid" && shown.invalid !== null && invalid !== undefined) {
    derived = invalid(shown.invalid);
  }

  return (
    <FormField label={label} hint={hint} error={error ?? derived} className={className}>
      {(wiring) => (
        <>
          {/*
           * The label again, hidden, so both fields can be named by it. The
           * visible one belongs to FormField and has no id to point at.
           */}
          <span id={labelId} hidden>
            {label}
          </span>
          <ZonedDateTimeInput
            {...control}
            id={wiring.id}
            aria-describedby={wiring["aria-describedby"]}
            aria-invalid={wiring["aria-invalid"]}
            labelledBy={labelId}
            onChange={(value, change) => {
              setShown(change.via === "typing" ? null : change.outcome);
              onChange?.(value, change);
            }}
            onCommit={(value, change) => {
              setShown(change.outcome);
              onCommit?.(value, change);
            }}
          />
        </>
      )}
    </FormField>
  );
}
