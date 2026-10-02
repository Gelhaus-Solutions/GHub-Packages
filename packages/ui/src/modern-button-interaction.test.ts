// @vitest-environment jsdom

/**
 * What pressing the modern button does, in a document.
 *
 * Two claims in `button.tsx` cannot be seen in markup: that a busy button keeps
 * focus where a disabled one would drop it, and that a busy button swallows the
 * press, including the click a browser synthesises when Enter is pressed in a
 * field of the same form. Both are about a second submit, and a second submit
 * on a screen that schedules a mailing is a second mailing.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./modern/button.js";

afterEach(cleanup);

describe("Button answers the keyboard as a native button", () => {
  it("activates on Enter and on Space", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(createElement(Button, { variant: "primary", onClick }, "Schedule"));

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Schedule" }));

    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("does not submit the form it sits in unless it is a submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: Event) => event.preventDefault());
    render(
      createElement(
        "form",
        { onSubmit },
        createElement(Button, null, "Back"),
        createElement(Button, { type: "submit", variant: "primary" }, "Save"),
      ),
    );

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe("Button while busy", () => {
  it("keeps focus on itself", async () => {
    const user = userEvent.setup();
    const view = render(createElement(Button, { variant: "primary" }, "Schedule"));
    await user.tab();
    const button = screen.getByRole("button", { name: "Schedule" });
    expect(document.activeElement).toBe(button);

    view.rerender(createElement(Button, { variant: "primary", busy: true }, "Schedule"));

    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-busy")).toBe("true");
    // The accessible name is still the words, so a reader knows which action is waiting.
    expect(screen.getByRole("button", { name: "Schedule" })).toBe(button);
  });

  it("ignores a press and does not call the caller", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(createElement(Button, { busy: true, onClick }, "Schedule"));

    await user.click(screen.getByRole("button", { name: "Schedule" }));
    await user.keyboard("{Enter}");

    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not submit its form a second time, by press or by Enter in a field", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: Event) => event.preventDefault());
    render(
      createElement(
        "form",
        { onSubmit },
        createElement("input", { type: "text", "aria-label": "Title" }),
        createElement(Button, { type: "submit", busy: true }, "Schedule"),
      ),
    );

    await user.click(screen.getByRole("button", { name: "Schedule" }));
    // Implicit submission: Enter in a text field clicks the form's default button.
    await user.type(screen.getByLabelText("Title"), "x{Enter}");
    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
