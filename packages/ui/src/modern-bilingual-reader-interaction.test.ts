// @vitest-environment jsdom

/**
 * BilingualReader's switch, observed in a document. The contract: both texts
 * stay in the DOM and the switch only sets `hidden`, the switch is a radio
 * group with one tab stop where the arrows choose, and side by side the skip
 * link lands in the second text.
 *
 * jsdom has no layout and no ResizeObserver, so these pass `layout` rather
 * than relying on the reader measuring itself. The measuring is a few lines of
 * observer; the contract is everything after it.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { BilingualReader, type BilingualText } from "./modern/bilingual-reader.js";

afterEach(cleanup);

const EN: BilingualText = {
  lang: "en",
  badge: "EN",
  languageName: "English",
  file: "gs-terms-2026-10-01.en.md",
  size: "48,213 bytes",
  title: "General terms and conditions",
  body: createElement("p", null, "You keep all rights in what you upload."),
};

const DE: BilingualText = {
  lang: "de",
  badge: "DE",
  languageName: "German",
  file: "gs-terms-2026-10-01.de.md",
  size: "53,604 bytes",
  title: "Allgemeine Geschäftsbedingungen",
  body: createElement("p", null, "Sie behalten alle Rechte an dem, was Sie hochladen."),
};

function reader(layout: "pair" | "single" | "auto") {
  return createElement(BilingualReader, {
    texts: [EN, DE],
    switchLabel: "Language",
    skipLabel: "Skip to the German text",
    layout,
  });
}

/** Every article, hidden or not, which is the point: both stay. */
function both(): [HTMLElement, HTMLElement] {
  const found = document.querySelectorAll<HTMLElement>("article");
  expect(found).toHaveLength(2);
  return [found[0] as HTMLElement, found[1] as HTMLElement];
}

describe("BilingualReader one at a time", () => {
  it("shows the first text and hides the second, keeping both", () => {
    render(reader("single"));
    const [en, de] = both();
    expect(en.hidden).toBe(false);
    expect(de.hidden).toBe(true);
    expect(screen.getByRole("article", { name: "General terms and conditions" })).toBe(en);
    expect(screen.queryByRole("article", { name: "Allgemeine Geschäftsbedingungen" })).toBeNull();
  });

  it("swaps which text is hidden when German is chosen, without unmounting either", async () => {
    const user = userEvent.setup();
    render(reader("single"));
    const [en, de] = both();

    await user.click(screen.getByRole("radio", { name: "German" }));

    const [enAfter, deAfter] = both();
    expect(enAfter).toBe(en);
    expect(deAfter).toBe(de);
    expect(en.hidden).toBe(true);
    expect(de.hidden).toBe(false);
    expect(de.getAttribute("lang")).toBe("de");
    expect(screen.getByRole("radio", { name: "German" }).getAttribute("aria-checked")).toBe("true");
  });

  it("is one tab stop where the arrows choose", async () => {
    const user = userEvent.setup();
    render(reader("single"));

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "English" }));

    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "German" }));
    const [en, de] = both();
    expect(en.hidden).toBe(true);
    expect(de.hidden).toBe(false);

    await user.keyboard("{ArrowLeft}");
    expect(en.hidden).toBe(false);
    expect(de.hidden).toBe(true);
  });

  it("has no skip link", () => {
    render(reader("single"));
    expect(screen.queryByRole("link", { name: "Skip to the German text" })).toBeNull();
  });
});

describe("BilingualReader side by side", () => {
  it("shows both texts and no switch", () => {
    render(reader("pair"));
    const [en, de] = both();
    expect(en.hidden).toBe(false);
    expect(de.hidden).toBe(false);
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("lets the skip link be the first Tab stop and land focus in the second text", async () => {
    const user = userEvent.setup();
    render(reader("pair"));

    await user.tab();
    const skip = screen.getByRole("link", { name: "Skip to the German text" });
    expect(document.activeElement).toBe(skip);

    const target = document.getElementById(skip.getAttribute("href")?.slice(1) ?? "");
    const [, de] = both();
    expect(target).toBe(de);
    /*
     * jsdom does not follow an in-page link with focus, so the half that can
     * be checked here is that the target can take it. A browser moves focus
     * there on activation because of exactly this attribute.
     */
    de.focus();
    expect(document.activeElement).toBe(de);
  });
});

describe("BilingualReader before it can measure", () => {
  it("shows both texts when there is no ResizeObserver to decide", () => {
    render(reader("auto"));
    const [en, de] = both();
    expect(en.hidden).toBe(false);
    expect(de.hidden).toBe(false);
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });
});
