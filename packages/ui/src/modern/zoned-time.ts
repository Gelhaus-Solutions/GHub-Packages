/**
 * Wall clocks in a named zone, and the instants they stand for, without a date
 * library.
 *
 * Drawn for the GPlatform Terms staff console, where every legal date is an
 * instant in Europe/Berlin and a time sent without its offset is refused. The
 * two controls built on this, `ZonedDateTime` and `AsOf`, are only as correct
 * as the arithmetic here, so the arithmetic lives in a module with no markup,
 * no hooks and no `"use client"`, where a test can reach it directly and a
 * server component can call it.
 *
 * **The platform's own zone database, read through `Intl.DateTimeFormat`, is
 * the only source of offsets.** A date library would bring a second copy of the
 * same data that ages on its own release schedule, and a hand-written rule for
 * "the last Sunday in March" is correct for one zone until a government changes
 * its mind. Asking `Intl` what the wall clock read at an instant, and deriving
 * the offset from the difference, works for every zone the runtime knows and
 * changes when the runtime does.
 *
 * Nothing here reads the host's zone. Every conversion goes through `Date.UTC`
 * arithmetic and an explicit `timeZone`, so a server in UTC and a laptop in
 * Berlin compute the same instant from the same two fields.
 */

const MINUTE = 60_000;
const DAY = 86_400_000;

/** The zone the controls fall back to. Legal dates in the house are Berlin dates. */
export const DEFAULT_ZONE = "Europe/Berlin";

/** A calendar date with no zone attached: what somebody typed, not yet an instant. */
export interface CivilDate {
  year: number;
  month: number;
  day: number;
}

/** A clock reading with no zone attached. 24-hour, minute precision. */
export interface CivilTime {
  hour: number;
  minute: number;
}

export type CivilDateTime = CivilDate & CivilTime;

/**
 * One instant, read in one zone: everything a caller needs to say it in words.
 *
 * The parts are handed over separately rather than as a formatted sentence,
 * because the sentence is the caller's. "21 Nov 2026, 00:00 CET" and
 * "21. Nov. 2026, 00:00 MEZ" are the same reading in two languages, and a
 * package with no locale cannot pick one.
 */
export interface ZonedReading {
  /**
   * ISO 8601 with seconds and the offset, the only form these controls emit:
   * `2026-11-20T00:00:00+01:00`. Never `Z` and never a bare local time, because
   * the offset is the part a server refuses a time without.
   */
  iso: string;
  /** Milliseconds since the epoch, always on a whole minute. */
  epochMs: number;
  /** The wall calendar date in the zone, `YYYY-MM-DD`. */
  date: string;
  /** The wall clock in the zone, `HH:MM`, 24-hour. */
  time: string;
  /** The IANA name it was read in, e.g. `Europe/Berlin`. */
  zone: string;
  /**
   * The short name of the zone at that instant: `CET` in winter and `CEST` in
   * summer for Berlin. The English short name where the runtime has one, which
   * is how the design writes it in both languages; otherwise the `GMT+5:30`
   * form the runtime falls back to, which is still true.
   */
  abbreviation: string;
  /** `+01:00`. Always signed, always hours and minutes. */
  offset: string;
  /** The same offset in minutes east of UTC, for arithmetic and for words. */
  offsetMinutes: number;
}

/** Which of the two readings of a wall time that happens twice. */
export type Occurrence = "earlier" | "later";

/**
 * The hour the clocks skip, and where they land.
 *
 * Carries the typed date and time as well as the gap, so one object is enough
 * to build the whole refusal: "28 Mar 2027, 02:30 does not exist in
 * Europe/Berlin: clocks go from 02:00 to 03:00. Pick 03:00 CEST or later."
 */
export interface ClockGap {
  /** The date that was typed, `YYYY-MM-DD`. */
  date: string;
  /** The time that was typed and does not exist, `HH:MM`. */
  time: string;
  zone: string;
  /** The wall time the clocks leave, `02:00`. */
  from: string;
  /** The first instant after the gap, read in the zone: `03:00`, `CEST`. */
  resumes: ZonedReading;
}

/**
 * What a wall time in a zone means. Exactly one instant, two, or none.
 *
 * Three cases rather than "an instant or null", because the two failures need
 * different answers from a person: an hour that happens twice needs a choice,
 * and an hour that never happens needs a different time.
 */
export type WallResolution =
  | { kind: "exact"; reading: ZonedReading }
  | { kind: "ambiguous"; earlier: ZonedReading; later: ZonedReading }
  | { kind: "missing"; gap: ClockGap };

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

/**
 * A civil date and time as if it were UTC, in milliseconds.
 *
 * `setUTCFullYear` rather than `Date.UTC`, because `Date.UTC` reads a year
 * under 100 as 1900 plus that year. Nothing here accepts such a year, and the
 * helper is still the one that cannot be wrong about it.
 */
function utcMs(year: number, month: number, day: number, hour = 0, minute = 0): number {
  const at = new Date(0);
  at.setUTCFullYear(year, month - 1, day);
  at.setUTCHours(hour, minute, 0, 0);
  return at.getTime();
}

function civilFromUtc(ms: number): CivilDateTime {
  const at = new Date(ms);
  return {
    year: at.getUTCFullYear(),
    month: at.getUTCMonth() + 1,
    day: at.getUTCDate(),
    hour: at.getUTCHours(),
    minute: at.getUTCMinutes(),
  };
}

function daysInMonth(year: number, month: number): number {
  // Day zero of the next month is the last day of this one.
  return new Date(utcMs(year, month + 1, 0)).getUTCDate();
}

export function formatDate(date: CivilDate): string {
  return `${pad(date.year, 4)}-${pad(date.month)}-${pad(date.day)}`;
}

export function formatTime(time: CivilTime): string {
  return `${pad(time.hour)}:${pad(time.minute)}`;
}

/** Minutes east of UTC as `+01:00`. Zero is `+00:00`, never `Z`. */
export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

const DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

/**
 * `YYYY-MM-DD`, checked against the calendar, or `null`.
 *
 * A single-digit month or day is accepted, because somebody typing "2026-1-5"
 * meant one date and refusing it would be the machine being particular about
 * a zero. The control writes it back padded when focus leaves.
 */
export function parseDate(text: string): CivilDate | null {
  const match = DATE.exec(text.trim());
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Four digits and no leading zero: a legal date in year 0999 is a typo.
  if (year < 1000 || month < 1 || month > 12 || day < 1) return null;
  if (day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

const TIME = /^(\d{1,2}):?(\d{2})$/;

/**
 * `HH:MM` on a 24-hour clock, or `null`. `9:00` and `0900` are read as `09:00`.
 *
 * `24:00` is refused. It is a real way of writing the end of a day and the
 * design uses it in a sentence, but as an input it is the start of the next day
 * wearing a different date, and the field would then emit an instant whose
 * date is not the one on the screen.
 */
export function parseTime(text: string): CivilTime | null {
  const match = TIME.exec(text.trim());
  if (match === null) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/*
 * Formatters are expensive to build and cheap to reuse, and the controls ask
 * for an offset several times per keystroke, so one per zone is kept.
 */
const partsFormatters = new Map<string, Intl.DateTimeFormat>();
const nameFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(zone: string): Intl.DateTimeFormat {
  let formatter = partsFormatters.get(zone);
  if (formatter === undefined) {
    // en-US for its Latin digits and fixed field set, not for any word: only
    // the numeric parts are read, and nothing from this reaches a screen.
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    partsFormatters.set(zone, formatter);
  }
  return formatter;
}

function nameFormatter(zone: string, locale: string): Intl.DateTimeFormat {
  const key = `${locale} ${zone}`;
  let formatter = nameFormatters.get(key);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: "short" });
    nameFormatters.set(key, formatter);
  }
  return formatter;
}

/** What the wall clock in `zone` read at `epochMs`, to the second. */
function wallAt(epochMs: number, zone: string): CivilDateTime & { second: number } {
  const parts = partsFormatter(zone).formatToParts(new Date(epochMs));
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  // Some engines still write midnight as 24 under h23. It is the same minute.
  const hour = read("hour") % 24;
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour,
    minute: read("minute"),
    second: read("second"),
  };
}

/**
 * Minutes east of UTC in `zone` at `epochMs`.
 *
 * The difference between what the wall clock read and what UTC read at the
 * same instant. That is the definition of an offset, so it cannot disagree
 * with the zone database the way a table of rules can.
 */
export function offsetAt(epochMs: number, zone: string): number {
  const second = Math.floor(epochMs / 1000) * 1000;
  const wall = wallAt(second, zone);
  const asUtc = utcMs(wall.year, wall.month, wall.day, wall.hour, wall.minute) + wall.second * 1000;
  return Math.round((asUtc - second) / MINUTE);
}

const NAMED = /^[A-Z]{2,5}$/;

/**
 * `CET`, `CEST`, `EST`: the short name of `zone` at `epochMs`.
 *
 * en-GB first because it is the one that knows CET and CEST, en-US second
 * because it is the one that knows EST and PDT. Neither is a choice of
 * language: these abbreviations are written the same way in every language the
 * products use. Where neither has a name the runtime's `GMT+5:30` stands,
 * which is clumsy and still correct.
 */
export function zoneAbbreviation(epochMs: number, zone: string): string {
  let fallback: string | undefined;
  for (const locale of ["en-GB", "en-US"]) {
    const name = nameFormatter(zone, locale)
      .formatToParts(new Date(epochMs))
      .find((part) => part.type === "timeZoneName")?.value;
    if (name === undefined) continue;
    if (NAMED.test(name)) return name;
    fallback ??= name;
  }
  return fallback ?? "";
}

/**
 * Read an instant in a zone. Seconds are dropped: these controls work in whole
 * minutes, and the design keeps seconds for the audit log only.
 */
export function readInstant(epochMs: number, zone: string): ZonedReading {
  const at = Math.floor(epochMs / MINUTE) * MINUTE;
  const offsetMinutes = offsetAt(at, zone);
  const wall = civilFromUtc(at + offsetMinutes * MINUTE);
  const date = formatDate(wall);
  const time = formatTime(wall);
  const offset = formatOffset(offsetMinutes);
  return {
    iso: `${date}T${time}:00${offset}`,
    epochMs: at,
    date,
    time,
    zone,
    abbreviation: zoneAbbreviation(at, zone),
    offset,
    offsetMinutes,
  };
}

/**
 * What a typed date and time mean in `zone`.
 *
 * Every offset the zone uses within a day either side is tried, and each one
 * that reads back as itself is a real instant. One survivor is the ordinary
 * case. Two is the hour the clocks go back, which happens twice. None is the
 * hour the clocks go forward, which never happens at all.
 *
 * A day either side is wider than any transition the zone database holds, and
 * narrow enough that two transitions never fall inside it.
 */
export function resolveWallTime(wall: CivilDateTime, zone: string): WallResolution {
  const asUtc = utcMs(wall.year, wall.month, wall.day, wall.hour, wall.minute);
  const before = offsetAt(asUtc - DAY, zone);
  const after = offsetAt(asUtc + DAY, zone);
  const tried = new Set([before, offsetAt(asUtc, zone), after]);

  const instants = [...tried]
    .map((offset) => asUtc - offset * MINUTE)
    .filter((instant) => offsetAt(instant, zone) === (asUtc - instant) / MINUTE)
    .sort((a, b) => a - b);

  const first = instants[0];
  const last = instants[instants.length - 1];
  if (first !== undefined && last !== undefined) {
    if (first === last) return { kind: "exact", reading: readInstant(first, zone) };
    return {
      kind: "ambiguous",
      earlier: readInstant(first, zone),
      later: readInstant(last, zone),
    };
  }

  /*
   * The gap. Read with the later offset the typed time falls before the
   * change, read with the earlier one it falls after, so the change itself is
   * between the two and a bisection to the minute finds it. Transitions in the
   * database fall on whole minutes for every date this accepts.
   */
  let low = asUtc - after * MINUTE;
  let high = asUtc - before * MINUTE;
  while (high - low > MINUTE) {
    const middle = low + Math.floor((high - low) / 2 / MINUTE) * MINUTE;
    if (offsetAt(middle, zone) === before) low = middle;
    else high = middle;
  }
  return {
    kind: "missing",
    gap: {
      date: formatDate(wall),
      time: formatTime(wall),
      zone,
      from: formatTime(civilFromUtc(high + before * MINUTE)),
      resumes: readInstant(high, zone),
    },
  };
}

/**
 * The first instant of a day in `zone`. Midnight, nearly always.
 *
 * Not always: a few zones have moved their clocks at midnight, so 00:00 on that
 * day never happened and the day starts at 01:00. A date-only control means
 * "from the start of that day", and this is that instant rather than a
 * midnight that does not exist.
 */
export function startOfDay(date: CivilDate, zone: string): ZonedReading {
  const resolved = resolveWallTime({ ...date, hour: 0, minute: 0 }, zone);
  if (resolved.kind === "exact") return resolved.reading;
  if (resolved.kind === "ambiguous") return resolved.earlier;
  return resolved.gap.resumes;
}

export function addDays(date: CivilDate, days: number): CivilDate {
  const { year, month, day } = civilFromUtc(utcMs(date.year, date.month, date.day) + days * DAY);
  return { year, month, day };
}

/**
 * A month on, keeping the day where the month has it and the last day where it
 * does not: 31 January plus a month is the end of February, not 3 March.
 */
export function addMonths(date: CivilDate, months: number): CivilDate {
  const index = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

/** Which occurrence a reading is, where its wall time happens twice; else null. */
export function occurrenceOf(reading: ZonedReading): Occurrence | null {
  const date = parseDate(reading.date);
  const time = parseTime(reading.time);
  if (date === null || time === null) return null;
  const resolved = resolveWallTime({ ...date, ...time }, reading.zone);
  if (resolved.kind !== "ambiguous") return null;
  return resolved.earlier.epochMs === reading.epochMs ? "earlier" : "later";
}

/** The two fields a person types, and the answer to "which one" where it was asked. */
export interface ZonedFields {
  date: string;
  time: string;
  choice: Occurrence | null;
}

const ISO =
  /^(\d{4}-\d{1,2}-\d{1,2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}(?::?\d{2})?)?)?$/i;

/**
 * Fields from an ISO 8601 string, for a paste and for a value handed in.
 *
 * With an offset (or `Z`) the string names an instant, and the fields show that
 * instant in `zone`: `2026-11-19T23:00:00Z` fills `2026-11-20` and `00:00` in
 * Berlin, and where the result happens twice the offset has already said which
 * one, so `choice` is set. Without an offset the clock reading is taken as a
 * Berlin reading, which is what somebody pasting a bare local time meant.
 *
 * `time` is `null` for a bare date. Seconds other than zero are refused rather
 * than dropped: the fields cannot show them, and silently moving a legal date
 * by thirty seconds is worse than declining the paste.
 */
export function fieldsFromIso(
  text: string,
  zone: string,
): { date: string; time: string | null; choice: Occurrence | null } | null {
  const match = ISO.exec(text.trim());
  if (match === null) return null;
  const date = parseDate(match[1] ?? "");
  if (date === null) return null;
  if (match[2] === undefined) return { date: formatDate(date), time: null, choice: null };

  const time = parseTime(`${match[2]}:${match[3] ?? ""}`);
  if (time === null) return null;
  if (Number(match[4] ?? 0) !== 0 || Number(match[5] ?? 0) !== 0) return null;

  const zoneText = match[6];
  if (zoneText === undefined)
    return { date: formatDate(date), time: formatTime(time), choice: null };

  let offset = 0;
  if (zoneText.toUpperCase() !== "Z") {
    const digits = zoneText.slice(1).replace(":", "");
    const hours = Number(digits.slice(0, 2));
    const minutes = Number(digits.slice(2) || 0);
    if (hours > 18 || minutes > 59) return null;
    offset = (zoneText.startsWith("-") ? -1 : 1) * (hours * 60 + minutes);
  }
  const instant = utcMs(date.year, date.month, date.day, time.hour, time.minute) - offset * MINUTE;
  const reading = readInstant(instant, zone);
  return { date: reading.date, time: reading.time, choice: occurrenceOf(reading) };
}

/**
 * Where the fields stand. Only `complete` carries an instant.
 *
 * `invalid` is text that is not a date or not a time; `incomplete` is one field
 * still empty; `ambiguous` is waiting for the person to say which one; `missing`
 * is a time the clocks skip.
 */
export type ZonedState = "empty" | "incomplete" | "invalid" | "ambiguous" | "missing" | "complete";

export interface ZonedOutcome {
  state: ZonedState;
  /** The instant, when and only when `state` is `complete`. */
  reading: ZonedReading | null;
  /**
   * Both readings, whenever the wall time happens twice. Still set once the
   * person has chosen, so the question stays on screen beside its answer.
   */
  ambiguous: { earlier: ZonedReading; later: ZonedReading } | null;
  /** The gap, when `state` is `missing`. */
  gap: ClockGap | null;
  /** Which field holds text that is not a date or a time, when `state` is `invalid`. */
  invalid: "date" | "time" | null;
}

const NOTHING: ZonedOutcome = {
  state: "empty",
  reading: null,
  ambiguous: null,
  gap: null,
  invalid: null,
};

/**
 * What the two fields mean right now. Pure, so the control can compute it on
 * every render and a test can compute it without one.
 *
 * Date only means the start of that day in the zone, and says so: there is no
 * time field to be ambiguous or missing in, and `startOfDay` already answers
 * the one day a year where midnight is not the start.
 */
export function evaluateFields(fields: ZonedFields, zone: string, dateOnly = false): ZonedOutcome {
  const dateText = fields.date.trim();
  const timeText = dateOnly ? "" : fields.time.trim();
  const date = dateText === "" ? null : parseDate(dateText);
  const time = timeText === "" ? null : parseTime(timeText);

  if (dateText !== "" && date === null) return { ...NOTHING, state: "invalid", invalid: "date" };
  if (timeText !== "" && time === null) return { ...NOTHING, state: "invalid", invalid: "time" };

  if (dateOnly) {
    if (date === null) return NOTHING;
    return { ...NOTHING, state: "complete", reading: startOfDay(date, zone) };
  }

  if (date === null && time === null) return NOTHING;
  if (date === null || time === null) return { ...NOTHING, state: "incomplete" };

  const resolved = resolveWallTime({ ...date, ...time }, zone);
  if (resolved.kind === "exact")
    return { ...NOTHING, state: "complete", reading: resolved.reading };
  if (resolved.kind === "missing") return { ...NOTHING, state: "missing", gap: resolved.gap };

  const both = { earlier: resolved.earlier, later: resolved.later };
  if (fields.choice === null) return { ...NOTHING, state: "ambiguous", ambiguous: both };
  return { ...NOTHING, state: "complete", reading: both[fields.choice], ambiguous: both };
}

/**
 * The fields after Arrow Up or Down, or Page Up or Down, in one of them; `null`
 * for any other key or for text that cannot be stepped.
 *
 * In the date field the arrows step a day and the page keys a month, keeping
 * the clock reading, so stepping across a change of zone moves the offset and
 * not the time somebody typed. In the time field the arrows step a minute and
 * the page keys an hour **of real time**: from 01:59 on the night the clocks go
 * forward the next minute is 03:00, and through the hour that happens twice
 * the steps walk the first 02:00 to 02:59 and then the second, with `choice`
 * following. Stepping wall time instead would land on a minute that does not
 * exist, and the keyboard would be the thing producing the error.
 *
 * An empty date steps to today in the zone and an empty time to 00:00, so the
 * keys start somewhere rather than doing nothing. Text that does not parse is
 * left alone, because overwriting what somebody typed with a guess is worse
 * than a key that does nothing.
 */
export function stepFields(
  fields: ZonedFields,
  part: "date" | "time",
  key: string,
  zone: string,
  nowMs: number,
): ZonedFields | null {
  const direction =
    key === "ArrowUp" || key === "PageUp" ? 1 : key === "ArrowDown" || key === "PageDown" ? -1 : 0;
  if (direction === 0) return null;
  const large = key === "PageUp" || key === "PageDown";

  const date = parseDate(fields.date);
  if (part === "date") {
    if (date === null) {
      if (fields.date.trim() !== "") return null;
      return { ...fields, date: readInstant(nowMs, zone).date, choice: null };
    }
    const next = large ? addMonths(date, direction) : addDays(date, direction);
    return { ...fields, date: formatDate(next), choice: null };
  }

  const time = parseTime(fields.time);
  if (time === null) {
    if (fields.time.trim() !== "") return null;
    return { ...fields, time: "00:00", choice: null };
  }
  const minutes = direction * (large ? 60 : 1);

  if (date === null) {
    // No date to anchor real time to, so the clock turns on its own face.
    const total = (((time.hour * 60 + time.minute + minutes) % 1440) + 1440) % 1440;
    return {
      ...fields,
      time: formatTime({ hour: Math.floor(total / 60), minute: total % 60 }),
      choice: null,
    };
  }

  const resolved = resolveWallTime({ ...date, ...time }, zone);
  let next: ZonedReading;
  if (resolved.kind === "missing") {
    // Out of the gap to the nearest minute that exists, in the key's direction.
    next =
      direction > 0
        ? resolved.gap.resumes
        : readInstant(resolved.gap.resumes.epochMs - MINUTE, zone);
  } else {
    const from =
      resolved.kind === "exact"
        ? resolved.reading
        : fields.choice === "later"
          ? resolved.later
          : resolved.earlier;
    next = readInstant(from.epochMs + minutes * MINUTE, zone);
  }
  return { date: next.date, time: next.time, choice: occurrenceOf(next) };
}

/**
 * The fields padded to their canonical width, for when focus leaves: `9:00`
 * becomes `09:00`. Text that does not parse is returned as typed.
 */
export function normaliseFields(fields: ZonedFields): ZonedFields {
  const date = parseDate(fields.date);
  const time = parseTime(fields.time);
  return {
    ...fields,
    date: date === null ? fields.date : formatDate(date),
    time: time === null ? fields.time : formatTime(time),
  };
}

/**
 * `href` with `param` set to the instant, or removed for "now".
 *
 * The plus of the offset is escaped, because an unescaped `+` in a query string
 * is a space to every server that reads it, and `2026-11-21T00:00:00 01:00` is
 * not an instant. The colons are left readable: they are legal in a query, and
 * this link is meant to be pasted into a ticket and read there.
 *
 * Pure, so a server component can build the link for the first render from the
 * request's own URL.
 */
export function hrefWithAt(href: string, at: string | null, param = "at"): string {
  const url = new URL(href);
  url.searchParams.delete(param);
  const rest = url.searchParams.toString();
  const own =
    at === null
      ? ""
      : `${encodeURIComponent(param)}=${encodeURIComponent(at).replace(/%3A/gi, ":")}`;
  url.search = [rest, own].filter((part) => part !== "").join("&");
  return url.href;
}
