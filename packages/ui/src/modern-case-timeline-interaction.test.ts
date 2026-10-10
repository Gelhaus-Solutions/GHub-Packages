// @vitest-environment jsdom

/**
 * CaseTimeline's two choices are the caller's state (they belong in the
 * address), so what is asserted is that pressing one reports it and that the
 * pressed state is said, not only shown.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CaseTimeline } from "./modern/case-timeline.js";

afterEach(() => {
  cleanup();
});

describe("CaseTimeline's filters", () => {
  it("reports the order and the family chosen, and says which family is shown", async () => {
    const onOrderChange = vi.fn();
    const onShowChange = vi.fn();
    render(
      createElement(CaseTimeline, {
        entries: [],
        order: "newest",
        show: "all",
        onOrderChange,
        onShowChange,
      }),
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("radio", { name: "Oldest first" }));
    expect(onOrderChange).toHaveBeenCalledWith("oldest");

    expect(screen.getByRole("button", { name: "Everything" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Mail" }));
    expect(onShowChange).toHaveBeenCalledWith("mail");
  });
});
