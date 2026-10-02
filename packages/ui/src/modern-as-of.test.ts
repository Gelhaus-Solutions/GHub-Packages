// @vitest-environment jsdom

/**
 * `AsOf`: when it commits, what it says, and where focus goes.
 *
 * Sheet 09's contract for it is four lines, and each is a behaviour a
 * screenshot cannot show: it commits on Enter or blur and never per keystroke;
 * the radiogroup is one tab stop and choosing A date moves focus into the
 * field; the field is hidden at Now and not unmounted, so the date survives;
 * and a polite sentence is said once per commit.
 *
 * VERIFIED BY MUTATION. Each was broken once in the component and seen to go
 * red before being restored: committing from `onChange` instead of on Enter or
 * blur, unmounting the field at Now instead of hiding it, dropping the focus
 * effect, dropping the once-per-change guard, and committing the typed date on
 * the way out to Now.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AsOf, writeAt, type AsOfProps } from "./modern/as-of.js";
import type { ZonedReading } from "./modern/zoned-time.js";

afterEach(cleanup);

/** "21 Nov 2026, 00:00 CET", the way a caller with an English locale would say it. */
function words(reading: ZonedReading): string {
  const day = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: reading.zone,
  }).format(reading.epochMs);
  return `${day}, ${reading.time} ${reading.abbreviation}`;
}

const LINK = "https://terms.example/staff/people/jonas@example.com";

const strings = {
  label: "Standings as of",
  nowLabel: "Now",
  dateLabel: "A date",
  fieldLabel: "Date",
  nowText: "Now is 16 Oct 2026, 11:04 CEST",
  startOfDay: (reading: ZonedReading) => `from ${reading.time} ${reading.abbreviation}`,
  announcement: (reading: ZonedReading | null) =>
    reading === null
      ? "Standings recomputed for now."
      : `Standings recomputed for ${words(reading)}.`,
  invalid: "Type the date as YYYY-MM-DD, for example 2026-11-21.",
  link: { href: LINK, label: "Copy the link to these standings" },
};

function renderAsOf(extra: Partial<AsOfProps> = {}) {
  const onCommit = vi.fn();
  const view = render(
    createElement("div", null, [
      createElement(AsOf, { key: "as-of", ...strings, onCommit, ...extra }),
      createElement("button", { key: "after", type: "button" }, "After"),
    ]),
  );
  /*
   * Queried with `hidden: true`, because at Now the field is hidden and the
   * point of several tests is that it is still there.
   */
  const field = screen.getByRole<HTMLInputElement>("textbox", {
    name: "Standings as of Date",
    hidden: true,
  });
  /*
   * The plate's own live region, as its direct child: CopyChip inside the
   * plate carries a status region of its own for "copied".
   */
  const plate = screen.getByText("Standings as of").parentElement;
  const region = plate?.querySelector<HTMLElement>(':scope > [role="status"]') ?? null;
  return { ...view, onCommit, field, region };
}

describe("the radiogroup", () => {
  it("is one tab stop, and an arrow to A date moves focus into the field", async () => {
    const user = userEvent.setup();
    const { field } = renderAsOf();
    const now = screen.getByRole("radio", { name: "Now" });
    const date = screen.getByRole("radio", { name: "A date" });
    expect(now.tabIndex).toBe(0);
    expect(date.tabIndex).toBe(-1);

    await user.tab();
    expect(document.activeElement).toBe(now);

    await user.keyboard("{ArrowRight}");
    expect(date.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(field);
  });

  it("moves focus into the field when A date is clicked as well", async () => {
    const user = userEvent.setup();
    const { field } = renderAsOf();
    await user.click(screen.getByRole("radio", { name: "A date" }));
    expect(document.activeElement).toBe(field);
  });
});

describe("the field at Now", () => {
  it("is hidden rather than unmounted, so the chosen date survives", async () => {
    const user = userEvent.setup();
    const { field } = renderAsOf({ defaultValue: "2026-11-21T00:00:00+01:00" });
    expect(field.value).toBe("2026-11-21");
    expect(screen.getByText("from 00:00 CET")).toBeTruthy();

    await user.click(screen.getByRole("radio", { name: "Now" }));

    // Present AND hidden: absence alone would also pass for an unmount.
    expect(field.isConnected).toBe(true);
    expect(field.closest("[hidden]")).not.toBeNull();
    expect(screen.getByText("Now is 16 Oct 2026, 11:04 CEST")).toBeTruthy();

    await user.click(screen.getByRole("radio", { name: "A date" }));
    expect(field.closest("[hidden]")).toBeNull();
    expect(field.value).toBe("2026-11-21");
    expect(screen.queryByText("Now is 16 Oct 2026, 11:04 CEST")).toBeNull();
  });
});

describe("committing", () => {
  it("happens on Enter, never per keystroke, and is announced once", async () => {
    const user = userEvent.setup();
    const { field, onCommit, region } = renderAsOf();
    await user.click(screen.getByRole("radio", { name: "A date" }));

    await user.type(field, "2026-11-21");
    expect(onCommit).not.toHaveBeenCalled();
    expect(region?.textContent).toBe("");

    await user.keyboard("{Enter}");
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0]?.[0]).toBe("2026-11-21T00:00:00+01:00");
    expect(onCommit.mock.calls[0]?.[1]).toMatchObject({ abbreviation: "CET", time: "00:00" });
    expect(region?.textContent).toBe("Standings recomputed for 21 Nov 2026, 00:00 CET.");
  });

  it("happens on blur, and only when something changed", async () => {
    const user = userEvent.setup();
    const { field, onCommit } = renderAsOf({ defaultValue: "2026-11-21T00:00:00+01:00" });

    await user.click(field);
    await user.tab();
    // Leaving without a change is not a recomputation.
    expect(onCommit).not.toHaveBeenCalled();

    await user.click(field);
    await user.keyboard("{ArrowUp}");
    expect(onCommit).not.toHaveBeenCalled();
    await user.tab();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0]?.[0]).toBe("2026-11-22T00:00:00+01:00");
  });

  it("happens at once for Now, which is announced and shows the present in words", async () => {
    const user = userEvent.setup();
    const { onCommit, region } = renderAsOf({ defaultValue: "2026-11-21T00:00:00+01:00" });
    await user.click(screen.getByRole("radio", { name: "Now" }));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0]).toEqual([null, null]);
    expect(region?.textContent).toBe("Standings recomputed for now.");
  });

  it("does not commit a half-typed date on the way out to Now", async () => {
    const user = userEvent.setup();
    const { field, onCommit } = renderAsOf({ defaultValue: "2026-11-21T00:00:00+01:00" });
    await user.clear(field);
    await user.type(field, "2026-12-01");
    await user.click(screen.getByRole("radio", { name: "Now" }));
    expect(onCommit.mock.calls).toEqual([[null, null]]);
  });

  it("commits the date already in the field when A date is chosen again", async () => {
    const user = userEvent.setup();
    const { onCommit } = renderAsOf({ defaultValue: "2026-11-21T00:00:00+01:00" });
    await user.click(screen.getByRole("radio", { name: "Now" }));
    await user.click(screen.getByRole("radio", { name: "A date" }));
    expect(onCommit.mock.calls.map((call) => call[0])).toEqual([null, "2026-11-21T00:00:00+01:00"]);
  });

  it("refuses text that is not a date, commits nothing, and says so beside the field", async () => {
    const user = userEvent.setup();
    const { field, onCommit } = renderAsOf();
    await user.click(screen.getByRole("radio", { name: "A date" }));
    await user.type(field, "2026-13-01{Enter}");

    expect(onCommit).not.toHaveBeenCalled();
    const error = screen.getByText(strings.invalid);
    expect(field.getAttribute("aria-describedby")?.split(" ")).toContain(error.id);
    expect(field.getAttribute("aria-invalid")).toBe("true");

    await user.keyboard("{Backspace}");
    expect(screen.queryByText(strings.invalid)).toBeNull();
  });
});

describe("the link", () => {
  it("is offered as a CopyChip named for what it copies", () => {
    renderAsOf();
    expect(
      screen.getByRole("button", { name: `Copy the link to these standings: ${LINK}` }),
    ).toBeTruthy();
  });

  it("is written into ?at= by writeAt, replacing the history entry rather than adding one", () => {
    window.history.replaceState(null, "", "/staff/people/jonas@example.com?tab=history");
    const before = window.history.length;

    const href = writeAt("2026-11-21T00:00:00+01:00");
    expect(window.location.href).toBe(href);
    expect(window.location.search).toBe("?tab=history&at=2026-11-21T00:00:00%2B01:00");
    expect(new URLSearchParams(window.location.search).get("at")).toBe("2026-11-21T00:00:00+01:00");
    expect(window.history.length).toBe(before);

    writeAt(null);
    expect(window.location.search).toBe("?tab=history");
  });
});

describe("a value from the URL", () => {
  it("follows it when it moves for another reason, keeping the date at Now", () => {
    const onCommit = vi.fn();
    const props = { ...strings, onCommit };
    const view = render(createElement(AsOf, { ...props, value: "2026-11-21T00:00:00+01:00" }));
    const field = screen.getByRole<HTMLInputElement>("textbox", {
      name: "Standings as of Date",
      hidden: true,
    });
    expect(screen.getByRole("radio", { name: "A date" }).getAttribute("aria-checked")).toBe("true");

    view.rerender(createElement(AsOf, { ...props, value: null }));
    expect(screen.getByRole("radio", { name: "Now" }).getAttribute("aria-checked")).toBe("true");
    expect(field.value).toBe("2026-11-21");

    view.rerender(createElement(AsOf, { ...props, value: "2026-12-01T00:00:00+01:00" }));
    expect(screen.getByRole("radio", { name: "A date" }).getAttribute("aria-checked")).toBe("true");
    expect(field.value).toBe("2026-12-01");
    // Following the URL is not a commit.
    expect(onCommit).not.toHaveBeenCalled();
  });
});
