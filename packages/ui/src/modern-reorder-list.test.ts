/**
 * ReorderList's markup contract, rendered rather than reasoned about.
 *
 * What a string can prove: the list is an ordered list with a name, every row
 * has two arrows named after the row, the arrows at the two ends are disabled,
 * the grip is decoration, and the live region exists before anything moves.
 * What it cannot prove (focus following the row, the announcement after a
 * press) is in `modern-reorder-list-interaction.test.ts`.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReorderList, type ReorderListItem } from "./modern/reorder-list.js";

interface Cover extends ReorderListItem {
  name: string;
}

const covers: Cover[] = [
  { key: "cdr", name: "GOpenCDR terms", content: "GOpenCDR terms" },
  {
    key: "aup",
    name: "acceptable use policy",
    content: "Acceptable use policy",
    verbs: createElement("button", { type: "button" }, "Remove"),
  },
  { key: "gs", name: "general terms", content: "General terms" },
];

function render(extra: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    createElement(ReorderList<Cover>, {
      label: "Covered documents, in order",
      items: covers,
      onChange: () => undefined,
      moveUpLabel: (item) => `Move ${item.name} up`,
      moveDownLabel: (item) => `Move ${item.name} down`,
      announce: (item, position, total) => `${item.name}, now ${position} of ${total}.`,
      ...extra,
    }),
  );
}

/** Every `<button ...>` opening tag, in document order. */
function buttons(html: string): string[] {
  return Array.from(html.matchAll(/<button[^>]*>/g), (m) => m[0]);
}

describe("ReorderList", () => {
  it("is a named ordered list that keeps its list role under list-style: none", () => {
    const html = render();
    expect(html).toMatch(/<ol role="list" aria-label="Covered documents, in order"/);
    expect(html.match(/<li[\s>]/g) ?? []).toHaveLength(3);
  });

  it("names every arrow after its row, from the caller's functions", () => {
    /*
     * A bare "Move up" is the name of every arrow on a screen with twelve rows.
     */
    const names = buttons(render())
      .map((tag) => /aria-label="([^"]*)"/.exec(tag)?.[1])
      .filter((name) => name !== undefined);
    expect(names).toEqual([
      "Move GOpenCDR terms up",
      "Move GOpenCDR terms down",
      "Move acceptable use policy up",
      "Move acceptable use policy down",
      "Move general terms up",
      "Move general terms down",
    ]);
  });

  it("disables only the first row's up and the last row's down", () => {
    const disabled = buttons(render()).map((tag) => tag.includes("disabled"));
    // The Remove verb sits between row two's arrows and row three's.
    expect(disabled).toEqual([true, false, false, false, false, false, true]);
    const tags = buttons(render());
    expect(tags[0]).toContain('aria-label="Move GOpenCDR terms up"');
    expect(tags[6]).toContain('aria-label="Move general terms down"');
    expect(tags[6]).toContain("disabled");
  });

  it("draws a disabled arrow with no material, and every arrow 32 by 32", () => {
    const tags = buttons(render()).filter((tag) => tag.includes("aria-label"));
    for (const tag of tags) expect(tag).toContain("size-8");
    expect(tags[0]).toContain("text-m-ink-off");
    expect(tags[0]).not.toContain("bg-m-plate");
    expect(tags[1]).toContain("bg-m-plate");
    expect(tags[1]).toContain("border-m-control");
  });

  it("puts the row's own verbs after both arrows", () => {
    const html = render();
    const down = html.indexOf('aria-label="Move acceptable use policy down"');
    const remove = html.indexOf(">Remove<");
    const nextRow = html.indexOf('aria-label="Move general terms up"');
    expect(down).toBeGreaterThan(-1);
    expect(remove).toBeGreaterThan(down);
    expect(remove).toBeLessThan(nextRow);
  });

  it("shows each row's position as a figure", () => {
    const figures = Array.from(
      render().matchAll(/<span class="[^"]*font-mono[^"]*">(\d+)<\/span>/g),
      (m) => m[1],
    );
    expect(figures).toEqual(["1", "2", "3"]);
  });

  it("hides the arrow glyphs, so the button's name is the only thing read", () => {
    const html = render();
    const svgs = html.match(/<svg[^>]*>/g) ?? [];
    expect(svgs).toHaveLength(6);
    for (const svg of svgs) expect(svg).toContain('aria-hidden="true"');
  });

  it("draws no grip unless asked, and a decorative one when asked", () => {
    expect((render().match(/<svg/g) ?? []).length).toBe(6);
    const withHandle = render({ handle: true });
    const svgs = withHandle.match(/<svg[^>]*>/g) ?? [];
    expect(svgs).toHaveLength(9);
    for (const svg of svgs) expect(svg).toContain('aria-hidden="true"');
    // A grip is a promise to drag, which this list does not keep yet.
    expect(withHandle).not.toContain("cursor-grab");
  });

  it("has an empty polite live region from the first paint", () => {
    /*
     * A region inserted together with its first message is not announced by
     * most screen readers, so it has to be there, empty, before any press.
     */
    const html = render();
    expect(html).toMatch(/<p role="status" class="sr-only"><\/p>/);
  });

  it("puts the marked row on the selected film without shifting it", () => {
    const html = render({ markedKey: "aup" });
    const rows = html.match(/<li class="[^"]*"/g) ?? [];
    expect(rows[1]).toContain("bg-m-selected");
    expect(rows[1]).toContain("border-m-accent/40");
    expect(rows[0]).toContain("border-transparent");
    expect(rows[0]).toContain("bg-m-plate");
  });

  it("disables both arrows of a list of one", () => {
    const html = renderToStaticMarkup(
      createElement(ReorderList, {
        label: "Sections",
        items: [{ key: "only", content: "Only section" }],
        onChange: () => undefined,
        moveUpLabel: () => "Move the only section up",
        moveDownLabel: () => "Move the only section down",
        announce: () => "",
      }),
    );
    const tags = buttons(html);
    expect(tags).toHaveLength(2);
    for (const tag of tags) expect(tag).toContain("disabled");
  });
});
