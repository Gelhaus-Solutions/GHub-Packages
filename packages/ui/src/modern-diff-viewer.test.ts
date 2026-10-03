/**
 * DiffViewer's markup contract: a named region carrying the text's language,
 * real headings per hunk, a sign and a hidden prefix on every line, word marks
 * that are struck and underlined on their own films, a removed line without a
 * hue and an added one with the ok hue as a film only, folds that are buttons
 * naming what they hide, and a row that cannot push the page sideways.
 *
 * What a string cannot show (a fold opening in place, focus landing on the
 * first revealed line, `every` moving every fold) is asked of a document in
 * `modern-diff-viewer-interaction.test.ts`.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DiffViewer,
  type DiffBlock,
  type DiffLine,
  type DiffViewerProps,
} from "./modern/diff-viewer.js";

const WORDS = { removed: "Removed:", added: "Added:", unchanged: "Unchanged:" };

const ctx = (n: number, text: string, heading = false): DiffLine => ({
  kind: "ctx",
  n,
  parts: [{ kind: "plain", text }],
  heading,
});

const BLOCKS: DiffBlock[] = [
  {
    kind: "fold",
    label: "Show 2 unchanged paragraphs",
    lines: [ctx(13, "Text from a pull request may be sent to OpenRouter."), ctx(14, "It is kept.")],
  },
  {
    kind: "hunk",
    section: "4 Transfers",
    range: "15 to 17",
    lines: [
      ctx(15, "4 Transfers", true),
      {
        kind: "del",
        n: 17,
        parts: [
          { kind: "plain", text: "These transfers rely on " },
          { kind: "del", text: "safeguards set out in our agreement with OpenRouter" },
          { kind: "plain", text: "." },
        ],
      },
      {
        kind: "add",
        n: 17,
        parts: [
          { kind: "plain", text: "These transfers rely on " },
          { kind: "ins", text: "the EU-US Data Privacy Framework" },
          { kind: "plain", text: "." },
        ],
      },
    ],
  },
];

function render(extra: Partial<DiffViewerProps> = {}): string {
  return renderToStaticMarkup(
    createElement(DiffViewer, {
      blocks: BLOCKS,
      label: "Changes against 2026-10-03.2, English",
      lang: "en",
      words: WORDS,
      ...extra,
    }),
  );
}

/** Every element whose opening tag carries the class, as its opening tag. */
function tagsWith(html: string, cls: string): string[] {
  return Array.from(html.matchAll(/<[a-z0-9]+ [^>]*>/g), (m) => m[0]).filter((tag) =>
    (/class="([^"]*)"/.exec(tag)?.[1] ?? "").split(" ").includes(cls),
  );
}

describe("DiffViewer", () => {
  it("is a region named by the comparison and carrying the text's language", () => {
    const html = render({ describedBy: "summary" });
    expect(html).toMatch(
      /^<section aria-label="Changes against 2026-10-03.2, English" aria-describedby="summary" lang="en"/,
    );
    expect(html).toContain("bg-m-plate");
  });

  it("makes each hunk a real heading, h3 unless asked otherwise", () => {
    expect(render()).toMatch(/<h3 [^>]*><span>4 Transfers<\/span>/);
    expect(render({ headingLevel: 2 })).toMatch(/<h2 [^>]*><span>4 Transfers<\/span>/);
    expect(render({ headingLevel: 4 })).toMatch(/<h4 [^>]*><span>4 Transfers<\/span>/);
  });

  it("draws the range in mono after a pilcrow the eye sees and a reader skips", () => {
    expect(render()).toContain(
      '<span class="font-mono font-normal text-m-ink-3"><span aria-hidden="true">¶ </span>15 to 17</span>',
    );
  });

  it("sets the heading band on its own film", () => {
    expect(render()).toMatch(/<h3 class="[^"]*bg-m-diff-band/);
  });

  it("draws a document heading at heading weight inside its line, never as an h element", () => {
    const html = render();
    expect(html).toMatch(
      /<p class="[^"]*font-semibold[^"]*"><span class="sr-only">Unchanged: <\/span>4 Transfers<\/p>/,
    );
    // One heading in the markup: the hunk's. The document's own is a line.
    expect(html.match(/<h[1-6][\s>]/g) ?? []).toHaveLength(1);
  });

  describe("never colour alone", () => {
    const html = render();

    it("signs each changed line with a minus or a plus, hidden from assistive technology", () => {
      expect(html).toMatch(/<span aria-hidden="true" class="[^"]*">−<\/span>/);
      expect(html).toMatch(/<span aria-hidden="true" class="[^"]*">\+<\/span>/);
      // U+2212, not a hyphen-minus: it sits level with the plus.
      expect(html).not.toMatch(/<span aria-hidden="true" class="[^"]*">-<\/span>/);
    });

    it("puts the caller's hidden prefix before every line's text", () => {
      expect(html).toContain('<span class="sr-only">Removed: </span>These transfers rely on ');
      expect(html).toContain('<span class="sr-only">Added: </span>These transfers rely on ');
      expect(html).toContain('<span class="sr-only">Unchanged: </span>4 Transfers');
    });

    it("strikes removed words on the stronger grey film and underlines added ones on the stronger green", () => {
      const del = /<del class="([^"]*)">safeguards/.exec(html)?.[1] ?? "";
      const ins = /<ins class="([^"]*)">the EU-US/.exec(html)?.[1] ?? "";
      expect(del.split(" ")).toEqual(
        expect.arrayContaining(["line-through", "bg-m-diff-del-word", "text-m-ink"]),
      );
      expect(ins.split(" ")).toEqual(
        expect.arrayContaining(["underline", "bg-m-diff-add-word", "text-m-ink"]),
      );
    });

    it("lays a removed line on the grey film and an added one on the green film", () => {
      expect(tagsWith(html, "bg-m-diff-del")).toHaveLength(1);
      expect(tagsWith(html, "bg-m-diff-add")).toHaveLength(1);
    });

    it("gives removed text no hue: crit is kept for something lost", () => {
      expect(html).not.toMatch(/m-crit/);
    });

    it("never sets a paragraph in the ok ink, and draws no status dot", () => {
      const paragraphs = Array.from(html.matchAll(/<p class="([^"]*)"/g), (m) => m[1] as string);
      expect(paragraphs.length).toBeGreaterThan(0);
      for (const classes of paragraphs) expect(classes).not.toMatch(/m-ok/);
      expect(html).not.toContain("rounded-full");
      // The only ok ink is the plus, as the sheet draws it, and it is hidden.
      expect(tagsWith(html, "text-m-ok-ink")).toHaveLength(1);
      expect(tagsWith(html, "text-m-ok-ink")[0]).toContain('aria-hidden="true"');
    });

    it("steps the added line's number up to ink-2, where ink-3 misses AA on the dark film", () => {
      const numbers = Array.from(
        html.matchAll(/<span aria-hidden="true" class="([^"]*tabular-nums[^"]*)">(\d+)<\/span>/g),
        (m) => m[1] as string,
      );
      expect(numbers).toHaveLength(3);
      expect(numbers[2]).toContain("text-m-ink-2");
      expect(numbers[0]).toContain("text-m-ink-3");
    });
  });

  describe("at 390", () => {
    const html = render();

    it("hides the number column below sm and keeps two columns for sign and text", () => {
      const rows = tagsWith(html, "grid");
      expect(rows.length).toBe(3);
      for (const row of rows) {
        expect(row).toContain("grid-cols-[22px_minmax(0,1fr)]");
        expect(row).toContain("sm:grid-cols-[44px_22px_minmax(0,1fr)]");
      }
      for (const number of tagsWith(html, "tabular-nums")) {
        expect(number).toMatch(/class="hidden [^"]*sm:block/);
      }
    });

    it("wraps a long word inside the column rather than scrolling sideways", () => {
      for (const p of Array.from(html.matchAll(/<p class="([^"]*)"/g), (m) => m[1] as string)) {
        expect(p).toContain("min-w-0");
        expect(p).toContain("[overflow-wrap:anywhere]");
      }
      expect(html).not.toMatch(/overflow-x-(?:auto|scroll)/);
    });
  });

  describe("folds", () => {
    it("are buttons naming what they hide, with their lines left out until opened", () => {
      const html = render();
      expect(html).toMatch(
        /<button type="button" aria-expanded="false" class="[^"]*"><svg[^>]*aria-hidden="true"[^>]*>.*?<\/svg>Show 2 unchanged paragraphs<\/button>/,
      );
      expect(html).not.toContain("Text from a pull request");
    });

    it("start open when every line is asked for", () => {
      const html = render({ every: true });
      expect(html).not.toContain("<button");
      expect(html).toContain("Text from a pull request");
    });

    it("draw the chevrons at stroke 1.75", () => {
      expect(render()).toMatch(/<svg[^>]*lucide-chevrons-up-down[^>]*>/);
      expect(/<svg[^>]*>/.exec(render())?.[0]).toContain('stroke-width="1.75"');
    });
  });

  it("marks the caller's own words with their language when it differs from the text's", () => {
    const html = render({
      lang: "de",
      wordsLang: "en",
      label: "Changes against 2026-10-03.2, German",
    });
    expect(html).toMatch(/^<section [^>]*lang="de"/);
    expect(html).toContain('<span lang="en" class="sr-only">Removed: </span>');
    expect(html).toMatch(/<button type="button" aria-expanded="false" lang="en"/);
    expect(html).toContain('<span lang="en" class="font-mono font-normal text-m-ink-3">');
  });

  it("separates blocks with a hairline and none above the first", () => {
    const html = render();
    const blocks = Array.from(html.matchAll(/<section[^>]*>(<div[^>]*>)/g), (m) => m[1]);
    expect(blocks[0]).toBe("<div>");
    expect(html).toContain('<div class="border-t border-m-hairline"><h3');
  });

  it("announces nothing of its own: the page says when the comparison changed", () => {
    expect(render()).not.toMatch(/role="(?:status|alert)"|aria-live/);
  });
});
