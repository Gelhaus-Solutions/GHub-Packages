/**
 * `ZonedDateTime` and `AsOf` on the server, where there is no `window`.
 *
 * Both are client components and both are still rendered once on the server
 * for the first paint, so anything that reaches for the clock, the location or
 * the document during render breaks the page before a person sees it. The
 * jsdom suites cannot see that, because jsdom supplies all three. This file
 * runs in node, where none of them exist.
 *
 * It also pins the structure sheet 09 names and a string can show: the zone is
 * an `output` and not a field, and the date at Now is in the markup, hidden.
 */

import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AsOf } from "./modern/as-of.js";
import { ZonedDateTime } from "./modern/zoned-date-time.js";
import type { ZonedReading } from "./modern/zoned-time.js";

function render(node: ReactNode): string {
  return renderToStaticMarkup(node as never);
}

const said = (reading: ZonedReading) => `${reading.abbreviation} ${reading.offset}`;

describe("ZonedDateTime on the server", () => {
  const html = render(
    createElement(ZonedDateTime, {
      label: "In force from",
      hint: "Europe/Berlin.",
      dateLabel: "Date",
      timeLabel: "Time",
      defaultValue: "2026-11-26T09:00:00+01:00",
      ambiguousLegend: (time: string) => `${time} happens twice that night. Which one?`,
      ambiguousFirst: (reading: ZonedReading) => `The first, ${said(reading)}`,
      ambiguousSecond: (reading: ZonedReading) => `The second, ${said(reading)}`,
      missingHour: () => "does not exist",
    }),
  );

  it("renders with no window, the typed fields filled from the value", () => {
    expect(typeof globalThis.window).toBe("undefined");
    expect(html).toContain('value="2026-11-26"');
    expect(html).toContain('value="09:00"');
  });

  it("shows the zone in an output and has exactly two fields to type into", () => {
    expect(html).toMatch(/<output[^>]*>CET \+01:00<\/output>/);
    expect(html.match(/<input(?![^>]*type="hidden")[^>]*>/g) ?? []).toHaveLength(2);
  });

  it("asks nothing when the hour happens once", () => {
    expect(html).not.toContain("<fieldset");
  });
});

describe("AsOf on the server", () => {
  const props = {
    label: "Standings as of",
    nowLabel: "Now",
    dateLabel: "A date",
    fieldLabel: "Date",
    nowText: "Now is 16 Oct 2026, 11:04 CEST",
    startOfDay: (reading: ZonedReading) => `from ${reading.time} ${reading.abbreviation}`,
    announcement: () => "",
    onCommit: () => {},
  };

  it("renders a date from ?at= with its start in words", () => {
    const html = render(
      createElement(AsOf, { ...props, defaultValue: "2026-11-21T00:00:00+01:00" }),
    );
    expect(html).toContain('value="2026-11-21"');
    expect(html).toContain("from 00:00 CET");
    expect(html).not.toContain("Now is");
  });

  it("keeps the field in the markup at Now, hidden", () => {
    const html = render(createElement(AsOf, { ...props, defaultValue: null }));
    expect(html).toContain("Now is 16 Oct 2026, 11:04 CEST");
    expect(html).toMatch(/<div hidden="">.*<input[^>]*aria-labelledby/);
  });
});
