// @vitest-environment jsdom

/**
 * DayStepper, in a document.
 *
 * The sheet's contract: on a date, the day before, a date field, the day
 * after, Today and Next date with changes. The field commits on Enter or blur,
 * never per keystroke, like AsOf. The stepping buttons are named "The day
 * before" and "The day after". One polite status per commit.
 *
 * VERIFIED BY MUTATION: committing from the field's change handler instead of
 * on Enter or blur turns this file red.
 */

import { act, cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createElement, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { DayStepper, type DayStepperProps } from "./modern/day-stepper.js";

afterEach(cleanup);

const LABELS = {
  before: "The day before",
  after: "The day after",
  today: "Today",
  next: "Next date with changes",
  field: "Day, as year, month and day",
  day: "Day",
};

/** The page owns `?day=`, and says one sentence once it has loaded the day. */
function Page({
  start = "2026-11-20",
  commits,
  next = "2026-12-01",
  extra = {},
}: {
  start?: string;
  commits: string[];
  next?: string | null;
  extra?: Partial<DayStepperProps>;
}) {
  const [day, setDay] = useState(start);
  return createElement(DayStepper, {
    day,
    onCommit: (to) => {
      commits.push(to);
      setDay(to);
    },
    labels: LABELS,
    today: "2026-10-03",
    next,
    caption: `${day}, 00:00 to 24:00, Europe/Berlin`,
    status: commits.length === 0 ? "" : `${day}: 9 versions come into force.`,
    invalid: "Type the day as YYYY-MM-DD, for example 2026-11-20.",
    ...extra,
  });
}

function field(): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>("textbox", { name: LABELS.field });
}

describe("the arrows", () => {
  it("are named in words and step one day, keeping focus on the arrow pressed", async () => {
    const user = userEvent.setup();
    const commits: string[] = [];
    render(createElement(Page, { commits }));

    const after = screen.getByRole("button", { name: "The day after" });
    after.focus();
    await user.keyboard("{Enter}");
    expect(commits).toEqual(["2026-11-21"]);
    expect(field().value).toBe("2026-11-21");
    expect(document.activeElement).toBe(after);

    const before = screen.getByRole("button", { name: "The day before" });
    await user.click(before);
    await user.click(before);
    expect(commits).toEqual(["2026-11-21", "2026-11-20", "2026-11-19"]);
  });

  it("cross a month and a year", async () => {
    const user = userEvent.setup();
    const commits: string[] = [];
    render(createElement(Page, { commits, start: "2026-12-31" }));
    await user.click(screen.getByRole("button", { name: "The day after" }));
    expect(commits).toEqual(["2027-01-01"]);
  });

  it("step from a typed day the blur just committed, not from the day before it", async () => {
    const user = userEvent.setup();
    const commits: string[] = [];
    render(createElement(Page, { commits }));
    await user.clear(field());
    await user.type(field(), "2026-11-25");
    await user.click(screen.getByRole("button", { name: "The day after" }));
    expect(commits).toEqual(["2026-11-25", "2026-11-26"]);
  });
});

describe("the field", () => {
  it("is labelled by the visible word and named in full, described by the caption", () => {
    render(createElement(Page, { commits: [] }));
    const input = field();
    expect(screen.getByText("Day").tagName).toBe("LABEL");
    expect(screen.getByText("Day").getAttribute("for")).toBe(input.id);
    const described = (input.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent);
    expect(described).toEqual(["2026-11-20, 00:00 to 24:00, Europe/Berlin"]);
  });

  it("commits nothing while typing, and once on Enter", async () => {
    const user = userEvent.setup();
    const commits: string[] = [];
    render(createElement(Page, { commits }));
    await user.clear(field());
    await user.type(field(), "2026-12-24");
    expect(commits).toEqual([]);
    await user.keyboard("{Enter}");
    expect(commits).toEqual(["2026-12-24"]);
  });

  it("commits on blur, written back padded", async () => {
    const user = userEvent.setup();
    const commits: string[] = [];
    render(createElement(Page, { commits }));
    await user.clear(field());
    await user.type(field(), "2026-1-5");
    await user.tab();
    expect(commits).toEqual(["2026-01-05"]);
    expect(field().value).toBe("2026-01-05");
  });

  it("commits nothing for the day it already shows", async () => {
    const user = userEvent.setup();
    const commits: string[] = [];
    render(createElement(Page, { commits }));
    field().focus();
    await user.keyboard("{Enter}");
    await user.tab();
    expect(commits).toEqual([]);
  });

  it("keeps text that is not a date for correcting, marks it, says why, and commits nothing", async () => {
    const user = userEvent.setup();
    const commits: string[] = [];
    render(createElement(Page, { commits }));
    await user.clear(field());
    await user.type(field(), "2026-02-30{Enter}");

    expect(commits).toEqual([]);
    expect(field().value).toBe("2026-02-30");
    expect(field().getAttribute("aria-invalid")).toBe("true");
    const described = (field().getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent);
    expect(described).toContain("Type the day as YYYY-MM-DD, for example 2026-11-20.");

    await user.type(field(), "x");
    expect(field().getAttribute("aria-invalid")).toBeNull();
  });

  it("follows the address when it moves for another reason", () => {
    const commits: string[] = [];
    function Outside({ day }: { day: string }) {
      return createElement(DayStepper, {
        day,
        onCommit: (to) => commits.push(to),
        labels: LABELS,
        today: "2026-10-03",
      });
    }
    const view = render(createElement(Outside, { day: "2026-11-20" }));
    act(() => {
      view.rerender(createElement(Outside, { day: "2026-10-08" }));
    });
    expect(field().value).toBe("2026-10-08");
    expect(commits).toEqual([]);
  });
});

describe("Today and Next date with changes", () => {
  it("go to today and to the next date with changes", async () => {
    const user = userEvent.setup();
    const commits: string[] = [];
    render(createElement(Page, { commits }));
    await user.click(screen.getByRole("button", { name: "Today" }));
    await user.click(screen.getByRole("button", { name: "Next date with changes" }));
    expect(commits).toEqual(["2026-10-03", "2026-12-01"]);
  });

  it("keeps Next in place, inert and focusable, when there is no next date", async () => {
    const user = userEvent.setup();
    const commits: string[] = [];
    render(createElement(Page, { commits, next: null }));
    const next = screen.getByRole("button", { name: "Next date with changes" });
    expect(next.getAttribute("aria-disabled")).toBe("true");
    expect(next).toHaveProperty("disabled", false);
    next.focus();
    await user.keyboard("{Enter}");
    expect(commits).toEqual([]);
    expect(document.activeElement).toBe(next);
  });

  it("leaves Next out when the caller has no such thing", () => {
    render(
      createElement(DayStepper, {
        day: "2026-11-20",
        onCommit: () => undefined,
        labels: LABELS,
        today: "2026-10-03",
      }),
    );
    expect(screen.queryByRole("button", { name: "Next date with changes" })).toBeNull();
  });
});

describe("the status", () => {
  it("is one polite region, empty until the caller says the day has loaded", async () => {
    const user = userEvent.setup();
    const commits: string[] = [];
    render(createElement(Page, { commits }));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("");
    await user.click(screen.getByRole("button", { name: "The day after" }));
    expect(screen.getByRole("status").textContent).toBe("2026-11-21: 9 versions come into force.");
  });
});
