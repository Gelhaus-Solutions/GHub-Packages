// @vitest-environment jsdom

/**
 * DiffViewer's keyboard contract, in a document.
 *
 * The sheet's contract: folds are buttons in the tab order; Enter or Space
 * opens one in place, and focus moves to the first paragraph it revealed
 * (tabindex -1), so Tab continues from there. A fold stays open once opened.
 * When every line is asked for, every fold follows. Hunk headings are real
 * headings, so a screen reader moves change by change.
 *
 * VERIFIED BY MUTATION: dropping the focus move after a fold opens, and
 * dropping the fold reset when `every` changes, each turn this file red.
 */

import { act, cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { DiffViewer, type DiffBlock, type DiffLine } from "./modern/diff-viewer.js";

afterEach(cleanup);

const WORDS = { removed: "Removed:", added: "Added:", unchanged: "Unchanged:" };

const ctx = (n: number, text: string): DiffLine => ({
  kind: "ctx",
  n,
  parts: [{ kind: "plain", text }],
});

const BLOCKS: DiffBlock[] = [
  {
    kind: "fold",
    label: "Show 2 unchanged paragraphs",
    lines: [ctx(1, "First hidden paragraph."), ctx(2, "Second hidden paragraph.")],
  },
  {
    kind: "hunk",
    section: "5 How long we keep it",
    range: "21",
    lines: [
      {
        kind: "del",
        n: 21,
        parts: [{ kind: "plain", text: "Results are kept for 12 months; then deleted." }],
      },
      {
        kind: "add",
        n: 21,
        parts: [{ kind: "plain", text: "Results are kept for 12 months, then deleted." }],
      },
    ],
  },
  {
    kind: "fold",
    label: "Show 3 unchanged paragraphs",
    lines: [ctx(22, "Third hidden paragraph."), ctx(23, "Fourth."), ctx(24, "Fifth.")],
  },
  {
    kind: "hunk",
    section: "6 Your rights",
    range: "25",
    lines: [{ kind: "add", n: 25, parts: [{ kind: "plain", text: "You may object." }] }],
  },
];

function viewer(every = false) {
  return createElement(DiffViewer, {
    blocks: BLOCKS,
    label: "Changes against 2026-10-03.2, English",
    lang: "en",
    words: WORDS,
    every,
  });
}

/** The text a screen reader can reach: everything outside an aria-hidden subtree. */
function reachable(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node instanceof Element && node.getAttribute("aria-hidden") === "true") return "";
  return Array.from(node.childNodes, reachable).join("");
}

/** Collapsed once, at the top, so a space at the edge of an element still separates words. */
function readable(node: Node): string {
  return reachable(node).replace(/\s+/g, " ").trim();
}

describe("a fold", () => {
  it("opens in place on Enter and moves focus to the first paragraph it revealed", async () => {
    const user = userEvent.setup();
    render(viewer());
    const fold = screen.getByRole("button", { name: "Show 2 unchanged paragraphs" });
    fold.focus();
    await user.keyboard("{Enter}");

    expect(screen.queryByRole("button", { name: "Show 2 unchanged paragraphs" })).toBeNull();
    const first = screen.getByText("First hidden paragraph.").closest("[tabindex]");
    expect(first).not.toBeNull();
    expect(first?.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(first);
    expect(screen.getByText("Second hidden paragraph.")).toBeTruthy();
  });

  it("opens on Space too", async () => {
    const user = userEvent.setup();
    render(viewer());
    screen.getByRole("button", { name: "Show 3 unchanged paragraphs" }).focus();
    await user.keyboard(" ");
    expect(document.activeElement).toBe(
      screen.getByText("Third hidden paragraph.").closest("[tabindex]"),
    );
  });

  it("lets Tab carry on from the revealed paragraph to the next fold", async () => {
    const user = userEvent.setup();
    render(viewer());
    screen.getByRole("button", { name: "Show 2 unchanged paragraphs" }).focus();
    await user.keyboard("{Enter}");
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Show 3 unchanged paragraphs" }),
    );
  });

  it("is in the tab order, and the lines are not", async () => {
    const user = userEvent.setup();
    render(viewer());
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Show 2 unchanged paragraphs" }),
    );
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Show 3 unchanged paragraphs" }),
    );
  });

  it("stays open when another one opens", async () => {
    const user = userEvent.setup();
    render(viewer());
    await user.click(screen.getByRole("button", { name: "Show 2 unchanged paragraphs" }));
    await user.click(screen.getByRole("button", { name: "Show 3 unchanged paragraphs" }));
    expect(screen.getByText("First hidden paragraph.")).toBeTruthy();
    expect(screen.getByText("Third hidden paragraph.")).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("every line", () => {
  it("opens every fold when it turns on and closes every one, opened by hand or not, when it turns off", async () => {
    const user = userEvent.setup();
    const view = render(viewer(false));
    await user.click(screen.getByRole("button", { name: "Show 2 unchanged paragraphs" }));
    expect(screen.queryAllByRole("button")).toHaveLength(1);

    act(() => {
      view.rerender(viewer(true));
    });
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText("Fifth.")).toBeTruthy();

    act(() => {
      view.rerender(viewer(false));
    });
    expect(screen.queryAllByRole("button")).toHaveLength(2);
    expect(screen.queryByText("First hidden paragraph.")).toBeNull();
  });

  it("does not move focus: only a pressed fold does", () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    const view = render(viewer(false));
    act(() => {
      view.rerender(viewer(true));
    });
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});

describe("for a screen reader", () => {
  it("names the region and makes each hunk a level-3 heading", () => {
    render(viewer());
    expect(
      screen.getByRole("region", { name: "Changes against 2026-10-03.2, English" }),
    ).toBeTruthy();
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((h) => readable(h))).toEqual([
      "5 How long we keep it 21",
      "6 Your rights 25",
    ]);
  });

  it("reads each line as its prefix and its words, never its sign or its number", () => {
    render(viewer());
    const removed = screen.getByText("Results are kept for 12 months; then deleted.", {
      exact: false,
    });
    const row = removed.closest("div");
    expect(row).not.toBeNull();
    expect(readable(row as Element)).toBe("Removed: Results are kept for 12 months; then deleted.");
  });
});
