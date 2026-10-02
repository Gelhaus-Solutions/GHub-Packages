// @vitest-environment jsdom

/**
 * Standing as assistive technology meets it: the objection is a link a person
 * can Tab to and that is named by its words, and what is left to read once the
 * hidden parts are gone is the one sentence and that link.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Standing } from "./modern/standing.js";

afterEach(cleanup);

/**
 * The text a screen reader can reach: everything not inside an aria-hidden
 * subtree. jsdom has no accessibility tree, so this walks the DOM the way the
 * tree is built from it for the one rule that matters here.
 */
function readable(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node instanceof Element && node.getAttribute("aria-hidden") === "true") return "";
  return Array.from(node.childNodes, readable).join(" ").replace(/\s+/g, " ").trim();
}

function restricted() {
  return createElement(Standing, {
    standing: "restricted",
    word: "Restricted",
    at: "on 21 Nov 2026, 00:00 CET",
    cause: createElement(
      "span",
      null,
      "Behind on ",
      createElement("code", null, "gs-terms-2026-10-01"),
    ),
    summary: "Restricted on 21 November 2026. Behind on gs-terms-2026-10-01.",
    objection: { text: "Objected 12 Oct, by mail", href: "#objections" },
  });
}

describe("Standing's objection marker", () => {
  it("is a link named by its words, pointing at the objection", () => {
    render(restricted());
    const link = screen.getByRole("link", { name: "Objected 12 Oct, by mail" });
    expect(link.getAttribute("href")).toBe("#objections");
  });

  it("is the one Tab stop in a standing", async () => {
    const user = userEvent.setup();
    render(restricted());
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("link"));
    await user.tab();
    expect(document.activeElement).toBe(document.body);
  });

  it("is not inside anything hidden from assistive technology", () => {
    render(restricted());
    let node: Element | null = screen.getByRole("link");
    while (node !== null) {
      expect(node.getAttribute("aria-hidden")).not.toBe("true");
      node = node.parentElement;
    }
  });
});

describe("Standing is heard as one sentence and the link", () => {
  it("leaves exactly the sentence, then the objection, to be read", () => {
    const { container } = render(restricted());
    expect(readable(container)).toBe(
      "Restricted on 21 November 2026. Behind on gs-terms-2026-10-01. Objected 12 Oct, by mail",
    );
  });

  it("composes the sentence when the caller passes none and the cause is a string", () => {
    const { container } = render(
      createElement(Standing, {
        standing: "asked",
        word: "Asked, accept by 26 Nov",
        cause: "A newer gs-terms-2026-10-01 is announced",
      }),
    );
    expect(readable(container)).toBe(
      "Asked, accept by 26 Nov. A newer gs-terms-2026-10-01 is announced.",
    );
  });
});
