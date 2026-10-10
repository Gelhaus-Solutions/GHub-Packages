/**
 * The list blocks drawn for GPlatform Legal's Phase 1 (area tabs, saved
 * views, row selection with its bulk bar, the pager, stat tiles and the
 * distribution bar), rendered and their contracts asserted.
 */

import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BulkBar,
  Checkbox,
  DistributionBar,
  Pager,
  pagerPages,
  SavedViews,
  StatTile,
  Table,
  Tabs,
} from "./modern/index.js";

function render(node: unknown): string {
  return renderToStaticMarkup(node as never);
}

const link = ({
  href,
  className,
  children,
  ...rest
}: {
  href: string;
  className: string;
  children: ReactNode;
}) => createElement("a", { href, className, ...rest }, children);

describe("Tabs, segmented", () => {
  const html = render(
    createElement(Tabs, {
      label: "Agreements",
      variant: "segmented",
      renderLink: link,
      tabs: [
        { href: "/agreements", label: "Agreements", count: "4,288", current: true },
        { href: "/agreements/organisations", label: "Parties", count: "413" },
      ],
    }),
  );

  it("is navigation, with the current list marked as the page", () => {
    expect(html).toMatch(/^<nav aria-label="Agreements"/);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).not.toContain('role="tab"');
  });

  it("carries each list's count as a badge, quiet on the current one", () => {
    expect(html).toContain("4,288");
    expect(html).toContain("bg-m-hover text-m-ink-2");
  });

  it("says a flagged tab needs attention in words, not only a dot", () => {
    const flagged = render(
      createElement(Tabs, {
        label: "Agreement",
        renderLink: link,
        tabs: [{ href: "?tab=linked", label: "Linked", count: 3, flag: "needs attention" }],
      }),
    );
    expect(flagged).toContain('<span class="sr-only">, needs attention</span>');
  });
});

describe("SavedViews", () => {
  const html = render(
    createElement(SavedViews, {
      label: "Saved views",
      renderLink: link,
      views: [
        { key: "all", label: "All", href: "?view=all", count: "4,288", current: true },
        {
          key: "needs-me",
          label: "Needs me",
          href: "?view=needs-me",
          count: 54,
          tone: "accent-wash",
        },
      ],
    }),
  );

  it("are links that set the view, the current one marked", () => {
    expect(html).toContain('href="?view=needs-me"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("light the current view's count in solid accent and keep the others' tones", () => {
    expect(html).toContain("bg-m-accent text-m-accent-on");
    expect(html).toContain("bg-m-accent-wash text-m-accent-text");
  });
});

describe("Checkbox", () => {
  it("is a named checkbox that says mixed for some", () => {
    const html = render(
      createElement(Checkbox, {
        checked: "mixed",
        label: "Select all on this page",
        onCheckedChange: () => undefined,
      }),
    );
    expect(html).toContain('role="checkbox"');
    expect(html).toContain('aria-checked="mixed"');
    expect(html).toContain('aria-label="Select all on this page"');
  });
});

describe("Table with selection", () => {
  type Row = { id: string; n: string };
  const rows: Row[] = [
    { id: "a", n: "GS-DPA-2026-0418" },
    { id: "b", n: "GS-SA-2026-0207" },
  ];
  function table(selected: string[], bar?: ReactNode) {
    return render(
      createElement(Table<Row>, {
        caption: "Agreements",
        rows,
        rowKey: (row) => row.id,
        columns: [{ key: "n", header: "Agreement", cell: (row) => row.n }],
        minWidth: 900,
        selection: {
          selected: new Set(selected),
          onChange: () => undefined,
          rowLabel: (row) => row.n,
          ...(bar === undefined ? {} : { bar }),
        },
      }),
    );
  }

  it("leads each row with a checkbox named by its reference, and select-all in the header", () => {
    const html = table([]);
    expect(html).toContain('aria-label="GS-DPA-2026-0418"');
    expect(html).toContain('aria-label="Select all on this page"');
    expect(html).toContain("min-width:900px");
  });

  it("says some are selected, and washes the selected rows", () => {
    const html = table(["a"]);
    expect(html).toContain('aria-checked="mixed"');
    expect(html).toContain('<tr class="bg-m-accent-wash">');
  });

  it("puts the bulk bar in the header row's place while anything is selected, keeping the headers for a screen reader", () => {
    const bar = createElement(BulkBar, {
      selectedText: "1 selected",
      onClear: () => undefined,
      children: createElement("button", { type: "button" }, "Send reminders"),
    });
    const html = table(["a"], bar);
    expect(html.indexOf("1 selected")).toBeLessThan(html.indexOf("<table"));
    expect(html).toContain('<tr class="[&amp;&gt;th]:sr-only">');
    expect(html).toContain('scope="col"');
  });
});

describe("Pager", () => {
  it("keeps the first pages, the current one with its neighbours and the last", () => {
    expect(pagerPages(1, 215)).toEqual([1, 2, 3, null, 215]);
    expect(pagerPages(9, 215)).toEqual([1, 2, 3, null, 8, 9, 10, null, 215]);
    expect(pagerPages(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("is navigation by link, the current page marked", () => {
    const html = render(
      createElement(Pager, {
        summary: "1–20 of 4,288",
        page: 1,
        pages: 215,
        href: (page: number) => `?page=${String(page)}`,
        renderLink: link,
      }),
    );
    expect(html).toContain('<nav aria-label="Pages"');
    expect(html).toContain('href="?page=215"');
    expect(html).toContain('aria-label="Next page"');
    expect(html).not.toContain("Previous page");
  });
});

describe("StatTile", () => {
  it("is a link to the list it counts, with its level in words and a dot", () => {
    const html = render(
      createElement(StatTile, {
        label: "Past deadline",
        level: "crit",
        value: "5",
        hot: true,
        delta: { text: "+2 wk", bad: true },
        href: "/agreements?view=late",
        renderLink: link,
      }),
    );
    expect(html).toMatch(/^<a href="\/agreements\?view=late"/);
    expect(html).toContain("Past deadline");
    expect(html).toContain("bg-m-crit-wash text-m-crit-ink");
  });
});

describe("DistributionBar", () => {
  it("hides the bar and lets the legend carry every number", () => {
    const html = render(
      createElement(DistributionBar, {
        segments: [
          { key: "done", label: "Done", value: 1812, level: "ok" },
          { key: "late", label: "Overdue", value: 8, level: "crit", bad: true },
        ],
      }),
    );
    expect(html).toContain('aria-hidden="true" class="flex h-2');
    expect(html).toContain("1,812");
    expect(html).toContain("text-m-crit-ink");
  });
});
