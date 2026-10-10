/**
 * The case blocks drawn for GPlatform Legal's Compliance area (K6 to K10):
 * ClockLine, LifecycleStepper, NextStep and LinkPage rendered, and their
 * contracts asserted. CaseTimeline's filters are exercised in its own
 * interaction file; its markup is pinned here.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CaseTimeline,
  ClockLine,
  LifecycleStepper,
  LINK_PAGE_PRIMARY,
  LinkPage,
  NextStep,
  type TimelineEntry,
} from "./modern/index.js";

function render(node: unknown): string {
  return renderToStaticMarkup(node as never);
}

describe("ClockLine", () => {
  const html = render(
    createElement(ClockLine, {
      label: "Clocks",
      clocks: [
        {
          key: "a",
          label: "Gitroom Limited answers",
          basis: "Contract: 5 working days from forwarding",
          due: "12 Oct 2026",
          level: "warn",
          word: "Due today",
        },
        {
          key: "b",
          label: "Tell the authority",
          due: null,
          level: "idle",
          word: "Starts when forwarded",
        },
      ],
    }),
  );

  it("is a named list, one row per clock, label first", () => {
    expect(html).toMatch(/^<ul aria-label="Clocks"/);
    expect(html.match(/<li /g)).toHaveLength(2);
    expect(html.indexOf("Gitroom Limited answers")).toBeLessThan(html.indexOf("12 Oct 2026"));
  });

  it("carries the state as a word in a pill, never colour alone", () => {
    expect(html).toContain("Due today");
    expect(html).toContain("text-m-warn-ink");
  });

  it("says a clock has not started rather than inventing a date", () => {
    expect(html).toContain("not started");
  });
});

describe("LifecycleStepper", () => {
  const html = render(
    createElement(LifecycleStepper, {
      steps: [
        { key: "1", label: "Proposed", state: "done", at: "5 Oct" },
        { key: "2", label: "Window to object", state: "now", sub: "ends 20 Oct" },
        { key: "3", label: "Live", state: "next" },
        { key: "4", label: "Objected", state: "stop", sub: "Objected" },
      ],
    }),
  );

  it("is an ordered list with the current step marked", () => {
    expect(html).toMatch(/^<ol aria-label="Steps"/);
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  });

  it("shows a check, a number or a cross, so state is never colour alone", () => {
    expect(html).toContain("m5 12 5 5L20 7");
    expect(html).toContain("M18 6 6 18M6 6l12 12");
    expect(html).toMatch(/>2<\/span>/);
    expect(html).toMatch(/>3<\/span>/);
  });

  it("fills the track to the last step reached", () => {
    // Four steps, the last one reached is the fourth (a stop): the fill runs
    // the whole inset track, three quarters of the width.
    expect(html).toContain("width:75%");
    expect(html).toContain("left:12.5%");
  });
});

describe("NextStep", () => {
  it("is a region named by its step, with the label above it in the tone's ink", () => {
    const html = render(
      createElement(NextStep, {
        tone: "crit",
        label: "Gitroom LLC is late",
        step: "Approve the reminder to Gitroom LLC",
        children: "The reminder goes in the language the company asked for.",
        others: [createElement("a", { href: "#x" }, "Record an extension")],
      }),
    );
    expect(html).toMatch(/^<section aria-labelledby="([^"]+)"[^>]*>.*<h2 id="\1"/);
    expect(html).toContain("text-m-crit-ink");
    expect(html).toContain("Other steps");
  });

  it("puts the clock in a timer and its used share in a bar", () => {
    const html = render(
      createElement(NextStep, {
        label: "Waiting on Gitroom Limited",
        step: "Record Gitroom Limited's answer when it comes",
        clock: {
          label: "answer due in",
          value: "14 h 00 min",
          at: "12 Oct 2026, 24:00 CEST",
          used: { share: 0.8, text: "4 of 5 working days used" },
          level: "warn",
        },
      }),
    );
    expect(html).toMatch(/<p role="timer"[^>]*>14 h 00 min<\/p>/);
    expect(html).toContain("width:80%");
  });

  it("reports background work as a progressbar with a polite line", () => {
    const html = render(
      createElement(NextStep, {
        label: "Running in the background",
        step: "Collecting",
        progress: { done: 3, of: 5, label: "3 of 5 parts done" },
      }),
    );
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="3"');
    expect(html).toContain('<p role="status"');
  });
});

describe("CaseTimeline", () => {
  const ENTRIES: TimelineEntry[] = [
    {
      key: "1",
      at: "2026-10-03T08:12:00Z",
      atText: "3 Oct, 10:12 CEST",
      kind: "link",
      what: "Mailbox confirmed",
    },
    {
      key: "2",
      at: "2026-10-05T07:30:00Z",
      atText: "5 Oct, 09:30 CEST",
      kind: "mail",
      what: "Forwarded",
      status: { level: "ok", word: "Accepted" },
    },
    {
      key: "3",
      at: "2026-10-10T00:00:00Z",
      atText: "10 Oct, 00:00 CEST",
      kind: "alert",
      what: "The answer became late",
      category: "Clock",
    },
  ];

  function timeline(order: "newest" | "oldest", show: "all" | "steps" | "mail" | "files") {
    return render(
      createElement(CaseTimeline, {
        entries: ENTRIES,
        order,
        show,
        onOrderChange: () => undefined,
        onShowChange: () => undefined,
      }),
    );
  }

  it("is an ordered list with the time first, newest first when asked", () => {
    const html = timeline("newest", "all");
    expect(html).toContain('<ol aria-label="Timeline"');
    expect(html.indexOf("The answer became late")).toBeLessThan(html.indexOf("Mailbox confirmed"));
    expect(html).toContain('<time dateTime="2026-10-10T00:00:00Z"');
  });

  it("filters by family: a link counts as mail", () => {
    const html = timeline("oldest", "mail");
    expect(html).toContain("Mailbox confirmed");
    expect(html).toContain("Forwarded");
    expect(html).not.toContain("The answer became late");
  });

  it("says so when a family is empty rather than drawing an empty list", () => {
    expect(timeline("newest", "files")).toContain("Nothing of this kind yet.");
  });
});

describe("LinkPage", () => {
  const base = {
    lang: "de",
    brand: "Gelhaus Solutions",
    reference: "REQ-2026-0007",
    title: "Ihre Anfrage",
    languages: [
      { code: "de", label: "DE", href: "?lang=de", current: true },
      { code: "en", label: "EN", href: "?lang=en", current: false },
    ],
    action: {
      title: "Antworten",
      means: ["Ihre Antwort wird mit Zeit und Adresse aufgezeichnet."],
      submit: createElement("button", { type: "submit", className: LINK_PAGE_PRIMARY }, "Senden"),
    },
    assurance: "Das Öffnen dieser Seite hat nichts verändert.",
  };

  it("reads in the reader's language, with the others one tap away", () => {
    const html = render(createElement(LinkPage, base));
    expect(html).toMatch(/^<div lang="de"/);
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('hrefLang="en"');
    expect(html).toContain("Senden");
    expect(html).toContain("Das Öffnen dieser Seite hat nichts verändert.");
  });

  it("drops the form once there is an outcome, and keeps the title and reference", () => {
    const html = render(
      createElement(LinkPage, {
        ...base,
        outcome: { level: "warn", title: "Dieser Link ist abgelaufen" },
      }),
    );
    expect(html).not.toContain("Senden");
    expect(html).toContain("REQ-2026-0007");
    expect(html).toContain("Ihre Anfrage");
    expect(html).toContain('role="status"');
  });
});
