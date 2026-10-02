// @vitest-environment jsdom

/**
 * ReorderList's keyboard contract, observed in a document.
 *
 * The drawing's contract is three sentences, and each is a test here: Tab
 * reaches each arrow; pressing one moves the row and keeps focus on the same
 * arrow in its new place; at an end that arrow disables and focus moves to the
 * other one. Plus the announcement: "Acceptable use policy, now 2 of 3."
 *
 * The keyboard is used to press, not the mouse, because the contract is the
 * keyboard's: WCAG 2.5.7 is about a way to reorder that needs no dragging.
 */

import { act, cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createElement, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ReorderList, type ReorderListItem, type ReorderMove } from "./modern/reorder-list.js";

afterEach(cleanup);

interface Cover extends ReorderListItem {
  name: string;
}

const START: Cover[] = [
  { key: "cdr", name: "GOpenCDR terms", content: "GOpenCDR terms" },
  { key: "aup", name: "Acceptable use policy", content: "Acceptable use policy" },
  { key: "gs", name: "General terms", content: "General terms" },
];

/** The caller owns the order, as a real page does until its own confirm. */
function Harness({ moves }: { moves?: ReorderMove[] }) {
  const [items, setItems] = useState<readonly Cover[]>(START);
  return createElement(ReorderList<Cover>, {
    label: "Covered documents, in order",
    items,
    onChange: (next, move) => {
      moves?.push(move);
      setItems(next);
    },
    moveUpLabel: (item) => `Move ${item.name} up`,
    moveDownLabel: (item) => `Move ${item.name} down`,
    announce: (item, position, total) => `${item.name}, now ${position} of ${total}.`,
  });
}

function order(): string[] {
  return screen.getAllByRole("listitem").map((row) => row.textContent ?? "");
}

function status(): string {
  return screen.getByRole("status").textContent ?? "";
}

describe("ReorderList moves a row by keyboard and keeps focus with it", () => {
  it("lets Tab reach every arrow that can be pressed, and skips the two that cannot", async () => {
    const user = userEvent.setup();
    render(createElement(Harness, {}));

    const reached: string[] = [];
    for (let i = 0; i < 4; i++) {
      await user.tab();
      reached.push(document.activeElement?.getAttribute("aria-label") ?? "");
    }
    expect(reached).toEqual([
      "Move GOpenCDR terms down",
      "Move Acceptable use policy up",
      "Move Acceptable use policy down",
      "Move General terms up",
    ]);
  });

  it("moves the row and keeps focus on the same arrow in its new place", async () => {
    const user = userEvent.setup();
    const moves: ReorderMove[] = [];
    render(createElement(Harness, { moves }));

    const down = screen.getByRole("button", { name: "Move GOpenCDR terms down" });
    down.focus();
    await user.keyboard("{Enter}");

    expect(order()[1]).toContain("GOpenCDR terms");
    expect(moves).toEqual([{ key: "cdr", from: 0, to: 1 }]);
    // The same element, now in row two, and still the focused one.
    expect(document.activeElement).toBe(down);
    expect(screen.getAllByRole("listitem")[1]?.contains(down)).toBe(true);
  });

  it("keeps going when the same arrow is pressed again", async () => {
    const user = userEvent.setup();
    render(createElement(Harness, {}));

    const up = screen.getByRole("button", { name: "Move General terms up" });
    up.focus();
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(up);
    expect(order()[1]).toContain("General terms");
  });

  it("moves focus to the other arrow when the row reaches the bottom", async () => {
    const user = userEvent.setup();
    render(createElement(Harness, {}));

    const down = screen.getByRole("button", { name: "Move Acceptable use policy down" });
    down.focus();
    await user.keyboard("{Enter}");

    expect(order()[2]).toContain("Acceptable use policy");
    expect(down).toHaveProperty("disabled", true);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Move Acceptable use policy up" }),
    );
  });

  it("moves focus to the other arrow when the row reaches the top", async () => {
    const user = userEvent.setup();
    render(createElement(Harness, {}));

    const up = screen.getByRole("button", { name: "Move Acceptable use policy up" });
    up.focus();
    await user.keyboard(" ");

    expect(order()[0]).toContain("Acceptable use policy");
    expect(up).toHaveProperty("disabled", true);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Move Acceptable use policy down" }),
    );
  });

  it("announces where the row is now, politely", async () => {
    const user = userEvent.setup();
    render(createElement(Harness, {}));
    expect(status()).toBe("");

    screen.getByRole("button", { name: "Move GOpenCDR terms down" }).focus();
    await user.keyboard("{Enter}");
    expect(status()).toBe("GOpenCDR terms, now 2 of 3.");

    await user.keyboard("{Enter}");
    expect(status()).toBe("GOpenCDR terms, now 3 of 3.");
  });

  it("neither announces nor moves focus when the caller declines the move", async () => {
    /*
     * The order is the caller's. A list that announced on the press would
     * describe an order nobody accepted, which is worse than saying nothing.
     */
    const user = userEvent.setup();
    let asked = 0;
    function Declining({ items }: { items: readonly Cover[] }) {
      return createElement(ReorderList<Cover>, {
        label: "Covered documents, in order",
        items,
        onChange: () => {
          asked += 1;
        },
        moveUpLabel: (item) => `Move ${item.name} up`,
        moveDownLabel: (item) => `Move ${item.name} down`,
        announce: (item, position, total) => `${item.name}, now ${position} of ${total}.`,
      });
    }
    const view = render(createElement(Declining, { items: START }));
    const down = screen.getByRole("button", { name: "Move GOpenCDR terms down" });
    down.focus();
    await user.keyboard("{Enter}");

    expect(asked).toBe(1);
    expect(status()).toBe("");
    expect(order()[0]).toContain("GOpenCDR terms");

    // A later, unrelated change of items (same order, new array) must not
    // replay the declined move: no announcement, and focus left where it is.
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    act(() => {
      view.rerender(createElement(Declining, { items: [...START] }));
    });
    expect(status()).toBe("");
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});
