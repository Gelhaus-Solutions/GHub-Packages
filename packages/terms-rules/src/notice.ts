/**
 * Six weeks and a day: the notice a version that supersedes another is owed.
 *
 * A day more than six weeks, because a daily notice job may send a day after
 * the announcement and the six weeks run from the mail, not from the date
 * somebody typed. gctl-terms tested 42 days for every superseding version and
 * 43 for its one rollout; 43 is the rule that rollout was written to.
 *
 * Read two ways, and the later wins (decided 2026-10-02). Forty-three days
 * of 24 hours, which is what a stopwatch says; and the same wall-clock time in
 * Europe/Berlin 43 calendar days later, which is what a person reading the
 * notice says ("announced 14 Oct, 09:00; in force 26 Nov, 09:00"). Across the
 * autumn change the clock reading is an hour longer, and across the spring
 * change it is an hour shorter, so taking the later of the two never gives
 * less than 43 full days and never lands earlier on the clock than the
 * announcement did.
 */

export const SUPERSEDING_NOTICE_DAYS = 43;

const DAY_MS = 24 * 60 * 60 * 1000;
const ZONE = "Europe/Berlin";

const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

interface Wall {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

/** The Berlin wall clock at an instant. */
function wallAt(instant: number): Wall {
  const read: Record<string, number> = {};
  for (const part of PARTS.formatToParts(new Date(instant))) {
    if (part.type !== "literal") read[part.type] = Number(part.value);
  }
  return {
    year: read["year"] as number,
    month: read["month"] as number,
    day: read["day"] as number,
    hour: read["hour"] as number,
    minute: read["minute"] as number,
    second: read["second"] as number,
    millisecond: ((instant % 1000) + 1000) % 1000,
  };
}

/** The wall clock's fields as if they were UTC: a number to compare and shift. */
function asUtc(wall: Wall): number {
  const date = new Date(0);
  date.setUTCFullYear(wall.year, wall.month - 1, wall.day);
  date.setUTCHours(wall.hour, wall.minute, wall.second, wall.millisecond);
  return date.getTime();
}

/**
 * The instant Berlin's clock shows `wall`. Where it shows it twice (the hour
 * the clocks go back) the later; where it never shows it (the hour they go
 * forward) the instant an hour on, which the clock shows as the hour after.
 * Berlin is an hour or two ahead of UTC, so those are the only candidates.
 */
function instantAtWall(wall: Wall): number {
  const local = asUtc(wall);
  const shown = [local - 2 * 60 * 60 * 1000, local - 60 * 60 * 1000].filter(
    (candidate) => asUtc(wallAt(candidate)) === local,
  );
  return shown.length === 0 ? local - 60 * 60 * 1000 : Math.max(...shown);
}

/** The same Berlin wall-clock time `days` calendar days after `instant`. */
export function sameClockTimeLater(instant: number, days: number): number {
  const wall = wallAt(instant);
  const shifted = new Date(asUtc(wall) + days * DAY_MS);
  return instantAtWall({
    ...wall,
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}

/** In milliseconds: the earliest a superseding version announced at
 *  `announced` may come into force. See the module comment. */
export function earliestInForceAt(announced: number): number {
  return Math.max(
    announced + SUPERSEDING_NOTICE_DAYS * DAY_MS,
    sameClockTimeLater(announced, SUPERSEDING_NOTICE_DAYS),
  );
}

/**
 * The earliest a version that supersedes another may come into force, given
 * when it is announced: six weeks and a day, read both ways, the later taken.
 */
export function earliestInForceFrom(announcedAt: Date): Date {
  const at = announcedAt.getTime();
  if (Number.isNaN(at)) throw new RangeError("announcedAt is not a valid date");
  return new Date(earliestInForceAt(at));
}
