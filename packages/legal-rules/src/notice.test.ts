/**
 * Six weeks and a day, read both ways and the later taken (decided
 * 2026-10-02), at the instants the two readings part: across each clock
 * change in Europe/Berlin.
 */

import { describe, expect, it } from "vitest";
import { earliestInForceFrom, sameClockTimeLater } from "./notice.js";

const earliest = (announced: string) => earliestInForceFrom(new Date(announced)).toISOString();

describe("the earliest in-force date", () => {
  it("is the same clock time 43 days on across the autumn change, an hour more than 43 days", () => {
    // The drawn example: 14 Oct 2026, 09:00 CEST to 26 Nov 2026, 09:00 CET.
    expect(earliest("2026-10-14T09:00:00+02:00")).toBe("2026-11-26T08:00:00.000Z");
    // The first rollout: 8 Oct 00:00 CEST to 20 Nov 00:00 CET.
    expect(earliest("2026-10-08T00:00:00+02:00")).toBe("2026-11-19T23:00:00.000Z");
  });

  it("is 43 full days across the spring change, where the clock reading is an hour short", () => {
    // 1 Mar 2027, 09:00 CET: the clock says 13 Apr 09:00 CEST, which is 43
    // days less an hour; 43 days of 24 hours is 13 Apr 10:00 CEST.
    expect(earliest("2027-03-01T09:00:00+01:00")).toBe("2027-04-13T08:00:00.000Z");
  });

  it("is both readings at once with no change in between", () => {
    expect(earliest("2027-05-03T12:30:00+02:00")).toBe("2027-06-15T10:30:00.000Z");
  });

  it("keeps the milliseconds it was given", () => {
    expect(earliest("2026-10-14T09:00:00.250+02:00")).toBe("2026-11-26T08:00:00.250Z");
  });

  it("reads an hour the clock shows twice as its later instance, and one it skips as the hour after", () => {
    // 02:30 on 25 Oct 2026 happens twice in Berlin; 43 days back is 12 Sep.
    expect(
      new Date(sameClockTimeLater(Date.parse("2026-09-12T02:30:00+02:00"), 43)).toISOString(),
    ).toBe("2026-10-25T01:30:00.000Z");
    // 02:30 on 28 Mar 2027 never happens; 43 days back is 13 Feb.
    expect(
      new Date(sameClockTimeLater(Date.parse("2027-02-13T02:30:00+01:00"), 43)).toISOString(),
    ).toBe("2027-03-28T01:30:00.000Z");
  });

  it("refuses an instant that is not one", () => {
    expect(() => earliestInForceFrom(new Date("not a date"))).toThrow(RangeError);
  });
});
