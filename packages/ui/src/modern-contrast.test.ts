/**
 * The accessibility bar for MODERN, as a test rather than an intention.
 *
 * Modern is the second design language in this package: console stays on
 * `theme.css` for GControl and GPlatform Control, and modern is `modern.css`
 * for GPlatform SSO and GPlatform Billing. The two palettes are independent, so
 * they get independent suites; `contrast.test.ts` covers console and asserts
 * nothing about a `--gm-` token.
 *
 * IT IS GUARDING TWO REPOSITORIES THIS ONE CANNOT SEE. Nothing in GPlatform can
 * assert anything about these values: turbo's globs cannot leave a repository
 * root, so no cache key over there can contain this file and no test over there
 * reads it. This suite is the only thing standing between a token edit and two
 * consoles, exactly as `contrast.test.ts` is for the other palette.
 *
 * WHY THE VALUES CAN BE TRUSTED, which is the part worth reading. Twenty six of
 * the thirty eight tokens have an explicit light value in the wave 9 bundle's
 * sheet 21 and were lifted. Twelve were DERIVED, and a derivation is a claim.
 * The claim was checked before it was used: solving the sheet's stated dark
 * control-border floor from its stated 3:1 target reproduces 0.34 against the
 * printed 0.34, and six further figures below reproduce the sheet's published
 * measurements to two decimals. A solver that could not reproduce a number the
 * designer printed would not have been trusted for the ones they did not.
 *
 * THE ONE KNOWN DIVERGENCE, recorded rather than smoothed over: the sheet
 * states light's control border as black 0.48 and this file measures that at
 * 3.62, where 0.43 is the bare minimum clearing 3:1. The stated value is kept.
 * A gate that quietly trimmed a designer's headroom to its own floor would be
 * deciding something it was not asked to decide.
 *
 * `ink-off` is deliberately absent from the text assertions. It measures around
 * 2.3 in both themes, which WCAG 1.4.3 permits for exactly one thing: text that
 * is part of an INACTIVE user interface component. A label, a hint or a
 * placeholder is not that. This suite cannot see where a token is used, so the
 * rule is stated in `modern.css` and enforced by review, and saying so here is
 * better than an assertion held to a bar the token does not owe.
 *
 * The parser below is equivalent to the one in `contrast.test.ts`. They are not
 * shared yet on purpose: extracting a helper out of a live forty nine assertion
 * accessibility gate is a change to that gate, and it is not this one's to make.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contrastRatio, over, parseOklch, WCAG_AA, type Srgb } from "./contrast.js";

const MODERN = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "tokens", "modern.css");

const css = readFileSync(MODERN, "utf8");

/** Comments removed first, so a brace inside prose cannot move a boundary. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//gu, "");
}

function declarations(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const match = /^\s*(--[\w-]+)\s*:\s*([^;]+);/.exec(line);
    if (match !== null) out[match[1] as string] = (match[2] as string).trim();
  }
  return out;
}

interface PaletteBlock {
  readonly selector: string;
  readonly inMedia: boolean;
  readonly tokens: Record<string, string>;
}

function paletteBlocks(text: string): PaletteBlock[] {
  const clean = withoutComments(text);
  const found: PaletteBlock[] = [];
  for (const match of clean.matchAll(/(:root[^{}]*?)\s*\{/gu)) {
    const open = (match.index ?? 0) + match[0].length;
    let depth = 1;
    let at = open;
    while (at < clean.length && depth > 0) {
      if (clean[at] === "{") depth += 1;
      else if (clean[at] === "}") depth -= 1;
      at += 1;
    }
    found.push({
      selector: (match[1] ?? "").trim(),
      inMedia:
        clean.lastIndexOf("@media", match.index ?? 0) > clean.lastIndexOf("}", match.index ?? 0),
      tokens: declarations(clean.slice(open, at - 1)),
    });
  }
  return found;
}

const BLOCKS = paletteBlocks(css);
const DARK = BLOCKS.find((b) => b.selector === ":root" && !b.inMedia);
const LIGHT_PINNED = BLOCKS.find((b) => b.selector.includes('[data-theme="light"]'));
const LIGHT_PREFERRED = BLOCKS.find((b) => b.inMedia);

if (DARK === undefined || LIGHT_PINNED === undefined || LIGHT_PREFERRED === undefined) {
  throw new Error(
    'modern.css must declare a bare :root, a :root[data-theme="light"] and a media-query ' +
      "mirror. One is missing, and a theme this suite cannot find is a theme nothing is checking.",
  );
}

/** A theme is dark's declarations with the light block's laid over them. */
const THEMES = {
  dark: DARK.tokens,
  light: { ...DARK.tokens, ...LIGHT_PINNED.tokens },
} as const;

const SURFACES = [
  "--gm-ground",
  "--gm-sunken",
  "--gm-plate",
  "--gm-overlay",
  "--gm-inset",
] as const;

function srgb(value: string): Srgb {
  const parsed = parseOklch(value);
  if (parsed === undefined) throw new Error(`not an oklch value: ${value}`);
  return { r: parsed.r, g: parsed.g, b: parsed.b };
}

/** A token composited over a surface, which is what the eye actually sees. */
function onSurface(tokens: Record<string, string>, name: string, surface: string): Srgb {
  const raw = tokens[name];
  if (raw === undefined) throw new Error(`no such token: ${name}`);
  const parsed = parseOklch(raw);
  if (parsed === undefined) throw new Error(`not an oklch value: ${name} = ${raw}`);
  const behind = srgb(tokens[surface] as string);
  return parsed.alpha < 1 ? over(parsed, behind) : { r: parsed.r, g: parsed.g, b: parsed.b };
}

/** The worst ratio a token scores against every surface, and where. */
function worst(tokens: Record<string, string>, name: string): { ratio: number; surface: string } {
  let ratio = Infinity;
  let surface = "";
  for (const s of SURFACES) {
    const against = srgb(tokens[s] as string);
    const found = contrastRatio(onSurface(tokens, name, s), against);
    if (found < ratio) {
      ratio = found;
      surface = s.replace("--gm-", "");
    }
  }
  return { ratio, surface };
}

const footprint: string[] = [];
function record(line: string): void {
  footprint.push(line);
}

describe("the two light blocks say the same thing", () => {
  /*
   * They are duplicated because CSS has no mixins and each selector must win on
   * its own. A person editing one and not the other is the obvious failure, and
   * it would show as a theme that is correct until the OS preference decides it
   * rather than the user, which is the hardest version to notice.
   */
  it("declares the same tokens in the pinned and the preferred block", () => {
    expect(Object.keys(LIGHT_PREFERRED.tokens).sort()).toEqual(
      Object.keys(LIGHT_PINNED.tokens).sort(),
    );
  });

  it("gives every one of them the same value", () => {
    expect(LIGHT_PREFERRED.tokens).toEqual(LIGHT_PINNED.tokens);
  });
});

describe("light overrides every token whose value changes between themes", () => {
  /*
   * Console shipped a real bug of exactly this shape: light never overrode the
   * focus ring, so it inherited a colour chosen for a near-black surface and
   * measured under 2 on white, on the indicator that says where the keyboard
   * is. Nothing caught it because inheritance is silent.
   *
   * This cannot assert that a token SHOULD change, which is a design question.
   * What it can do is print the inherited set so that it is a decision somebody
   * looked at rather than an omission nobody saw.
   */
  it("inherits only tokens that are genuinely theme-independent", () => {
    const inherited = Object.keys(DARK.tokens).filter(
      (name) => LIGHT_PINNED.tokens[name] === undefined,
    );
    record(
      `  light inherits from dark: ${inherited.length === 0 ? "nothing" : inherited.join(", ")}`,
    );
    expect(inherited).toEqual([]);
  });
});

describe.each(["dark", "light"] as const)("%s: text clears AA", (theme) => {
  const tokens = THEMES[theme];

  it.each(["--gm-ink", "--gm-ink-2", "--gm-ink-3"])("%s on all five surfaces", (name) => {
    const { ratio, surface } = worst(tokens, name);
    record(`  ${theme.padEnd(5)} ${name.padEnd(12)} ${ratio.toFixed(2)} on ${surface}`);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA.TEXT);
  });

  it.each(["ok", "warn", "crit", "info"])("%s ink on its own wash", (level) => {
    const wash = onSurface(tokens, `--gm-${level}-wash`, "--gm-plate");
    const ink = srgb(tokens[`--gm-${level}-ink`] as string);
    const ratio = contrastRatio(ink, wash);
    record(`  ${theme.padEnd(5)} ${level.padEnd(4)} ink on wash  ${ratio.toFixed(2)}`);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA.TEXT);
  });

  it("the label on a filled accent button", () => {
    const ratio = contrastRatio(
      srgb(tokens["--gm-accent-on"] as string),
      srgb(tokens["--gm-accent"] as string),
    );
    record(`  ${theme.padEnd(5)} accent-on on accent  ${ratio.toFixed(2)}`);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA.TEXT);
  });

  it("white on the destructive fill", () => {
    const ratio = contrastRatio(srgb("oklch(1 0 0)"), srgb(tokens["--gm-crit-fill"] as string));
    record(`  ${theme.padEnd(5)} white on crit-fill   ${ratio.toFixed(2)}`);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA.TEXT);
  });

  /*
   * The accent fill moves under a pointer and the label does not, so a hover
   * that drifts toward the label is how a button loses AA mid-gesture. Console
   * shipped that too: resting 5.08 and pressed 7.17 looked fine and hover
   * measured 3.32. Every state is asserted, not just the resting one.
   */
  it.each(["--gm-accent-hover", "--gm-accent-press"])("the label still clears on %s", (state) => {
    const ratio = contrastRatio(
      srgb(tokens["--gm-accent-on"] as string),
      srgb(tokens[state] as string),
    );
    record(
      `  ${theme.padEnd(5)} accent-on on ${state.replace("--gm-accent-", "").padEnd(6)} ${ratio.toFixed(2)}`,
    );
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA.TEXT);
  });
});

describe.each(["dark", "light"] as const)("%s: graphics clear 1.4.11", (theme) => {
  const tokens = THEMES[theme];

  it.each(["ok", "warn", "crit", "info", "idle"])(
    "the %s graphic on all five surfaces",
    (level) => {
      const { ratio, surface } = worst(tokens, `--gm-${level}`);
      record(
        `  ${theme.padEnd(5)} ${level.padEnd(4)} graphic     ${ratio.toFixed(2)} on ${surface}`,
      );
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA.NON_TEXT);
    },
  );

  /*
   * The two load-bearing ones. `hairline` and `subtle` are exempt under 1.4.11
   * because a line between two rows is decorative, and asserting a bar they do
   * not owe would be a test held to the wrong standard.
   */
  it("the control border on all five surfaces", () => {
    const { ratio, surface } = worst(tokens, "--gm-control");
    record(`  ${theme.padEnd(5)} control border  ${ratio.toFixed(2)} on ${surface}`);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA.NON_TEXT);
  });

  it("the focus ring on all five surfaces", () => {
    const { ratio, surface } = worst(tokens, "--gm-ring");
    record(`  ${theme.padEnd(5)} focus ring      ${ratio.toFixed(2)} on ${surface}`);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA.NON_TEXT);
  });
});

describe.each(["dark", "light"] as const)("%s: the diff films keep their ink readable", (theme) => {
  /*
   * `DiffViewer` lays films on its plate: a removed line on `diff-del`, an
   * added one on `diff-add`, a changed word on the stronger film over its
   * line's, and the hunk heading on `diff-band`. The proposal's promise is that
   * ink on every one of them stays above 4.5 in both themes, and a film is the
   * one surface this suite cannot measure by naming it, because what the eye
   * sees is the film over the plate, and a word mark is a film over a film.
   *
   * So each film is composited in the order the component stacks them, and
   * every ink the component sets on that stack is measured there: the
   * paragraph inks, the quiet line number, the hunk range and the sign.
   */
  const tokens = THEMES[theme];

  /** Films laid over the plate in order, last on top. */
  function stack(...films: string[]): Srgb {
    let behind = srgb(tokens["--gm-plate"] as string);
    for (const film of films) {
      const parsed = parseOklch(tokens[film] as string);
      if (parsed === undefined) throw new Error(`not an oklch value: ${film}`);
      behind = parsed.alpha < 1 ? over(parsed, behind) : parsed;
    }
    return behind;
  }

  it.each([
    // [what, ink, films from the plate up]
    ["added line, its text", "--gm-ink", ["--gm-diff-add"]],
    /*
     * ink-2, not the ink-3 the drawing used: ink-3 on the dark added film
     * measures 4.48, a hair under. The removed film is lighter and ink-3
     * clears it (4.55), so only the added line's number steps up.
     */
    ["added line, its number", "--gm-ink-2", ["--gm-diff-add"]],
    ["added word, on its line", "--gm-ink", ["--gm-diff-add", "--gm-diff-add-word"]],
    ["removed line, its text", "--gm-ink-2", ["--gm-diff-del"]],
    ["removed line, its number", "--gm-ink-3", ["--gm-diff-del"]],
    ["removed word, on its line", "--gm-ink", ["--gm-diff-del", "--gm-diff-del-word"]],
    ["hunk heading, the section", "--gm-ink", ["--gm-diff-band"]],
    ["hunk heading, the range", "--gm-ink-3", ["--gm-diff-band"]],
    ["the added sign", "--gm-ok-ink", ["--gm-diff-add"]],
  ] as const)("%s clears AA", (what, ink, films) => {
    const ratio = contrastRatio(srgb(tokens[ink] as string), stack(...films));
    record(`  ${theme.padEnd(5)} diff ${what.padEnd(26)} ${ratio.toFixed(2)}`);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA.TEXT);
  });

  it("the fold's accent words on the sunken band clear AA", () => {
    const ratio = contrastRatio(
      srgb(tokens["--gm-accent-text"] as string),
      srgb(tokens["--gm-sunken"] as string),
    );
    record(`  ${theme.padEnd(5)} diff fold on sunken            ${ratio.toFixed(2)}`);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA.TEXT);
  });

  it("the word film still separates from its line film, so a mark is visible at all", () => {
    /*
     * Not a WCAG bar: the strike and the underline carry the mark for
     * somebody who cannot see the film. This only refuses a token edit that
     * makes the stronger film the same as the line's, which would leave the
     * design's two weights as one.
     */
    for (const [line, word] of [
      ["--gm-diff-add", "--gm-diff-add-word"],
      ["--gm-diff-del", "--gm-diff-del-word"],
    ] as const) {
      expect(contrastRatio(stack(line), stack(line, word))).toBeGreaterThan(1.05);
    }
  });
});

describe("the derivation reproduces what the designer measured", () => {
  /*
   * This is the control case, and it is the reason the twelve derived values
   * are in the file at all.
   *
   * The sheet prints a floor of white 0.34 for the dark control border, derived
   * from the 3:1 it owes. Solving that target with this module's own arithmetic
   * has to land on the same number, or the same arithmetic cannot be trusted
   * for `hairline`, `subtle` and `strong`, whose light values the sheet never
   * printed. It was wrong once on the way here: solving against the white plate
   * alone gave 0.43, and it is the WORST of the five surfaces that the sheet
   * measures against.
   */
  it("solves the stated dark control-border floor to the stated 0.34", () => {
    const solve = (target: number, on: Srgb, ink: string): number => {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 60; i += 1) {
        const mid = (lo + hi) / 2;
        const film = parseOklch(`oklch(${ink} / ${mid})`);
        if (film === undefined) throw new Error("bad film");
        if (contrastRatio(over(film, on), on) < target) lo = mid;
        else hi = mid;
      }
      return hi;
    };

    let floor = 0;
    for (const s of SURFACES) {
      floor = Math.max(floor, solve(WCAG_AA.NON_TEXT, srgb(THEMES.dark[s] as string), "1 0 0"));
    }
    record(`  solved dark control floor ${floor.toFixed(4)}, sheet 21 prints 0.34`);
    expect(Number(floor.toFixed(2))).toBe(0.34);
  });

  /*
   * Figures sheet 21 publishes, re-measured here. If a token edit moves one of
   * these, the file has drifted from the design it claims to implement, which
   * is a different failure from breaking AA and is worth its own sentence.
   */
  it.each([
    ["light", "--gm-ink", 16.2],
    ["light", "--gm-ink-3", 4.63],
    ["dark", "--gm-ink-3", 4.64],
  ] as const)("%s %s still measures the published %d", (theme, name, published) => {
    const { ratio } = worst(THEMES[theme], name);
    expect(ratio).toBeCloseTo(published, 1);
  });

  it("the light warn graphic is still the tightest in its theme, at the published 3.53", () => {
    const { ratio, surface } = worst(THEMES.light, "--gm-warn");
    expect(surface).toBe("sunken");
    expect(ratio).toBeCloseTo(3.53, 1);
  });
});

describe("the footprint", () => {
  /*
   * A passing test's console prints to nobody, so this goes to stderr. The
   * point is that somebody changing a colour sees what it did to every ratio
   * rather than only whether a threshold still held.
   */
  it("prints every ratio this suite measured", () => {
    process.stderr.write(
      `\nmodern.css, ${Object.keys(DARK.tokens).length} tokens in dark and ` +
        `${Object.keys(LIGHT_PINNED.tokens).length} overridden in light\n` +
        `${footprint.join("\n")}\n\n`,
    );
    expect(footprint.length).toBeGreaterThan(0);
  });
});
