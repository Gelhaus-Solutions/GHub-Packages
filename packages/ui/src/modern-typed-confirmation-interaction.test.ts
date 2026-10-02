// @vitest-environment jsdom

/**
 * When TypedConfirmation gives its verdict, observed in a document.
 *
 * The timing is the whole design of P3 and none of it is visible in markup: a
 * match is shown the moment it is true, a mismatch waits for blur or submit,
 * typing again withdraws a mismatch, paste works, and "Matches" is announced
 * politely and once. Each of those is a sequence of events, so each is driven
 * here rather than described.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createElement, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TypedConfirmation } from "./modern/typed-confirmation.js";

afterEach(cleanup);

const TITLE = "Privacy and terms, October 2026";
const MISMATCH = "This does not match the title. Type it exactly as shown above it.";

/** The component is controlled, so the value a real caller owns lives here. */
function Harness({
  showMismatch = false,
  onChange,
}: {
  showMismatch?: boolean;
  onChange?: (value: string, matches: boolean) => void;
}) {
  const [value, setValue] = useState("");
  return createElement(
    "div",
    null,
    createElement(TypedConfirmation, {
      label: "Type the campaign's title",
      expected: TITLE,
      value,
      onChange: (next: string, matches: boolean) => {
        setValue(next);
        onChange?.(next, matches);
      },
      matchesLabel: "Matches",
      mismatch: MISMATCH,
      hint: "Typed again to confirm.",
      showMismatch,
    }),
    createElement("button", { type: "button" }, "Somewhere else"),
  );
}

function field(): HTMLInputElement {
  return screen.getByLabelText<HTMLInputElement>("Type the campaign's title");
}

describe("TypedConfirmation is described by what to type", () => {
  it("gives the expected string to a screen reader as the field's description", () => {
    render(createElement(Harness, {}));
    const input = screen.getByRole("textbox", { name: "Type the campaign's title" });
    expect(screen.getByRole("textbox", { description: new RegExp(`^${TITLE}`) })).toBe(input);
  });
});

describe("TypedConfirmation gives a match at once", () => {
  it("shows Matches on the keystroke that completes it, without a blur", async () => {
    const user = userEvent.setup();
    render(createElement(Harness, {}));
    const region = screen.getByRole("status");
    expect(region.textContent).toBe("");

    await user.type(field(), TITLE);

    expect(document.activeElement).toBe(field());
    // The same node that was mounted empty, which is what makes it announce.
    expect(screen.getByRole("status")).toBe(region);
    expect(region.textContent).toBe("Matches");
    expect(screen.queryByText("Typed again to confirm.")).toBeNull();
  });

  it("announces once: more space after a match does not touch the region", async () => {
    const user = userEvent.setup();
    render(createElement(Harness, {}));
    await user.type(field(), TITLE);
    const region = screen.getByRole("status");

    const changes: MutationRecord[] = [];
    const observer = new MutationObserver((records) => changes.push(...records));
    observer.observe(region, { childList: true, subtree: true, characterData: true });

    await user.type(field(), "  ");
    observer.disconnect();

    expect(region.textContent).toBe("Matches");
    expect(changes).toEqual([]);
  });

  it("accepts a paste, because blocking it protects nothing", async () => {
    const user = userEvent.setup();
    render(createElement(Harness, {}));

    await user.click(field());
    await user.paste(TITLE);

    expect(field().value).toBe(TITLE);
    expect(screen.getByRole("status").textContent).toBe("Matches");
  });

  it("tells the caller whether each value matches", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(createElement(Harness, { onChange }));

    await user.click(field());
    await user.paste(`${TITLE} `);

    expect(onChange).toHaveBeenLastCalledWith(`${TITLE} `, true);
    await user.type(field(), "x");
    expect(onChange).toHaveBeenLastCalledWith(`${TITLE} x`, false);
  });
});

describe("TypedConfirmation holds a mismatch until blur or submit", () => {
  it("says nothing while somebody is still typing", async () => {
    const user = userEvent.setup();
    render(createElement(Harness, {}));

    await user.type(field(), "Privacy and terms, Oct");

    expect(screen.queryByText(MISMATCH)).toBeNull();
    expect(field().hasAttribute("aria-invalid")).toBe(false);
    expect(screen.getByText("Typed again to confirm.")).toBeTruthy();
  });

  it("refuses on blur, with the sentence in place of the hint", async () => {
    const user = userEvent.setup();
    render(createElement(Harness, {}));

    await user.type(field(), "Privacy and terms, Oct");
    await user.tab();

    expect(screen.getByText(MISMATCH)).toBeTruthy();
    expect(screen.queryByText("Typed again to confirm.")).toBeNull();
    expect(field().getAttribute("aria-invalid")).toBe("true");
    expect(field().className).toContain("border-m-crit");
    // The refusal joins the description after the expected string, not instead of it.
    const described = field().getAttribute("aria-describedby")?.split(" ") ?? [];
    expect(document.getElementById(described[0] as string)?.textContent).toBe(TITLE);
    expect(document.getElementById(described[1] as string)?.textContent).toBe(MISMATCH);
  });

  it("does not refuse a field that was left empty", async () => {
    const user = userEvent.setup();
    render(createElement(Harness, {}));

    await user.click(field());
    await user.tab();

    expect(screen.queryByText(MISMATCH)).toBeNull();
    expect(field().hasAttribute("aria-invalid")).toBe(false);
  });

  it("withdraws the refusal when somebody starts typing again", async () => {
    const user = userEvent.setup();
    render(createElement(Harness, {}));

    await user.type(field(), "Privacy and terms, Oct");
    await user.tab();
    expect(screen.getByText(MISMATCH)).toBeTruthy();

    await user.click(field());
    await user.type(field(), "o");

    expect(screen.queryByText(MISMATCH)).toBeNull();
    expect(field().hasAttribute("aria-invalid")).toBe(false);
  });

  it("goes straight from refused to Matches when the answer is completed", async () => {
    const user = userEvent.setup();
    render(createElement(Harness, {}));

    await user.type(field(), "Privacy and terms, ");
    await user.tab();
    await user.click(field());
    await user.type(field(), "October 2026");

    expect(screen.queryByText(MISMATCH)).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Matches");
  });

  it("refuses while the caller says a submit was attempted, typing or not", async () => {
    const user = userEvent.setup();
    render(createElement(Harness, { showMismatch: true }));
    expect(screen.getByText(MISMATCH)).toBeTruthy();

    await user.type(field(), "Privacy");
    expect(screen.getByText(MISMATCH)).toBeTruthy();
    expect(document.activeElement).toBe(field());
  });
});
