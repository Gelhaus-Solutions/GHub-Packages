/**
 * FilterButton and ListFilters, as markup: the button says its facet and its
 * value in words, a set facet looks set in more than colour, the targets are
 * 36 at a desk and 44 on a phone, and the count line is the one live region in
 * the row.
 *
 * The listbox only exists while open, and opening it is a keyboard contract,
 * so everything about it is asked of a document in
 * `modern-filter-button-interaction.test.ts`.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FilterButton, type FilterButtonProps } from "./modern/filter-button.js";
import { ListFilters, type ListFiltersProps } from "./modern/list-filters.js";

const PRODUCTS = [
  { value: "gopencdr", label: "GOpenCDR", hint: "17" },
  { value: "gopencnr", label: "GOpenCNR", hint: "18" },
  { value: "gopencsr", label: "GOpenCSR", hint: "12" },
];

function button(extra: Partial<FilterButtonProps> = {}): string {
  return renderToStaticMarkup(
    createElement(FilterButton, {
      label: "Product",
      anyLabel: "Any",
      value: null,
      options: PRODUCTS,
      onChange: () => undefined,
      ...extra,
    }),
  );
}

function classesOf(tag: string): string[] {
  return (/class="([^"]*)"/.exec(tag)?.[1] ?? "").split(" ");
}

describe("FilterButton", () => {
  it("is a button that says it opens a listbox, closed until asked", () => {
    const tag = /<button [^>]*>/.exec(button())?.[0] ?? "";
    expect(tag).toContain('type="button"');
    expect(tag).toContain('aria-haspopup="listbox"');
    expect(tag).toContain('aria-expanded="false"');
    expect(button()).not.toContain('role="listbox"');
  });

  it('says "Product: Any" when nothing is set, the value in quiet ink on the plain plate', () => {
    const html = button();
    expect(html).toContain("<span>Product:</span>");
    expect(html).toMatch(/<span class="font-normal text-m-ink-2">Any<\/span>/);
    const tag = /<button [^>]*>/.exec(html)?.[0] ?? "";
    expect(classesOf(tag)).toEqual(expect.arrayContaining(["border-m-control", "bg-m-plate"]));
  });

  it("says the chosen value in ink on the selected film with an accent edge when set", () => {
    const html = button({ value: "gopencnr" });
    expect(html).toMatch(/<span class="font-normal text-m-ink">GOpenCNR<\/span>/);
    const tag = /<button [^>]*>/.exec(html)?.[0] ?? "";
    expect(classesOf(tag)).toEqual(expect.arrayContaining(["border-m-accent/55", "bg-m-selected"]));
    expect(classesOf(tag)).not.toContain("bg-m-plate");
  });

  it("is 36 at a desk and at least 44 on a phone, with a visible ring", () => {
    const classes = classesOf(/<button [^>]*>/.exec(button())?.[0] ?? "");
    expect(classes).toEqual(
      expect.arrayContaining([
        "h-9",
        "max-sm:min-h-11",
        "focus-visible:outline-m-ring",
        "rounded-m-control",
      ]),
    );
  });

  it("draws its chevron as decoration", () => {
    const svg = /<svg[^>]*>/.exec(button())?.[0] ?? "";
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain("lucide-chevron-down");
    expect(svg).toContain('stroke-width="1.75"');
  });

  it("announces nothing of its own", () => {
    expect(button({ value: "gopencnr" })).not.toMatch(/role="(?:status|alert)"|aria-live/);
  });
});

function filters(extra: Partial<ListFiltersProps> = {}): string {
  return renderToStaticMarkup(
    createElement(ListFilters, {
      label: "Filter documents",
      count: "7 of 96 documents",
      search: {
        label: "Search documents",
        placeholder: "Title, key or version",
        value: "",
        onChange: () => undefined,
      },
      children: createElement(FilterButton, {
        label: "Product",
        anyLabel: "Any",
        value: "gopencnr",
        options: PRODUCTS,
        onChange: () => undefined,
      }),
      ...extra,
    }),
  );
}

describe("ListFilters", () => {
  it("is a search landmark named by the caller", () => {
    expect(filters()).toMatch(/<div role="search" aria-label="Filter documents"/);
  });

  it("has exactly one live region, the count line under the row", () => {
    const html = filters();
    expect(html.match(/role="status"|role="alert"|aria-live/g) ?? []).toHaveLength(1);
    expect(html).toMatch(
      /<p role="status" class="text-m-meta text-m-ink-3">7 of 96 documents<\/p>/,
    );
    expect(html.indexOf('role="status"')).toBeGreaterThan(html.indexOf('role="search"'));
  });

  it("labels the search field in words the eye does not need and the ear does", () => {
    const html = filters();
    expect(html).toMatch(/<label [^>]*><span class="sr-only">Search documents<\/span>/);
    const input = /<input [^>]*>/.exec(html)?.[0] ?? "";
    expect(input).toContain('type="search"');
    expect(input).toContain('placeholder="Title, key or version"');
    expect(classesOf(input)).toEqual(expect.arrayContaining(["h-9", "max-sm:h-11", "pl-[34px]"]));
  });

  it("draws the search glyph at 15, stroke 1.75, hidden", () => {
    const svg = /<svg[^>]*lucide-search[^>]*>/.exec(filters())?.[0] ?? "";
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain('stroke-width="1.75"');
    expect(svg).toContain("size-[15px]");
  });

  it("draws Clear only when the caller says something is set", () => {
    expect(filters()).not.toContain(">Clear<");
    expect(filters({ clear: null })).not.toContain(">Clear<");
    const html = filters({ clear: { label: "Clear", onClear: () => undefined } });
    expect(html).toMatch(
      /<button type="button" class="[^"]*text-m-accent-text[^"]*">Clear<\/button>/,
    );
  });

  it("leaves the search out when there is none", () => {
    expect(filters({ search: undefined })).not.toContain("<input");
  });
});
