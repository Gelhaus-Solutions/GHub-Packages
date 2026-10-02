/**
 * The zone arithmetic under `ZonedDateTime` and `AsOf`, tested where it lives.
 *
 * Every date here is one the design draws or one either side of a Berlin
 * change of clocks in 2026 and 2027, because those are the minutes where an
 * offset computed from a rule and an offset read from the zone database part
 * company. Instants are written as UTC so the expectation does not depend on
 * the arithmetic it is checking.
 *
 * The package pins `TZ=UTC` for its tests. Nothing here should care: the module
 * never reads the host zone. That was checked by running this file under
 * `TZ=America/Los_Angeles` and `TZ=Pacific/Kiritimati` as well, with the same
 * result, rather than by reading the code and believing it.
 */

import { describe, expect, it } from "vitest";
import {
  addMonths,
  evaluateFields,
  fieldsFromIso,
  formatOffset,
  hrefWithAt,
  normaliseFields,
  offsetAt,
  parseDate,
  parseTime,
  readInstant,
  resolveWallTime,
  startOfDay,
  stepFields,
  type ZonedFields,
} from "./modern/zoned-time.js";

const BERLIN = "Europe/Berlin";
const at = (iso: string): number => Date.parse(iso);
const MINUTE = 60_000;

describe("offsets across both Berlin changes in 2026 and 2027", () => {
  /*
   * The four changes, as the instant the clocks move. Europe changes at 01:00
   * UTC on the last Sunday of March and of October.
   */
  const changes = [
    { name: "29 Mar 2026, forward", instant: "2026-03-29T01:00:00Z", before: 60, after: 120 },
    { name: "25 Oct 2026, back", instant: "2026-10-25T01:00:00Z", before: 120, after: 60 },
    { name: "28 Mar 2027, forward", instant: "2027-03-28T01:00:00Z", before: 60, after: 120 },
    { name: "31 Oct 2027, back", instant: "2027-10-31T01:00:00Z", before: 120, after: 60 },
  ];

  for (const change of changes) {
    it(`moves at exactly the minute on ${change.name}`, () => {
      const instant = at(change.instant);
      expect(offsetAt(instant - MINUTE, BERLIN)).toBe(change.before);
      expect(offsetAt(instant, BERLIN)).toBe(change.after);
    });
  }

  it("names winter CET +01:00 and summer CEST +02:00", () => {
    const winter = readInstant(at("2026-11-19T23:00:00Z"), BERLIN);
    expect(winter).toMatchObject({
      date: "2026-11-20",
      time: "00:00",
      abbreviation: "CET",
      offset: "+01:00",
      offsetMinutes: 60,
      iso: "2026-11-20T00:00:00+01:00",
    });

    const summer = readInstant(at("2027-07-01T07:00:00Z"), BERLIN);
    expect(summer).toMatchObject({
      date: "2027-07-01",
      time: "09:00",
      abbreviation: "CEST",
      offset: "+02:00",
      iso: "2027-07-01T09:00:00+02:00",
    });
  });

  it("reads the zone it is given rather than Berlin", () => {
    /*
     * The zone is a prop. If anything quietly assumed Berlin this would read
     * CET; New York on its own autumn change is EDT then EST.
     */
    const resolved = resolveWallTime(
      { year: 2026, month: 11, day: 1, hour: 1, minute: 30 },
      "America/New_York",
    );
    expect(resolved.kind).toBe("ambiguous");
    if (resolved.kind !== "ambiguous") return;
    expect(resolved.earlier.iso).toBe("2026-11-01T01:30:00-04:00");
    expect(resolved.later.iso).toBe("2026-11-01T01:30:00-05:00");
    expect(resolved.earlier.abbreviation).toBe("EDT");
    expect(resolved.later.abbreviation).toBe("EST");
  });

  it("writes offsets signed, padded, and never as Z", () => {
    expect(formatOffset(60)).toBe("+01:00");
    expect(formatOffset(0)).toBe("+00:00");
    expect(formatOffset(-300)).toBe("-05:00");
    expect(formatOffset(330)).toBe("+05:30");
  });
});

describe("the hour that happens twice: 25 Oct 2026, 02:30", () => {
  it("has two instants, the first in CEST and the second in CET", () => {
    const resolved = resolveWallTime(
      { year: 2026, month: 10, day: 25, hour: 2, minute: 30 },
      BERLIN,
    );
    expect(resolved.kind).toBe("ambiguous");
    if (resolved.kind !== "ambiguous") return;
    expect(resolved.earlier).toMatchObject({
      iso: "2026-10-25T02:30:00+02:00",
      abbreviation: "CEST",
      offset: "+02:00",
    });
    expect(resolved.later).toMatchObject({
      iso: "2026-10-25T02:30:00+01:00",
      abbreviation: "CET",
      offset: "+01:00",
    });
    expect(resolved.later.epochMs - resolved.earlier.epochMs).toBe(60 * MINUTE);
  });

  it("is ambiguous from 02:00 to 02:59 and nowhere either side", () => {
    const kind = (hour: number, minute: number) =>
      resolveWallTime({ year: 2026, month: 10, day: 25, hour, minute }, BERLIN).kind;
    expect(kind(1, 59)).toBe("exact");
    expect(kind(2, 0)).toBe("ambiguous");
    expect(kind(2, 59)).toBe("ambiguous");
    expect(kind(3, 0)).toBe("exact");
  });

  it("emits nothing until somebody says which one, then that one", () => {
    const fields: ZonedFields = { date: "2026-10-25", time: "02:30", choice: null };
    const asked = evaluateFields(fields, BERLIN);
    expect(asked.state).toBe("ambiguous");
    expect(asked.reading).toBeNull();

    const second = evaluateFields({ ...fields, choice: "later" }, BERLIN);
    expect(second.state).toBe("complete");
    expect(second.reading?.iso).toBe("2026-10-25T02:30:00+01:00");
    // The question stays on screen beside its answer.
    expect(second.ambiguous).not.toBeNull();
  });

  it("does the same on 31 Oct 2027", () => {
    const resolved = resolveWallTime(
      { year: 2027, month: 10, day: 31, hour: 2, minute: 30 },
      BERLIN,
    );
    expect(resolved.kind).toBe("ambiguous");
  });
});

describe("the hour that never happens: 28 Mar 2027, 02:30", () => {
  it("does not exist, and says from when and to when the clocks jump", () => {
    const resolved = resolveWallTime(
      { year: 2027, month: 3, day: 28, hour: 2, minute: 30 },
      BERLIN,
    );
    expect(resolved.kind).toBe("missing");
    if (resolved.kind !== "missing") return;
    expect(resolved.gap).toMatchObject({
      date: "2027-03-28",
      time: "02:30",
      zone: BERLIN,
      from: "02:00",
    });
    expect(resolved.gap.resumes).toMatchObject({
      time: "03:00",
      abbreviation: "CEST",
      iso: "2027-03-28T03:00:00+02:00",
    });
  });

  it("is missing from 02:00 to 02:59 and nowhere either side, in 2026 too", () => {
    for (const year of [2026, 2027]) {
      const day = year === 2026 ? 29 : 28;
      const kind = (hour: number, minute: number) =>
        resolveWallTime({ year, month: 3, day, hour, minute }, BERLIN).kind;
      expect(kind(1, 59)).toBe("exact");
      expect(kind(2, 0)).toBe("missing");
      expect(kind(2, 59)).toBe("missing");
      expect(kind(3, 0)).toBe("exact");
    }
  });

  it("emits nothing for it", () => {
    const outcome = evaluateFields({ date: "2027-03-28", time: "02:30", choice: null }, BERLIN);
    expect(outcome.state).toBe("missing");
    expect(outcome.reading).toBeNull();
    expect(outcome.gap?.resumes.time).toBe("03:00");
  });
});

describe("what the fields emit", () => {
  it("is ISO 8601 with seconds and the offset", () => {
    const outcome = evaluateFields({ date: "2026-11-20", time: "00:00", choice: null }, BERLIN);
    expect(outcome.reading?.iso).toBe("2026-11-20T00:00:00+01:00");
    expect(
      evaluateFields({ date: "2026-11-26", time: "09:00", choice: null }, BERLIN).reading?.iso,
    ).toBe("2026-11-26T09:00:00+01:00");
  });

  it("is nothing while a field is empty or holds something that is not a date or time", () => {
    expect(evaluateFields({ date: "", time: "", choice: null }, BERLIN).state).toBe("empty");
    expect(evaluateFields({ date: "2026-11-20", time: "", choice: null }, BERLIN).state).toBe(
      "incomplete",
    );
    const badDate = evaluateFields({ date: "2026-13-01", time: "09:00", choice: null }, BERLIN);
    expect(badDate).toMatchObject({ state: "invalid", invalid: "date", reading: null });
    const badTime = evaluateFields({ date: "2026-11-20", time: "25:00", choice: null }, BERLIN);
    expect(badTime).toMatchObject({ state: "invalid", invalid: "time", reading: null });
  });

  it("means the start of that day when it is a date only", () => {
    const outcome = evaluateFields({ date: "2026-11-21", time: "", choice: null }, BERLIN, true);
    expect(outcome.reading?.iso).toBe("2026-11-21T00:00:00+01:00");
    expect(outcome.reading?.abbreviation).toBe("CET");
    expect(startOfDay({ year: 2026, month: 10, day: 25 }, BERLIN).iso).toBe(
      "2026-10-25T00:00:00+02:00",
    );
  });

  it("checks the calendar, not just the shape", () => {
    expect(parseDate("2028-02-29")).toEqual({ year: 2028, month: 2, day: 29 });
    expect(parseDate("2027-02-29")).toBeNull();
    expect(parseDate("2026-04-31")).toBeNull();
    expect(parseDate("0999-01-01")).toBeNull();
    expect(parseDate("2026-1-5")).toEqual({ year: 2026, month: 1, day: 5 });
    expect(parseTime("24:00")).toBeNull();
    expect(parseTime("9:00")).toEqual({ hour: 9, minute: 0 });
    expect(parseTime("0930")).toEqual({ hour: 9, minute: 30 });
    expect(parseTime("09:60")).toBeNull();
  });

  it("pads what was typed loosely once focus leaves", () => {
    expect(normaliseFields({ date: "2026-1-5", time: "9:00", choice: null })).toEqual({
      date: "2026-01-05",
      time: "09:00",
      choice: null,
    });
    expect(normaliseFields({ date: "nonsense", time: "", choice: null }).date).toBe("nonsense");
  });
});

describe("a pasted ISO string", () => {
  it("fills both fields with the instant as Berlin reads it", () => {
    expect(fieldsFromIso("2026-11-20T00:00:00+01:00", BERLIN)).toEqual({
      date: "2026-11-20",
      time: "00:00",
      choice: null,
    });
    // The same instant written in UTC lands on the same Berlin fields.
    expect(fieldsFromIso("2026-11-19T23:00:00Z", BERLIN)).toEqual({
      date: "2026-11-20",
      time: "00:00",
      choice: null,
    });
    expect(fieldsFromIso("  2026-11-26T09:00+0100 ", BERLIN)).toEqual({
      date: "2026-11-26",
      time: "09:00",
      choice: null,
    });
  });

  it("carries which of the twice-happening hours the offset named", () => {
    expect(fieldsFromIso("2026-10-25T02:30:00+02:00", BERLIN)?.choice).toBe("earlier");
    expect(fieldsFromIso("2026-10-25T02:30:00+01:00", BERLIN)?.choice).toBe("later");
    expect(fieldsFromIso("2026-10-25T01:30:00Z", BERLIN)).toEqual({
      date: "2026-10-25",
      time: "02:30",
      choice: "later",
    });
  });

  it("takes a time with no offset as a Berlin clock reading and leaves the question open", () => {
    expect(fieldsFromIso("2026-10-25T02:30", BERLIN)).toEqual({
      date: "2026-10-25",
      time: "02:30",
      choice: null,
    });
  });

  it("returns a bare date with no time, and refuses what it cannot show", () => {
    expect(fieldsFromIso("2026-11-20", BERLIN)).toEqual({
      date: "2026-11-20",
      time: null,
      choice: null,
    });
    expect(fieldsFromIso("2026-02-30T10:00:00+01:00", BERLIN)).toBeNull();
    expect(fieldsFromIso("2026-11-20T10:00:30+01:00", BERLIN)).toBeNull();
    expect(fieldsFromIso("20 Nov 2026", BERLIN)).toBeNull();
    expect(fieldsFromIso("2026-11-20T10:00:00+25:00", BERLIN)).toBeNull();
  });
});

describe("stepping with the keys", () => {
  const now = at("2026-10-16T09:04:00Z");
  const step = (fields: ZonedFields, part: "date" | "time", key: string) =>
    stepFields(fields, part, key, BERLIN, now);

  it("steps a day with the arrows and a month with the page keys, keeping the clock", () => {
    const fields: ZonedFields = { date: "2026-10-24", time: "09:00", choice: null };
    expect(step(fields, "date", "ArrowUp")?.date).toBe("2026-10-25");
    expect(step(fields, "date", "ArrowDown")?.date).toBe("2026-10-23");
    expect(step(fields, "date", "PageUp")?.date).toBe("2026-11-24");
    expect(step(fields, "date", "PageDown")?.date).toBe("2026-09-24");
    // The clock reading stays and the offset moves under it.
    const moved = step(fields, "date", "ArrowUp");
    expect(moved?.time).toBe("09:00");
    expect(evaluateFields(moved as ZonedFields, BERLIN).reading?.offset).toBe("+01:00");
  });

  it("keeps a month step inside the month", () => {
    expect(addMonths({ year: 2027, month: 1, day: 31 }, 1)).toEqual({
      year: 2027,
      month: 2,
      day: 28,
    });
    expect(addMonths({ year: 2026, month: 12, day: 15 }, 1)).toEqual({
      year: 2027,
      month: 1,
      day: 15,
    });
  });

  it("steps a minute and an hour of real time, through the hour that happens twice", () => {
    const first = step({ date: "2026-10-25", time: "02:59", choice: "earlier" }, "time", "ArrowUp");
    expect(first).toEqual({ date: "2026-10-25", time: "02:00", choice: "later" });
    const hour = step({ date: "2026-10-25", time: "01:30", choice: null }, "time", "PageUp");
    expect(hour).toEqual({ date: "2026-10-25", time: "02:30", choice: "earlier" });
  });

  it("steps over the hour that never happens rather than into it", () => {
    expect(step({ date: "2027-03-28", time: "01:59", choice: null }, "time", "ArrowUp")).toEqual({
      date: "2027-03-28",
      time: "03:00",
      choice: null,
    });
    expect(step({ date: "2027-03-28", time: "01:30", choice: null }, "time", "PageUp")?.time).toBe(
      "03:30",
    );
    // From inside the gap, out to the nearest minute that exists.
    expect(step({ date: "2027-03-28", time: "02:30", choice: null }, "time", "ArrowUp")?.time).toBe(
      "03:00",
    );
    expect(
      step({ date: "2027-03-28", time: "02:30", choice: null }, "time", "ArrowDown")?.time,
    ).toBe("01:59");
  });

  it("carries the day when the minutes roll over midnight", () => {
    expect(step({ date: "2026-12-31", time: "23:59", choice: null }, "time", "ArrowUp")).toEqual({
      date: "2027-01-01",
      time: "00:00",
      choice: null,
    });
  });

  it("starts an empty date at today in the zone, and leaves typed text it cannot read alone", () => {
    expect(step({ date: "", time: "", choice: null }, "date", "ArrowUp")?.date).toBe("2026-10-16");
    expect(step({ date: "", time: "", choice: null }, "time", "ArrowUp")?.time).toBe("00:00");
    expect(step({ date: "2026-1x", time: "", choice: null }, "date", "ArrowUp")).toBeNull();
    expect(step({ date: "2026-10-24", time: "09:00", choice: null }, "date", "Enter")).toBeNull();
  });
});

describe("the link", () => {
  it("writes the instant into ?at= with the plus escaped and the colons readable", () => {
    expect(
      hrefWithAt("https://terms.example/staff/people/a@b.c?tab=x", "2026-11-21T00:00:00+01:00"),
    ).toBe("https://terms.example/staff/people/a@b.c?tab=x&at=2026-11-21T00:00:00%2B01:00");
  });

  it("removes ?at= for now, and keeps everything else", () => {
    expect(hrefWithAt("https://terms.example/p?at=2026-11-21T00:00:00%2B01:00&tab=x", null)).toBe(
      "https://terms.example/p?tab=x",
    );
    expect(hrefWithAt("https://terms.example/p?at=x", null)).toBe("https://terms.example/p");
  });

  it("round-trips through URLSearchParams to the same instant", () => {
    const href = hrefWithAt("https://terms.example/p", "2026-11-21T00:00:00+01:00");
    expect(new URL(href).searchParams.get("at")).toBe("2026-11-21T00:00:00+01:00");
  });
});
