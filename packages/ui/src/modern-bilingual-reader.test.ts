/**
 * BilingualReader's markup contract: two articles, each marked with its
 * language and headed by its own `h2`, the file's identity above the title,
 * and the skip link and the switch each present only in the layout that has a
 * use for it.
 *
 * Choosing a language, and the `hidden` that follows, is observed in a
 * document in `modern-bilingual-reader-interaction.test.ts`.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BilingualReader,
  type BilingualReaderProps,
  type BilingualText,
} from "./modern/bilingual-reader.js";

const EN: BilingualText = {
  lang: "en",
  badge: "EN",
  languageName: "English",
  file: "gs-terms-2026-10-01.en.md",
  size: "48,213 bytes",
  hash: createElement("span", { "data-slot": "hash" }, "4f70b949…6b6a75"),
  title: "General terms and conditions",
  intro: "These terms apply to every product that refers to them.",
  body: createElement("h3", null, "1. Your content"),
};

const DE: BilingualText = {
  lang: "de",
  badge: "DE",
  languageName: "German",
  file: "gs-terms-2026-10-01.de.md",
  size: "53,604 bytes",
  title: "Allgemeine Geschäftsbedingungen",
  intro: "Diese Bedingungen gelten für jedes Produkt, das auf sie verweist.",
  body: createElement("h3", null, "1. Ihre Inhalte"),
};

function render(extra: Partial<BilingualReaderProps> = {}): string {
  return renderToStaticMarkup(
    createElement(BilingualReader, {
      texts: [EN, DE],
      switchLabel: "Language",
      skipLabel: "Skip to the German text",
      ...extra,
    }),
  );
}

function articles(html: string): string[] {
  return Array.from(html.matchAll(/<article[^>]*>.*?<\/article>/gs), (m) => m[0]);
}

describe("BilingualReader", () => {
  it("renders both texts as articles, each in its own language", () => {
    const [en, de] = articles(render());
    expect(en).toMatch(/^<article[^>]*lang="en"/);
    expect(de).toMatch(/^<article[^>]*lang="de"/);
    expect(de).toContain("Allgemeine Geschäftsbedingungen");
  });

  it("names each article by its title, which is the h2, and leaves h3 to the body", () => {
    for (const article of articles(render())) {
      const labelledBy = /aria-labelledby="([^"]*)"/.exec(article)?.[1] ?? "";
      expect(labelledBy).not.toBe("");
      expect(article).toMatch(new RegExp(`<h2 id="${labelledBy}"`));
      expect(article.match(/<h2[\s>]/g) ?? []).toHaveLength(1);
      expect(article).toMatch(/<h3>/);
    }
  });

  it("heads each text with its badge, file name and size, then the caller's hash", () => {
    const [en, de] = articles(render());
    const order = ["EN", "gs-terms-2026-10-01.en.md", "48,213 bytes", 'data-slot="hash"', "<h2"];
    const at = order.map((needle) => en?.indexOf(needle) ?? -1);
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    // No hash given, no empty row for one.
    expect(de).not.toContain("py-3");
  });

  it("sets the file name and size in mono, and the title not", () => {
    const [en] = articles(render());
    expect(en).toMatch(/<span class="[^"]*font-mono[^"]*">gs-terms-2026-10-01\.en\.md<\/span>/);
    expect(en).toMatch(/<h2 [^>]*class="(?![^"]*font-mono)[^"]*"/);
  });

  describe("side by side", () => {
    it("leads with a skip link to the second text, hidden until focused", () => {
      const html = render({ layout: "pair" });
      const link = /<a [^>]*>Skip to the German text<\/a>/.exec(html)?.[0] ?? "";
      const target = /href="#([^"]*)"/.exec(link)?.[1] ?? "";
      expect(target).not.toBe("");
      expect(link).toContain("sr-only");
      expect(link).toContain("focus:not-sr-only");
      const [, de] = articles(html);
      expect(de).toMatch(new RegExp(`^<article id="${target}"`));
      // Focusable by script, so the link lands in the text.
      expect(de).toContain('tabindex="-1"');
      // Before the first text, outside it, so it keeps the page's language.
      expect(html.indexOf("Skip to the German text")).toBeLessThan(html.indexOf("<article"));
    });

    it("shows both texts in two columns and keeps the switch out of the way", () => {
      const html = render({ layout: "pair" });
      expect(html).toContain("grid-cols-2");
      for (const article of articles(html)) expect(article).not.toMatch(/^<article[^>]* hidden/);
      expect(html).toMatch(/<div hidden=""><div role="radiogroup"/);
    });
  });

  describe("one at a time", () => {
    it("shows the switch as a radio group named by the caller, with languages as names", () => {
      const html = render({ layout: "single" });
      expect(html).toMatch(/<div><div role="radiogroup" aria-label="Language"/);
      expect(html).toContain('aria-label="English"');
      expect(html).toContain('aria-label="German"');
      expect(html).toMatch(/role="radio" aria-checked="true" aria-label="English"/);
    });

    it("keeps both texts in the DOM and hides the one not chosen", () => {
      const [en, de] = articles(render({ layout: "single" }));
      expect(en).not.toMatch(/^<article[^>]* hidden/);
      expect(de).toMatch(/^<article[^>]* hidden=""/);
      expect(de).toContain("Ihre Inhalte");
    });

    it("draws no skip link, since there is nothing to skip past", () => {
      expect(render({ layout: "single" })).not.toContain("Skip to the German text");
    });
  });

  describe("before it has measured itself", () => {
    it("shows both texts and lets a container query pick one column or two", () => {
      /*
       * The server render, and any page whose script never runs: both texts
       * readable, two columns only where the reader is 1080 wide.
       */
      const html = render();
      expect(html).toMatch(/^<div class="@container/);
      expect(html).toContain("@min-[1080px]:grid-cols-2");
      for (const article of articles(html)) expect(article).not.toMatch(/^<article[^>]* hidden/);
      expect(html).toContain("Skip to the German text");
    });
  });
});
