/**
 * GoToButton's markup contract: a field-looking button that opens a dialog,
 * named in words, the shortcut said through `aria-keyshortcuts` rather than
 * read from the key cap, and an icon-only form on a phone that keeps its name.
 *
 * The dialog itself renders through a portal and only in a document, so
 * everything about it is in `modern-go-to-interaction.test.ts`; on the server
 * it renders nothing at all, which is asserted here.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GoTo, GoToButton, type GoToButtonProps } from "./modern/go-to.js";

function button(extra: Partial<GoToButtonProps> = {}): string {
  return renderToStaticMarkup(
    createElement(GoToButton, { label: "Go to", shortcut: "/", onOpen: () => undefined, ...extra }),
  );
}

function classesOf(tag: string): string[] {
  return (/class="([^"]*)"/.exec(tag)?.[1] ?? "").split(" ");
}

describe("GoToButton", () => {
  it("is a button that opens a dialog, with the shortcut said as a shortcut", () => {
    const tag = /<button [^>]*>/.exec(button())?.[0] ?? "";
    expect(tag).toContain('type="button"');
    expect(tag).toContain('aria-haspopup="dialog"');
    expect(tag).toContain('aria-keyshortcuts="/"');
    expect(tag).not.toContain("aria-label");
  });

  it("is drawn as a field: 36 tall, radius 10, the control edge on the inset well, quiet ink", () => {
    const classes = classesOf(/<button [^>]*>/.exec(button())?.[0] ?? "");
    expect(classes).toEqual(
      expect.arrayContaining([
        "h-9",
        "rounded-m-control",
        "border-m-control",
        "bg-m-inset",
        "shadow-m-inset",
        "text-m-ink-3",
        "focus-visible:outline-m-ring",
      ]),
    );
  });

  it("draws the search glyph at 15 and the key cap in mono, both hidden", () => {
    const html = button();
    const svg = /<svg[^>]*>/.exec(html)?.[0] ?? "";
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain("size-[15px]");
    expect(svg).toContain('stroke-width="1.75"');
    expect(html).toMatch(/<kbd aria-hidden="true" class="[^"]*font-mono[^"]*">\/<\/kbd>/);
  });

  it("draws no key cap when there is no shortcut", () => {
    const html = button({ shortcut: undefined });
    expect(html).not.toContain("<kbd");
    expect(html).not.toContain("aria-keyshortcuts");
  });

  it("goes icon only and 44 square on a phone when compact, keeping its name", () => {
    const html = button({ compact: true });
    const tag = /<button [^>]*>/.exec(html)?.[0] ?? "";
    expect(tag).toContain('aria-label="Go to"');
    expect(classesOf(tag)).toEqual(expect.arrayContaining(["max-sm:size-11"]));
    expect(html).toMatch(/<span class="[^"]*max-sm:hidden[^"]*">Go to<\/span>/);
  });
});

describe("GoTo", () => {
  it("renders nothing on the server, open or not", () => {
    for (const open of [false, true]) {
      const html = renderToStaticMarkup(
        createElement(GoTo, {
          open,
          onClose: () => undefined,
          title: "Go to",
          inputLabel: "Go to",
          placeholder: "Product, document or version",
          query: "",
          onQueryChange: () => undefined,
          groups: [],
          status: "",
          emptyLabel: "No product, document or version matches.",
          onChoose: () => undefined,
        }),
      );
      expect(html).toBe("");
    }
  });
});
