/**
 * The two ways a token can be chosen correctly and still never reach a screen.
 *
 * Both of these shipped, both were invisible to typecheck, lint and grep, and
 * both were found only by reading computed style on a rendered page. Neither is
 * a matter of taste, so neither is left to review: a class that names a token
 * and a token that reaches the element are mechanical properties, and this is
 * where they are asserted.
 *
 * The sibling mechanism is `contrast.test.ts`, which answers whether the values
 * are right. This answers whether they arrive at all.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const BASE = join(here, "..", "..", "tokens", "base.css");
const THEME = join(here, "..", "..", "tokens", "theme.css");
const MODERN = join(here, "..", "..", "tokens", "modern.css");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

describe("token utilities are spelled so Tailwind emits them", () => {
  /**
   * `rounded-[--radius-lg]` was valid v3 shorthand for `var(--radius-lg)`. v4
   * emits `border-radius: --radius-lg`, which is not a value, so the browser
   * drops the declaration and the property falls back. The v4 spelling is
   * `rounded-(--radius-lg)`.
   *
   * Every failure mode is quiet: radii fell back to 0, border colours to the
   * global default in `base.css`, focus rings to `currentColor`, transitions to
   * `0s`. The class strings are spelled correctly and every token they name
   * exists, so nothing but a rendered page ever objected.
   *
   * Real arbitrary values are untouched by this: `h-[38px]` and
   * `tracking-[-0.02em]` are not variable references and stay as they are.
   */
  it("names a custom property with (--x) rather than the v3 [--x]", () => {
    const offenders = sourceFiles(here).flatMap((file) => {
      // Comments are stripped first, because the prose explaining this rule has
      // to be able to quote the thing it forbids. This file is the proof.
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((line) => !/^\s*\/\//.test(line))
        .join("\n");
      const hits = code.match(/\b[a-z][a-z-]*-\[--[a-z0-9-]+\]/g) ?? [];
      return hits.map((hit) => `${file.slice(here.length + 1)}: ${hit}`);
    });

    expect(offenders).toEqual([]);
  });
});

describe("every token a component names is one the theme defines", () => {
  /**
   * The third way a chosen token never reaches a screen, and the quietest.
   *
   * `border-(--gc-border)` is spelled correctly, generates a real rule, and
   * names a custom property that has never existed: the theme defines
   * `--gc-border-hairline`, `-subtle`, `-control`, `-strong` and `-accent`, and
   * no bare `--gc-border`. `var()` with no fallback resolves to nothing, the
   * declaration is dropped, and `border-color` lands on whatever `base.css`
   * sets for `*`, which is the hairline. So the input borders on sign-in,
   * first-run and second-factor enrolment drew at hairline weight instead of
   * the control weight that exists precisely for them.
   *
   * It survived because it is invisible from every direction: typecheck sees a
   * string, lint sees a string, the contrast suite tests the tokens that do
   * exist, and until `base.css` was layered every border drew at hairline
   * anyway, so nothing looked wrong.
   *
   * Scanned out of the shipped theme rather than a list kept here, so a token
   * that is renamed or removed breaks this the same way a typo does.
   */
  it("names no --gc-* custom property the theme file does not declare", () => {
    const theme = readFileSync(THEME, "utf8");
    const defined = new Set(Array.from(theme.matchAll(/(--gc-[a-z0-9-]+)\s*:/g), (m) => m[1]));

    const offenders: string[] = [];
    for (const file of sourceFiles(here)) {
      // Comments stripped for the same reason as the rule above: this one has
      // to be able to name the property it forbids.
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((line) => !/^\s*\/\//.test(line))
        .join("\n");
      for (const token of code.match(/--gc-[a-z0-9-]+/g) ?? []) {
        // A trailing dash is a prefix being built at runtime, not a reference.
        if (token.endsWith("-") || defined.has(token)) continue;
        offenders.push(`${file.slice(here.length + 1)}: ${token}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe("modern's tokens reach a screen too", () => {
  const modern = readFileSync(MODERN, "utf8");

  /**
   * The same check as the one above, for the second palette.
   *
   * It is landed before the first modern component on purpose, because a gate
   * written after the code it guards is a gate written to agree with it. It is
   * not idle in the meantime: `modern-contrast.test.ts` names the surface
   * tokens directly, so renaming `--gm-ground` in the palette fails this with
   * "modern-contrast.test.ts: --gm-ground" today. Verified by doing it.
   */
  it("names no --gm-* custom property modern.css does not declare", () => {
    const defined = new Set(Array.from(modern.matchAll(/(--gm-[a-z0-9-]+)\s*:/g), (m) => m[1]));

    const offenders: string[] = [];
    for (const file of sourceFiles(here)) {
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((line) => !/^\s*\/\//.test(line))
        .join("\n");
      for (const token of code.match(/--gm-[a-z0-9-]+/g) ?? []) {
        if (token.endsWith("-") || defined.has(token)) continue;
        offenders.push(`${file.slice(here.length + 1)}: ${token}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  /**
   * The fourth way a token never reaches a screen: it is declared, it is
   * correct, and no utility can say its name.
   *
   * A `--gm-` custom property in `:root` is reachable from hand-written CSS and
   * from a `bg-(--gm-plate)` arbitrary value, but the whole point of the
   * `@theme inline` block is that a caller writes `bg-m-plate`. A token added
   * to the palette and not to that block is invisible to every component that
   * uses the design system the way the design system asks to be used, and
   * nothing anywhere goes red: the class simply is not generated.
   *
   * This is the shape the `m-` prefix decision makes easy to get wrong, because
   * the two names differ (`--gm-plate` becomes `--color-m-plate`) so a missing
   * pair does not look like a missing pair.
   */
  it("exposes every semantic colour token through @theme inline", () => {
    const opens = modern.indexOf("@theme inline");
    expect(opens).toBeGreaterThan(-1);
    const mapped = new Set(
      Array.from(modern.slice(opens).matchAll(/var\(\s*(--gm-[a-z0-9-]+)\s*\)/g), (m) => m[1]),
    );

    // The dark block is the complete set: light overrides, it never adds.
    const rootEnd = modern.indexOf("}", modern.indexOf(":root {"));
    const declared = Array.from(
      modern.slice(0, rootEnd).matchAll(/(--gm-[a-z0-9-]+)\s*:/g),
      (m) => m[1] as string,
    );

    expect(declared.filter((token) => !mapped.has(token))).toEqual([]);
  });

  /**
   * Modern and console must not collide in the Tailwind namespace.
   *
   * They disagree about what `sunken`, `overlay`, `inset`, `accent` and every
   * status level are worth. If both files mapped `--color-sunken`, whichever
   * was imported second would silently redecide the other's colours, and an app
   * importing both would render console components in modern's palette with
   * nothing going red anywhere. The `m-` prefix is what prevents that, so it is
   * asserted rather than left as a convention somebody follows.
   */
  it("maps every modern utility under the m- prefix", () => {
    const opens = modern.indexOf("@theme inline");
    const names = Array.from(
      modern.slice(opens).matchAll(/^\s*(--[a-z]+(?:-[a-z]+)*?-[a-z0-9-]+)\s*:/gm),
      (m) => m[1] as string,
    );

    const unprefixed = names.filter(
      (name) => !/^--(color|shadow|text|radius|container|ease|duration)-m(-|$)/.test(name),
    );
    expect(unprefixed).toEqual([]);
  });
});

describe("a type step never shares a colour's name", () => {
  /**
   * `text-*` is two Tailwind namespaces at once: `--text-x` makes it a size,
   * `--color-x` makes it a colour. When both exist, `text-x` compiles to the
   * colour alone, an explicit `@utility` merges into the same rule rather than
   * winning, and the size, the leading and the weight are simply not there.
   *
   * That shipped. Modern's label step was `--text-m-control` beside the edge
   * colour `--color-m-control`, so every label set in it rendered in a 36%
   * alpha edge ink at the inherited size, failing AA in two products, while
   * every class string was spelled right and every token it named existed.
   * Read across both files, because an app imports them together.
   */
  it("declares no --text-* step whose name is also a --color-*", () => {
    const declared = (prefix: string): Set<string> =>
      new Set(
        [THEME, MODERN].flatMap((file) =>
          Array.from(
            readFileSync(file, "utf8").matchAll(new RegExp(`--${prefix}-([a-z0-9-]+?)\\s*:`, "g")),
            (m) => m[1] as string,
          ),
        ),
      );
    const colours = declared("color");
    const steps = Array.from(declared("text")).filter((name) => !name.includes("--"));

    expect(steps.filter((name) => colours.has(name))).toEqual([]);
  });
});

describe("base.css cannot outrank the utilities", () => {
  const css = readFileSync(BASE, "utf8");

  /**
   * An unlayered rule beats every layered one regardless of specificity, and
   * Tailwind puts its utilities in `@layer utilities`. While this file sat
   * outside a layer its `*` border-colour default won against every
   * `border-(--gc-border-*)` utility in the design system, so a control drew at
   * hairline instead of its own weight on all three surfaces. A `*` selector is
   * the widest possible reach, which is exactly why it has to be the weakest.
   */
  it("puts every rule inside @layer base", () => {
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const opensLayer = /@layer\s+base\s*\{/.test(withoutComments);
    expect(opensLayer).toBe(true);

    // Anything at column zero that is not the layer's own braces is a rule
    // sitting outside it, which is the state this test exists to refuse.
    const stray = withoutComments
      .split("\n")
      .filter((line) => line.trim() !== "")
      .filter((line) => !/^\s/.test(line))
      .filter((line) => !/^@layer\s+base\s*\{/.test(line))
      .filter((line) => line.trim() !== "}");

    expect(stray).toEqual([]);
  });
});
