// @vitest-environment jsdom

/**
 * ReasonField, ShownOnce, ProveItIsYou and EventLog, in a document.
 *
 * ReasonField: the count says what is missing until the minimum and that it is
 * enough from there, and is a polite live region. ShownOnce: Copy writes the
 * secret and says so. ProveItIsYou: it takes focus when it appears, draws the
 * way it is given and lays a failure over it. EventLog: a list of rows with
 * seconds, the kind chip carrying the level, the quoted reason, and the line
 * that says nothing in it can be changed.
 */

import { act, cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventLog } from "./modern/event-log.js";
import { ProveItIsYou } from "./modern/prove-it-is-you.js";
import { ReasonField, reasonIsEnough } from "./modern/reason-field.js";
import { ShownOnce } from "./modern/shown-once.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ReasonField", () => {
  const labels = {
    short: (missing: number) => `${String(missing)} characters short`,
    enough: (count: number) => `${String(count)} characters · enough`,
  };

  it("counts what is missing until the minimum, then says it is enough", async () => {
    const user = userEvent.setup();
    render(
      createElement(ReasonField, {
        name: "reason",
        label: "Why",
        hint: "The person reads this",
        minimum: 10,
        labels,
      }),
    );
    const field = screen.getByRole("textbox", { name: "Why" });
    expect(screen.getByText("10 characters short").getAttribute("aria-live")).toBe("polite");
    await user.type(field, "  short  ");
    expect(screen.getByText("5 characters short")).toBeTruthy();
    expect(field.getAttribute("aria-invalid")).toBe("true");
    await user.type(field, "and now enough");
    expect(screen.getByText(/characters · enough/u)).toBeTruthy();
    expect(field.getAttribute("aria-invalid")).toBeNull();
    expect(field.getAttribute("aria-describedby")?.split(" ")).toHaveLength(2);
    // Exactly the minimum is enough.
    await user.clear(field);
    await user.type(field, "x".repeat(10));
    expect(screen.getByText("10 characters · enough")).toBeTruthy();
  });

  it("applies the same rule as a function, after trimming", () => {
    expect(reasonIsEnough(" ".repeat(50))).toBe(false);
    expect(reasonIsEnough("x".repeat(40))).toBe(true);
    expect(reasonIsEnough("x".repeat(9), 10)).toBe(false);
  });
});

describe("ShownOnce", () => {
  it("copies the secret and says it did", async () => {
    const user = userEvent.setup();
    const write = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: write },
      configurable: true,
    });
    render(
      createElement(ShownOnce, {
        secret: "gpsso_9f2c41d0abc",
        what: "the token for the backup job",
        labels: { copy: "Copy", copied: "Copied", warning: "This is the only time it is shown." },
      }),
    );
    await user.click(screen.getByRole("button", { name: "Copy: the token for the backup job" }));
    expect(write).toHaveBeenCalledWith("gpsso_9f2c41d0abc");
    expect(screen.getAllByText("Copied").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("This is the only time it is shown.")).toBeTruthy();
  });
});

describe("ProveItIsYou", () => {
  it("takes focus, offers the passkey first and a way to the password", async () => {
    const user = userEvent.setup();
    const press = vi.fn();
    const other = vi.fn();
    render(
      createElement(ProveItIsYou, {
        way: "passkey",
        title: "Prove it is you",
        line: "Ending every session asks once more.",
        passkey: { label: "Use your passkey", onPress: press },
        switchTo: { label: "Use the password instead", onPress: other },
      }),
    );
    const group = screen.getByRole("group", { name: "Prove it is you" });
    expect(document.activeElement).toBe(group);
    await user.click(screen.getByRole("button", { name: "Use your passkey" }));
    await user.click(screen.getByRole("button", { name: "Use the password instead" }));
    expect(press).toHaveBeenCalledOnce();
    expect(other).toHaveBeenCalledOnce();
  });

  it("says a session without a password cannot prove it here, and lays a failure over the way tried", () => {
    render(
      createElement(ProveItIsYou, {
        way: "none",
        title: "Prove it is you",
        line: "This act asks once more.",
        none: "This session never had a password.",
        failed: "That did not prove it.",
      }),
    );
    expect(screen.getByText("This session never had a password.")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("That did not prove it.");
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("EventLog", () => {
  it("lists the rows with seconds, the reason in quotes and the kind beside them", async () => {
    render(
      createElement(EventLog, {
        entries: [
          {
            key: "1",
            at: "2026-10-24T06:02:07Z",
            level: "warn",
            what: "Jan Krüger suspended",
            who: "Entra ID (SCIM)",
            kind: "People",
          },
          {
            key: "2",
            at: "2026-10-23T15:40:00Z",
            level: "accent",
            what: "Lena Hoffmann offboarded",
            who: "Thomas Weber",
            reason: "Left the company on 23 October",
            kind: "People",
          },
        ],
        total: 1284,
        labels: {
          list: "Audit log",
          empty: "Nothing yet",
          line: (shown: number, total: number) =>
            `${String(shown)} of ${String(total)} events, newest first. None can be changed or removed.`,
        },
      }),
    );
    await act(async () => {});
    const list = screen.getByRole("list", { name: "Audit log" });
    expect(list.querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByText("08:02:07")).toBeTruthy();
    expect(screen.getByText("Left the company on 23 October").tagName).toBe("Q");
    expect(screen.getAllByText("People")).toHaveLength(2);
    expect(
      screen.getByText("2 of 1284 events, newest first. None can be changed or removed."),
    ).toBeTruthy();
  });

  it("says so where there is nothing yet", () => {
    render(
      createElement(EventLog, {
        entries: [],
        labels: {
          list: "Audit log",
          empty: "Nothing has happened here yet",
          line: () => "0 of 0 events",
        },
      }),
    );
    expect(screen.getByText("Nothing has happened here yet")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
