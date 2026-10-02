// @vitest-environment jsdom

/**
 * What pressing Hash's two buttons does, in a document.
 *
 * The claims that markup cannot show: the copy takes the WHOLE value although
 * only fourteen characters are on screen, a refusal from the clipboard is said
 * out loud, the copy is one tab stop and Show full the next, and Show full opens
 * the grouped value in place without moving focus off the trigger.
 *
 * user-event's `setup()` installs its own clipboard on `navigator`, so the
 * copied text can be read back rather than inferred from a spy.
 */

import { act, cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Hash, type HashProps } from "./modern/hash.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const SHA = "4f70b949879bfff286688687888cc5bfd40d66fc442b85635b01cd5edd6b6a75";
const LABEL = "Copy the sha256 of the English text";
const REFUSED = "This browser would not copy it. Select it by hand.";

function renderHash(props: Partial<HashProps> = {}) {
  return render(
    createElement(Hash, {
      value: SHA,
      label: LABEL,
      showFullLabel: "Show full",
      hideFullLabel: "Hide full",
      copiedLabel: "Copied",
      refusedLabel: REFUSED,
      ...props,
    }),
  );
}

function copyButton(): HTMLElement {
  return screen.getByRole("button", { name: `${LABEL}: ${SHA}` });
}

describe("Hash copies the whole value", () => {
  it("puts all sixty-four characters on the clipboard, not the short form", async () => {
    const user = userEvent.setup();
    renderHash();

    await user.click(copyButton());

    expect(await navigator.clipboard.readText()).toBe(SHA);
    expect(screen.getByRole("status").textContent).toBe("Copied");
  });

  it("says so when the browser refuses the clipboard", async () => {
    const user = userEvent.setup();
    renderHash();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));

    await user.click(copyButton());

    expect(screen.getByRole("status").textContent).toBe(REFUSED);
  });

  it("goes quiet again after the tick, so the next copy is announced afresh", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    renderHash();

    await user.click(copyButton());
    expect(screen.getByRole("status").textContent).toBe("Copied");

    act(() => {
      vi.advanceTimersByTime(1700);
    });
    expect(screen.getByRole("status").textContent).toBe("");
  });
});

describe("Hash answers the keyboard", () => {
  it("is one stop for the copy and the next for Show full", async () => {
    const user = userEvent.setup();
    renderHash();

    await user.tab();
    expect(document.activeElement).toBe(copyButton());
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Show full" }));
  });

  it("opens the grouped value in place on Enter and keeps focus on the trigger", async () => {
    const user = userEvent.setup();
    renderHash();
    const trigger = screen.getByRole("button", { name: "Show full" });
    const panel = document.getElementById(trigger.getAttribute("aria-controls") as string);
    expect(panel?.hidden).toBe(true);

    trigger.focus();
    await user.keyboard("{Enter}");

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(panel?.hidden).toBe(false);
    expect(panel?.textContent).toContain("4f70b949 879bfff2 86688687");
    expect(document.activeElement).toBe(trigger);
    expect(trigger.textContent).toBe("Hide full");

    await user.keyboard(" ");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(panel?.hidden).toBe(true);
    // Hidden, not unmounted, as in Disclosure.
    expect(document.getElementById(panel?.id as string)).toBe(panel);
  });

  it("keeps one label when no closing label is given, and lets aria-expanded say which", async () => {
    const user = userEvent.setup();
    renderHash({ hideFullLabel: undefined });
    const trigger = screen.getByRole("button", { name: "Show full" });

    await user.click(trigger);

    expect(trigger.textContent).toBe("Show full");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("Hash tells a screen reader the verdict where the value is", () => {
  it("describes the copy button as matching or not, in words", () => {
    renderHash({
      value: "e0c5cedd3b1c4a2f9d7e6b5a4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8aa71f02",
      verdict: {
        expected: SHA,
        matchesLabel: "Matches",
        mismatchLabel: "Does not match",
        expectedLabel: "Expected",
      },
    });
    const button = screen.getByRole("button", { name: /^Copy the sha256/ });
    expect(screen.getByRole("button", { description: /^Does not match Expected 4f70b949/ })).toBe(
      button,
    );
  });
});
