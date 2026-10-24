// @vitest-environment jsdom

/**
 * ChoiceCards' consequence lists: unfolded under the chosen card only, and
 * never under a card that is blocked, so the group is read card by card rather
 * than as one wall of what-follows.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ChoiceCards, type ChoiceOption } from "./choice-cards.js";

afterEach(() => {
  cleanup();
});

const OPTIONS: ChoiceOption<"suspend" | "offboard">[] = [
  {
    key: "suspend",
    title: "Suspend",
    detail: "Pauses what they can reach.",
    consequences: ["Sessions pause"],
  },
  {
    key: "offboard",
    title: "Offboard",
    detail: "Ends what suspension only pauses.",
    danger: true,
    consequences: ["Ends 2 sessions", "Revokes 3 personal tokens"],
  },
];

function cards(value: "suspend" | "offboard" | null, options = OPTIONS) {
  return createElement(ChoiceCards<"suspend" | "offboard">, {
    label: "What happens to Jan",
    options,
    value,
    onChange: () => {},
  });
}

describe("ChoiceCards consequences", () => {
  it("shows none while nothing is chosen", () => {
    render(cards(null));
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("unfolds the chosen card's list and no other", () => {
    render(cards("offboard"));
    const items = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toEqual(["+Ends 2 sessions", "+Revokes 3 personal tokens"]);
    expect(screen.getByRole("radio", { name: /Offboard/u }).getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("never unfolds under a blocked card", () => {
    render(
      cards(
        "offboard",
        OPTIONS.map((option) => ({ ...option, blocked: "Not in this build" })),
      ),
    );
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});
