/**
 * DraftKeeperBanner's markup contract: the modern Banner, unchanged, in info
 * tone, with the caller's sentence and the two verbs under it, neither of them
 * the page's one primary.
 *
 * The keeping itself (session storage, the offer on mount, the browser's
 * prompt) is in `modern-draft-keeper-interaction.test.ts`.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DraftKeeperBanner } from "./modern/draft-keeper.js";

function render(): string {
  return renderToStaticMarkup(
    createElement(DraftKeeperBanner, {
      title: "Your unsaved changes from 09:40 CEST are back",
      body: "You followed a link before saving; they were kept in this browser.",
      save: { label: "Save them", onSave: () => undefined },
      discard: { label: "Discard them", onDiscard: () => undefined },
    }),
  );
}

describe("DraftKeeperBanner", () => {
  it("is the info Banner, polite, never an interruption", () => {
    const html = render();
    expect(html).toMatch(/^<div role="status" class="[^"]*bg-m-info-wash[^"]*border-m-info\/34/);
    expect(html).toMatch(
      /<p class="text-m-label text-m-ink[^"]*">Your unsaved changes from 09:40 CEST are back<\/p>/,
    );
  });

  it("puts both verbs under the sentence, inside the banner", () => {
    const html = render();
    expect(html.indexOf("You followed a link")).toBeLessThan(html.indexOf(">Save them<"));
    expect(html).toMatch(
      /<button type="button" class="[^"]*border-m-control[^"]*bg-m-plate[^"]*">Save them<\/button>/,
    );
    expect(html).toMatch(
      /<button type="button" class="[^"]*text-m-accent-text[^"]*">Discard them<\/button>/,
    );
  });

  it("leaves the screen's one primary to the page's own save", () => {
    expect(render()).not.toContain("bg-m-accent ");
  });
});
