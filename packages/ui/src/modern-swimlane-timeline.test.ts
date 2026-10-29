// @vitest-environment jsdom

/**
 * SwimlaneTimeline on a first pass: GFabric's engine started at 20:05, four
 * systems failed their first read, and the pass a minute later raised sixteen
 * findings. Over a three-hour range those are one spot on the strip, and drawn
 * one by one they buried every label under the next. They are one group now,
 * and a one-minute stretch is a sliver rather than a pill over the next bar.
 */

import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  groupEvents,
  SwimlaneTimeline,
  type SwimlaneEvent,
  type SwimlaneLevel,
} from "./modern/swimlane-timeline.js";

afterEach(cleanup);

const START = "2026-10-29T16:36:00.000Z";
const END = "2026-10-29T19:36:00.000Z";

const event = (
  key: string,
  minute: string,
  level: SwimlaneLevel,
  label: string,
): SwimlaneEvent => ({
  key,
  at: `2026-10-29T${minute}:00.000Z`,
  time: minute,
  level,
  label,
});

const FIRST_PASS: SwimlaneEvent[] = [
  event("f1", "19:05", "crit", "adguard could not be read"),
  event("f2", "19:05", "crit", "ucg-fiber could not be read"),
  event("r1", "19:05", "info", "First run of cloudflare"),
  ...Array.from({ length: 16 }, (_, i) => event(`n${i}`, "19:06", "warn", `Finding ${i}`)),
  event("a1", "19:06", "ok", "adguard read again"),
  event("h1", "19:08", "ok", "hurricane read again"),
  event("p1", "19:23", "crit", "pve-cluster could not be read"),
  event("p2", "19:28", "ok", "pve-cluster read again"),
];

describe("groupEvents", () => {
  it("draws a first pass as one group led by its first most severe event", () => {
    const groups = groupEvents(FIRST_PASS, START, END);
    expect(groups.map((g) => [g.lead.key, g.events.length])).toEqual([
      ["f1", 20],
      ["h1", 1],
      ["p1", 1],
      ["p2", 1],
    ]);
  });

  it("measures from a group's first event, so close events do not chain across the strip", () => {
    // One event every 1.8 minutes over 180: a step of 1 per cent of the strip.
    const steps = Array.from({ length: 5 }, (_, i) => ({
      key: `s${i}`,
      at: new Date(Date.parse(START) + i * 108_000).toISOString(),
      level: "info" as const,
    }));
    expect(groupEvents(steps, START, END).map((g) => g.events.map((e) => e.key))).toEqual([
      ["s0", "s1"],
      ["s2", "s3"],
      ["s4"],
    ]);
  });
});

describe("SwimlaneTimeline", () => {
  const draw = (watchedFrom?: string) =>
    render(
      createElement(SwimlaneTimeline, {
        start: START,
        end: END,
        now: END,
        ...(watchedFrom === undefined ? {} : { watchedFrom }),
        events: FIRST_PASS,
        lanes: [
          {
            key: "prefix",
            label: "Prefix",
            bars: [
              {
                key: "b1",
                from: "2026-10-29T19:05:00.000Z",
                to: "2026-10-29T19:06:00.000Z",
                level: "ok",
                label: "Clear",
                span: "20:05 to 20:06",
              },
              {
                key: "b2",
                from: "2026-10-29T19:06:00.000Z",
                to: END,
                level: "crit",
                label: "Old /56 still held",
                span: "20:06 to now",
              },
            ],
          },
        ],
        ticks: [],
        labels: {
          events: "Events",
          now: "now 20:36",
          eventList: "Events",
          laneList: "Lanes",
          more: (count) => `and ${count} more`,
          unwatched: "Not watched before 20:05",
        },
      }),
    );

  it("labels a group with its lead and the count of the rest, and lists them all in its title", () => {
    const { container } = draw();
    const drawing = container.querySelector('[aria-hidden="true"]');
    expect(drawing?.textContent).toContain("adguard could not be read and 19 more");
    expect(drawing?.textContent).not.toContain("ucg-fiber could not be read");
    const group = [...(drawing?.querySelectorAll("[title]") ?? [])].find((el) =>
      el.getAttribute("title")?.includes("ucg-fiber"),
    );
    expect(group?.getAttribute("title")?.split("\n")).toHaveLength(20);
  });

  it("keeps every event in the list a screen reader gets", () => {
    const { container } = draw();
    expect(container.querySelectorAll(".sr-only ol li")).toHaveLength(FIRST_PASS.length);
  });

  it("draws a one-minute stretch as a sliver without words, and a long one with them", () => {
    const { container } = draw();
    const bars = [
      ...container.querySelectorAll(
        '[aria-hidden="true"] [title="Clear"], [aria-hidden="true"] [title="Old /56 still held"]',
      ),
    ];
    expect(bars.map((bar) => bar.textContent)).toEqual(["", "Old /56 still held"]);
  });

  it("hatches the stretch before watching began and says so, to the eye and the list", () => {
    const { container } = draw("2026-10-29T19:05:00.000Z");
    const drawing = container.querySelector('[aria-hidden="true"]');
    expect(drawing?.textContent).toContain("Not watched before 20:05");
    // The event row and the one lane, each from the left edge to 20:05: 149 of 180 minutes.
    const hatched = [...(drawing?.querySelectorAll<HTMLElement>(".left-0.inset-y-0") ?? [])].filter(
      (el) => el.textContent === "",
    );
    expect(hatched.map((el) => el.style.width)).toEqual(["82.78%", "82.78%"]);
    expect(container.querySelector(".sr-only p")?.textContent).toBe("Not watched before 20:05");
  });

  it("drops a tick the now pill would cover and keeps the others", () => {
    const { container } = render(
      createElement(SwimlaneTimeline, {
        start: START,
        end: END,
        now: END,
        events: [],
        lanes: [],
        ticks: ["18:00", "19:00", "19:30"].map((t) => ({
          at: `2026-10-29T${t}:00.000Z`,
          label: t,
        })),
        labels: { events: "Events", now: "now 20:36", eventList: "Events", laneList: "Lanes" },
      }),
    );
    const axis = container.querySelector(".font-mono.h-\\[22px\\]");
    expect([...(axis?.children ?? [])].map((el) => el.textContent)).toEqual([
      "18:00",
      "19:00",
      "now 20:36",
    ]);
  });

  it("draws no such stretch when watching began before the range", () => {
    const { container } = draw();
    expect(container.textContent).not.toContain("Not watched");
    expect(container.querySelectorAll('[aria-hidden="true"] .left-0.inset-y-0')).toHaveLength(0);
  });
});
