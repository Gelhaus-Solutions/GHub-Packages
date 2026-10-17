/**
 * The product marks and the avatar tints in `modern.css`, measured, and the
 * components that draw them, rendered.
 *
 * The marks are brand images and the tints a person's colour, so neither is
 * held to the text bar as a whole: a hue is a graphic and owes 3:1 against the
 * page behind it (WCAG 1.4.11), on white and on modern's near-black ground,
 * which are the two pages a mark sits on. The initial on a tint IS text, at
 * any size, so it owes 4.5; the bundle measured 9.8 to 11.2 and this holds it
 * there.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { contrastRatio, parseOklch, WCAG_AA, type Srgb } from "./contrast.js";
import { Avatar, avatarTint, ProductChip, ProductMark } from "./modern/index.js";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "tokens", "modern.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

/** The block that declares the marks: one of its own, outside the themed palettes. */
const block = /:root\s*\{([^}]*--gm-mark-tide[^}]*)\}/.exec(css)?.[1] ?? "";
const tokens = Object.fromEntries(
  [...block.matchAll(/(--gm-[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], (m[2] ?? "").trim()]),
);

function colour(value: string): Srgb {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex !== null) {
    const n = Number.parseInt(hex[1] as string, 16);
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
  }
  const parsed = parseOklch(value);
  if (parsed === undefined) throw new Error(`not a colour: ${value}`);
  return parsed;
}

/** Modern's dark ground, the near-black page a mark sits on. */
const darkGround = /:root\s*\{[^}]*?--gm-ground:\s*([^;]+);/.exec(css)?.[1] ?? "";
const WHITE = colour("#ffffff");

const HUES = ["tide", "harbour", "iris", "rose", "ember", "amber", "moss"] as const;

describe("the product marks", () => {
  it("declares all seven hues, paper and ink, theme-independent", () => {
    for (const hue of [...HUES, "paper", "ink"]) {
      expect(tokens[`--gm-mark-${hue}`], hue).toBeDefined();
    }
    expect(darkGround).not.toBe("");
  });

  it.each(HUES)("%s clears 3:1 on white and on the dark ground", (hue) => {
    const mark = colour(tokens[`--gm-mark-${hue}`] as string);
    expect(contrastRatio(mark, WHITE)).toBeGreaterThanOrEqual(WCAG_AA.NON_TEXT);
    expect(contrastRatio(mark, colour(darkGround))).toBeGreaterThanOrEqual(WCAG_AA.NON_TEXT);
  });
});

describe("the avatar tints", () => {
  it.each([1, 2, 3, 4, 5, 6, 7])("the initial on tint %i clears 9:1", (n) => {
    const ratio = contrastRatio(
      colour(tokens["--gm-avatar-ink"] as string),
      colour(tokens[`--gm-avatar-${String(n)}`] as string),
    );
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA.TEXT);
    // The bundle's measured floor, so a retint that still passes AA but drifts is seen.
    expect(ratio).toBeGreaterThanOrEqual(9.5);
  });

  it("picks a tint with the same hash as identity-chrome and Identity, by their shared vectors", () => {
    expect(avatarTint("")).toBe(2);
    expect(avatarTint("a")).toBe(5);
    expect(avatarTint("mira")).toBe(3);
    expect(avatarTint("cm2x7k9q00001")).toBe(1);
    expect(avatarTint("00000000-0000-4000-8000-000000000000")).toBe(2);
    expect(avatarTint("usr-42")).toBe(4);
  });
});

const render = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);

describe("Avatar", () => {
  it("draws the initial on the tint its key picks, hidden beside the name", () => {
    const html = render(createElement(Avatar, { name: "mira Kessler", tintKey: "mira" }));
    expect(html).toContain("bg-m-avatar-4");
    expect(html).toContain(">M<");
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("<img");
  });

  it("draws the picture where there is one, as decoration", () => {
    const html = render(
      createElement(Avatar, {
        name: "Mira",
        tintKey: "mira",
        src: "https://id.example/p.png",
        size: 72,
      }),
    );
    expect(html).toContain('<img src="https://id.example/p.png" alt=""');
    expect(html).toContain("width:72px");
    expect(html).not.toContain(">M<");
  });

  it("is an image with a name when it stands alone", () => {
    const html = render(
      createElement(Avatar, { name: "Mira", tintKey: "mira", label: "Mira Kessler" }),
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Mira Kessler"');
    expect(html).not.toContain("aria-hidden");
  });

  it("keeps a badge outside the hidden face, so a pencil button stays reachable", () => {
    const html = render(
      createElement(Avatar, {
        name: "Mira",
        tintKey: "mira",
        badge: createElement("button", { type: "button" }, "Change"),
      }),
    );
    expect(html).toMatch(
      /<span aria-hidden="true"[^>]*>M<\/span><span class="absolute[^"]*"><button/,
    );
  });
});

describe("ProductMark and ProductChip", () => {
  it("draws the mark, or the initial where there is none", () => {
    expect(
      render(createElement(ProductMark, { name: "GAdvisory", src: "https://id.example/m.svg" })),
    ).toContain('<img src="https://id.example/m.svg" alt=""');
    const initial = render(createElement(ProductMark, { name: "gadvisory", src: null, size: 32 }));
    expect(initial).toContain(">G<");
    expect(initial).toContain('aria-hidden="true"');
  });

  it("names the product beside its mark in a chip", () => {
    const html = render(createElement(ProductChip, { name: "GAdvisory", src: null }));
    expect(html).toContain(">GAdvisory</span>");
    expect(html).toContain("rounded-full");
  });
});
