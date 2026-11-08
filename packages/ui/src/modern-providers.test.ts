/**
 * The ways in through somebody else, drawn for GPlatform Identity's sign-in
 * (option A): the brand marks, the full-width provider button, the grid that
 * leads with the first and folds above six, and the button inside a field.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BRAND_NAMES,
  BrandMark,
  Input,
  isBrandName,
  ProviderButton,
  ProviderGrid,
} from "./modern/index.js";

const render = (element: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(element);

describe("BrandMark", () => {
  it("draws every brand, hidden from a screen reader", () => {
    for (const brand of BRAND_NAMES) {
      const html = render(createElement(BrandMark, { brand }));
      expect(html).toMatch(/^<svg aria-hidden="true"/u);
      expect(html).toContain("<path");
    }
  });

  it("gives the black marks the text colour, so they read on either plate", () => {
    for (const brand of ["apple", "github", "x"] as const) {
      expect(render(createElement(BrandMark, { brand }))).toContain('fill="currentColor"');
    }
    expect(render(createElement(BrandMark, { brand: "google" }))).not.toContain("currentColor");
    expect(render(createElement(BrandMark, { brand: "microsoft" })).match(/<path/gu)).toHaveLength(
      4,
    );
  });

  it("knows the provider types by name and nothing else", () => {
    expect(isBrandName("github")).toBe(true);
    expect(isBrandName("custom_oidc")).toBe(false);
  });
});

describe("ProviderButton", () => {
  it("is a button with its mark before the words", () => {
    const html = render(
      createElement(ProviderButton, {
        label: "Continue with GitHub",
        mark: createElement(BrandMark, { brand: "github" }),
      }),
    );
    expect(html).toMatch(/^<button type="button"/u);
    expect(html.indexOf("<svg")).toBeLessThan(html.indexOf("Continue with GitHub"));
  });

  it("draws the lead in ink and the rest on the plate", () => {
    expect(render(createElement(ProviderButton, { label: "A", lead: true }))).toContain("bg-m-ink");
    expect(render(createElement(ProviderButton, { label: "B" }))).toContain("bg-m-plate");
  });

  it("says it is busy", () => {
    expect(render(createElement(ProviderButton, { label: "A", busy: true }))).toContain(
      'aria-busy="true"',
    );
  });
});

describe("ProviderGrid", () => {
  const providers = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      id: `p${String(index)}`,
      label: `P${String(index)}`,
    }));
  const grid = (count: number, busyId: string | null = null) =>
    render(
      createElement(ProviderGrid, {
        providers: providers(count),
        onChoose: () => undefined,
        moreLabel: (remaining: number) => `Show the other ${String(remaining)}`,
        busyId,
      }),
    );

  it("renders nothing for an empty list", () => {
    expect(grid(0)).toBe("");
  });

  it("leads with the first and only the first", () => {
    expect(grid(3).match(/bg-m-ink /gu)).toHaveLength(1);
    expect(grid(3).indexOf("bg-m-ink ")).toBeLessThan(grid(3).indexOf("P1"));
  });

  it("shows six whole and folds seven to five and the count", () => {
    expect(grid(6)).not.toContain("Show the other");
    const folded = grid(7);
    expect(folded.match(/<button/gu)).toHaveLength(6);
    expect(folded).toContain("Show the other 2");
  });

  it("holds the others still while one round trip starts", () => {
    const html = grid(2, "p1");
    expect(html.match(/disabled=""/gu)).toHaveLength(1);
    expect(html).toContain('aria-busy="true"');
  });
});

describe("Input's action", () => {
  it("is the bare field without one", () => {
    expect(render(createElement(Input, { "aria-label": "Address" }))).toMatch(/^<input/u);
  });

  it("is a named button inside the field, which leaves room for it", () => {
    const html = render(
      createElement(Input, {
        "aria-label": "Address",
        action: { label: "Sign in with a passkey", icon: "K", onClick: () => undefined },
      }),
    );
    expect(html).toMatch(/^<div class="relative"><input[^>]*pr-12/u);
    expect(html).toContain(
      '<button type="button" aria-label="Sign in with a passkey" title="Sign in with a passkey"',
    );
  });

  it("says it is busy", () => {
    const html = render(
      createElement(Input, {
        "aria-label": "Address",
        action: { label: "Key", icon: "K", onClick: () => undefined, busy: true },
      }),
    );
    expect(html).toContain('aria-busy="true"');
  });
});
