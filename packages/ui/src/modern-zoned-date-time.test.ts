// @vitest-environment jsdom

/**
 * `ZonedDateTime`: what the keys, a paste and the live region do, observed in a
 * document rather than reasoned about.
 *
 * The arithmetic is tested on its own in `zoned-time.test.ts`. This file is the
 * contract sheet 09 states for the control: typing first, a paste of a full ISO
 * string fills both fields, Arrow Up and Down step a day or a minute, Page Up
 * and Down a month or an hour, the zone is an `output` and never a field, a
 * doubled hour is asked about, a skipped hour is refused in the hint slot, and
 * a change of zone is said once and politely.
 *
 * VERIFIED BY MUTATION. Each contract below was broken once in the component
 * and seen to go red before being restored: the offset dropped from the
 * emitted ISO, the paste handler's `preventDefault` removed, the step handler
 * removed, the caret restore removed, the zone-change sentence never set, the
 * doubled-hour fieldset defaulted to the first radio, and the missing-hour
 * refusal shown while typing.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createElement, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZonedDateTime, type ZonedDateTimeProps } from "./modern/zoned-date-time.js";
import type { ClockGap, ZonedReading } from "./modern/zoned-time.js";

afterEach(cleanup);

const said = (reading: ZonedReading) => `${reading.abbreviation} ${reading.offset}`;

/** The strings a caller passes. English here; the component has none of its own. */
const strings = {
  label: "In force from",
  hint: "Europe/Berlin. The zone follows the date and is always sent with the time.",
  dateLabel: "Date",
  timeLabel: "Time",
  ambiguousLegend: (time: string) => `${time} happens twice that night. Which one?`,
  ambiguousFirst: (reading: ZonedReading) => `The first, ${said(reading)}`,
  ambiguousSecond: (reading: ZonedReading) => `The second, ${said(reading)}`,
  missingHour: (gap: ClockGap) =>
    `${gap.date}, ${gap.time} does not exist in ${gap.zone}: clocks go from ${gap.from} to ` +
    `${gap.resumes.time}. Pick ${gap.resumes.time} ${gap.resumes.abbreviation} or later.`,
  zoneChange: (now: ZonedReading) =>
    `Now ${now.abbreviation}, plus ${now.offsetMinutes === 60 ? "one hour" : "two hours"}.`,
};

function renderField(extra: Partial<ZonedDateTimeProps> = {}) {
  const onChange = vi.fn();
  const onCommit = vi.fn();
  // `extra` may switch the mode, which a Partial of a union cannot express.
  const props = { ...strings, onChange, onCommit, ...extra } as ZonedDateTimeProps;
  const view = render(
    createElement(
      "div",
      null,
      createElement(ZonedDateTime, props),
      createElement("button", { type: "button" }, "After"),
    ),
  );
  const date = screen.getByRole<HTMLInputElement>("textbox", { name: "In force from Date" });
  const time = screen.queryByRole<HTMLInputElement>("textbox", { name: "In force from Time" });
  return { ...view, onChange, onCommit, date, time };
}

/** The live region, by its explicit role: `output` carries an implicit one too. */
function liveRegion(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[role="status"]');
}

function lastValue(spy: ReturnType<typeof vi.fn>): unknown {
  return spy.mock.calls.at(-1)?.[0];
}

describe("what it emits", () => {
  it("is ISO 8601 with the offset once both fields name an instant, and null before", async () => {
    const user = userEvent.setup();
    const { date, time, onChange } = renderField();

    await user.type(date, "2026-11-26");
    expect(lastValue(onChange)).toBeNull();
    expect(onChange.mock.calls.at(-1)?.[1].outcome.state).toBe("incomplete");

    await user.type(time as HTMLInputElement, "09:00");
    expect(lastValue(onChange)).toBe("2026-11-26T09:00:00+01:00");
  });

  it("derives the zone as an output from both fields, and offers nothing to type it into", async () => {
    const user = userEvent.setup();
    const { container, date, time } = renderField();

    // Two fields and only two. The zone is not one of them.
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    const output = container.querySelector("output");
    expect(output).not.toBeNull();
    expect(output?.getAttribute("for")).toBe(`${date.id} ${time?.id}`);
    // Its own implicit live region is off: the zone change is said once, below.
    expect(output?.getAttribute("aria-live")).toBe("off");
    expect(output?.textContent).toBe("Europe/Berlin");

    await user.type(date, "2026-11-26");
    await user.type(time as HTMLInputElement, "09:00");
    expect(output?.textContent).toBe("CET +01:00");

    // And both fields are described by it, so the zone is heard as well as seen.
    expect(date.getAttribute("aria-describedby")?.split(" ")).toContain(output?.id);
  });

  it("posts the instant with a form when it has a name", async () => {
    const user = userEvent.setup();
    const { container, date, time } = renderField({ name: "inForceFrom" });
    const hidden = container.querySelector<HTMLInputElement>('input[type="hidden"]');
    expect(hidden?.value).toBe("");
    await user.type(date, "2026-11-26");
    await user.type(time as HTMLInputElement, "09:00");
    expect(hidden?.name).toBe("inForceFrom");
    expect(hidden?.value).toBe("2026-11-26T09:00:00+01:00");
  });
});

describe("paste", () => {
  it("fills both fields from a full ISO string, read in Berlin", async () => {
    const user = userEvent.setup();
    const { date, time, onChange } = renderField();

    await user.click(date);
    await user.paste("2026-11-19T23:00:00Z");

    expect(date.value).toBe("2026-11-20");
    expect(time?.value).toBe("00:00");
    expect(lastValue(onChange)).toBe("2026-11-20T00:00:00+01:00");
    expect(onChange.mock.calls.at(-1)?.[1].via).toBe("paste");
  });

  it("leaves a bare date to the browser's own paste", async () => {
    const user = userEvent.setup();
    const { date, time } = renderField();
    await user.click(date);
    await user.paste("2026-11-20");
    expect(date.value).toBe("2026-11-20");
    expect(time?.value).toBe("");
  });
});

describe("the keys", () => {
  it("step a day with the arrows and a month with the page keys, leaving the caret where it was", async () => {
    const user = userEvent.setup();
    const { date, onChange } = renderField({ defaultValue: "2026-10-24T09:00:00+02:00" });

    await user.click(date);
    date.setSelectionRange(5, 5);

    await user.keyboard("{ArrowUp}");
    expect(date.value).toBe("2026-10-25");
    expect(date.selectionStart).toBe(5);

    await user.keyboard("{PageUp}");
    expect(date.value).toBe("2026-11-25");
    await user.keyboard("{ArrowDown}");
    expect(date.value).toBe("2026-11-24");
    await user.keyboard("{PageDown}");
    expect(date.value).toBe("2026-10-24");
    expect(date.selectionStart).toBe(5);
    expect(onChange.mock.calls.at(-1)?.[1].via).toBe("step");
  });

  it("step a minute and an hour of real time, into the second of a doubled hour", async () => {
    const user = userEvent.setup();
    const { time, onChange } = renderField({ defaultValue: "2026-10-25T02:59:00+02:00" });
    const field = time as HTMLInputElement;

    await user.click(field);
    await user.keyboard("{ArrowUp}");

    expect(field.value).toBe("02:00");
    expect(
      screen.getByRole<HTMLInputElement>("radio", { name: "The second, CET +01:00" }).checked,
    ).toBe(true);
    expect(lastValue(onChange)).toBe("2026-10-25T02:00:00+01:00");

    await user.keyboard("{PageUp}");
    expect(field.value).toBe("03:00");
    expect(lastValue(onChange)).toBe("2026-10-25T03:00:00+01:00");
  });

  it("move date, time, then out, with Tab", async () => {
    const user = userEvent.setup();
    const { date, time } = renderField();
    await user.click(date);
    await user.tab();
    expect(document.activeElement).toBe(time);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "After" }));
  });

  it("commit on Enter and when focus leaves, and not when it moves between the fields", async () => {
    const user = userEvent.setup();
    const { date, onCommit } = renderField({ defaultValue: "2026-11-26T09:00:00+01:00" });

    await user.click(date);
    await user.keyboard("{Enter}");
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0]?.[0]).toBe("2026-11-26T09:00:00+01:00");
    expect(onCommit.mock.calls[0]?.[1].via).toBe("enter");

    await user.tab();
    expect(onCommit).toHaveBeenCalledTimes(1);
    await user.tab();
    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(onCommit.mock.calls[1]?.[1].via).toBe("blur");
  });
});

describe("a change of zone", () => {
  it("is announced politely as the date crosses it, and only then", async () => {
    const user = userEvent.setup();
    const { container, date } = renderField({ defaultValue: "2026-10-23T09:00:00+02:00" });
    const region = liveRegion(container);
    expect(region?.textContent).toBe("");

    await user.click(date);
    await user.keyboard("{ArrowUp}");
    // 24 Oct is still summer time: nothing changed, so nothing is said.
    expect(region?.textContent).toBe("");

    await user.keyboard("{ArrowUp}");
    expect(region?.textContent).toBe("Now CET, plus one hour.");

    await user.keyboard("{ArrowDown}");
    expect(region?.textContent).toBe("Now CEST, plus two hours.");
  });

  it("has no live region at all when the caller gives no sentence", () => {
    const { container } = renderField({ zoneChange: undefined });
    expect(liveRegion(container)).toBeNull();
  });
});

describe("the hour that happens twice", () => {
  it("asks which one, emits nothing until answered, then the one chosen", async () => {
    const user = userEvent.setup();
    const { date, time, onChange } = renderField();

    await user.type(date, "2026-10-25");
    await user.type(time as HTMLInputElement, "02:30");

    const group = screen.getByRole("group", { name: "02:30 happens twice that night. Which one?" });
    const first = screen.getByRole<HTMLInputElement>("radio", { name: "The first, CEST +02:00" });
    const second = screen.getByRole<HTMLInputElement>("radio", { name: "The second, CET +01:00" });
    expect(group.contains(first)).toBe(true);
    // Asked, not defaulted.
    expect(first.checked).toBe(false);
    expect(second.checked).toBe(false);
    expect(lastValue(onChange)).toBeNull();
    expect(onChange.mock.calls.at(-1)?.[1].outcome.state).toBe("ambiguous");

    // Tab reaches the question next.
    await user.tab();
    expect(document.activeElement).toBe(first);

    await user.click(second);
    expect(lastValue(onChange)).toBe("2026-10-25T02:30:00+01:00");
    // The question stays beside its answer.
    expect(second.checked).toBe(true);
  });
});

describe("the hour that never happens", () => {
  it("is refused in the hint slot once focus leaves, not while typing", async () => {
    const user = userEvent.setup();
    const { date, time, onChange } = renderField();

    await user.type(date, "2027-03-28");
    await user.type(time as HTMLInputElement, "02:30");
    expect(lastValue(onChange)).toBeNull();

    const sentence =
      "2027-03-28, 02:30 does not exist in Europe/Berlin: clocks go from 02:00 to 03:00. " +
      "Pick 03:00 CEST or later.";
    // Still typing: the hint stands and nothing is refused yet.
    expect(screen.queryByText(sentence)).toBeNull();
    expect(screen.getByText(strings.hint)).toBeTruthy();
    expect(date.hasAttribute("aria-invalid")).toBe(false);

    await user.tab();

    const error = screen.getByText(sentence);
    // The refusal replaces the hint and both fields point at it.
    expect(screen.queryByText(strings.hint)).toBeNull();
    expect(date.getAttribute("aria-describedby")?.split(" ")).toContain(error.id);
    expect(time?.getAttribute("aria-describedby")?.split(" ")).toContain(error.id);
    expect(date.getAttribute("aria-invalid")).toBe("true");

    // Typing again takes the refusal away until the next blur.
    await user.click(time as HTMLInputElement);
    await user.keyboard("{Backspace}");
    expect(screen.queryByText(sentence)).toBeNull();
  });

  it("is refused at once when a key step lands on it", async () => {
    const user = userEvent.setup();
    const { date } = renderField({ defaultValue: "2027-03-27T02:30:00+01:00" });
    await user.click(date);
    await user.keyboard("{ArrowUp}");
    expect(screen.getByText(/02:30 does not exist in Europe\/Berlin/)).toBeTruthy();
  });

  it("gives the caller's own refusal precedence", async () => {
    renderField({ error: "An acceptance cannot be dated in the future." });
    expect(screen.getByText("An acceptance cannot be dated in the future.")).toBeTruthy();
  });
});

describe("date only", () => {
  it("has no time field and means the start of that day, in words the caller gives", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      createElement(ZonedDateTime, {
        label: "On",
        dateLabel: "Date",
        dateOnly: true,
        startOfDay: (reading: ZonedReading) =>
          `from ${reading.time} ${reading.abbreviation}, the start of that day`,
        onChange,
      }),
    );

    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    await user.type(screen.getByRole("textbox", { name: "On Date" }), "2026-11-21");
    expect(lastValue(onChange)).toBe("2026-11-21T00:00:00+01:00");
    expect(container.querySelector("output")?.textContent).toBe(
      "from 00:00 CET, the start of that day",
    );
  });
});

describe("a value from the caller", () => {
  it("re-seeds the fields when it moves, for a fix offered as a button", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState<string | null>("2026-11-20T00:00:00+01:00");
      return createElement("div", null, [
        createElement(ZonedDateTime, {
          key: "field",
          ...strings,
          value,
          onChange: (next: string | null) => setValue(next),
        }),
        createElement(
          "button",
          { key: "fix", type: "button", onClick: () => setValue("2026-11-26T09:00:00+01:00") },
          "Move in force to 26 Nov 2026, 09:00 CET",
        ),
      ]);
    }
    render(createElement(Harness));
    const date = screen.getByRole<HTMLInputElement>("textbox", { name: "In force from Date" });
    const time = screen.getByRole<HTMLInputElement>("textbox", { name: "In force from Time" });
    expect(date.value).toBe("2026-11-20");

    // Typing round-trips through the caller without the field being reset under it.
    await user.clear(time);
    await user.type(time, "08:15");
    expect(time.value).toBe("08:15");

    await user.click(screen.getByRole("button", { name: /Move in force/ }));
    expect(date.value).toBe("2026-11-26");
    expect(time.value).toBe("09:00");
  });
});
