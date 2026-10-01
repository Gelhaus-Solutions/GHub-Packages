/**
 * The accessibility bar, as a test rather than an intention.
 *
 * WCAG 2.2 AA for every console that renders it. Radix and shadcn were rejected
 * on purpose, so focus rings, borders and every ratio underneath them are ours
 * to get right, and `aria-` attributes scattered across the components are care
 * without a system: nothing failed when somebody changed a colour.
 *
 * This is the mechanism for one of the four. It reads the shipped token file
 * rather than a copy, so a palette change that breaks a ratio breaks this, and
 * it runs in both themes because a design that is dark-first is exactly the one
 * whose light mode nobody looks at.
 *
 * IT IS NOT GUARDING ONE PRODUCT. Every product's consoles render this
 * palette from `@ghub/tokens`, and none of them can assert anything about it:
 * nothing in a consuming repository reads these files in a test. This suite is
 * the only thing standing between a token edit and every console. Scoping it
 * to "this package's components" would be wrong about who is relying on it.
 *
 * This repository runs its tests without a task cache, and that is why. In a
 * cached runner the token file has to be named in the cache key by hand, and
 * where it once was not, this suite replayed a green computed before the
 * palette changed: a token that fails AA scored "123 passed". A gate that does
 * not re-run is not a gate.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contrastRatio, parseOklch, resolveToken, WCAG_AA, type Srgb } from "./contrast.js";

const THEME = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "tokens", "theme.css");

/**
 * The declarations of one block of the theme file.
 *
 * Crude on purpose. A CSS parser is a dependency, the file is ours, and the
 * shape being read is a flat list of custom properties: anything cleverer would
 * be a parser to maintain in order to read a file we also maintain.
 */
function declarations(css: string, from: number, to: number): Record<string, string> {
  const block = css.slice(from, to);
  const out: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const match = /^\s*(--[\w-]+)\s*:\s*([^;]+);/.exec(line);
    if (match !== null) out[match[1] as string] = (match[2] as string).trim();
  }
  return out;
}

const css = readFileSync(THEME, "utf8");

/**
 * Every `:root` block in the file, with the selector that introduced it.
 *
 * **This replaced three `indexOf` calls, and the reason is a decision rather
 * than tidiness.** This package is growing a second design language: `console`
 * stays as it is for GControl and GPlatform Control, and `modern` is a complete
 * redesign for GPlatform SSO and GPlatform Billing. That means a third palette,
 * and possibly a fourth.
 *
 * The old parse could not have seen one. It read `css.indexOf(":root {")` to
 * `css.indexOf('[data-theme="light"]')` as dark and the next span as light, so
 * the set of themes was hardcoded **twice**: once in the boundaries above and
 * again in the list below. A new palette added to this file would land either
 * between two existing boundaries, silently joining a theme it is not, or past
 * the last one, where nothing reads it at all. Fixing only the list would have
 * left a parser that can produce two themes and a list that enumerates three.
 *
 * A block carries only the declarations it makes itself. What a theme resolves
 * to is assembled below, where the cascade is written down rather than implied
 * by the order two slices happen to appear in.
 */
interface PaletteBlock {
  /** The selector text, for example `:root` or `:root[data-theme="light"]`. */
  readonly selector: string;
  /** Whether it sits inside an `@media` query rather than at the top level. */
  readonly inMedia: boolean;
  readonly tokens: Record<string, string>;
}

/** Comments removed first, so a brace inside prose cannot move a boundary. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//gu, "");
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
      // The only thing this file nests a `:root` inside is the media query
      // mirroring the light theme, and the nesting is what tells them apart.
      inMedia:
        clean.lastIndexOf("@media", match.index ?? 0) > clean.lastIndexOf("}", match.index ?? 0),
      tokens: declarations(clean, open, at - 1),
    });
  }
  return found;
}

const BLOCKS = paletteBlocks(css);

/** A `:root` with no attribute on it: the values every theme starts from. */
const BASE_BLOCKS = BLOCKS.filter((b) => !b.inMedia && !b.selector.includes("data-theme"));

/**
 * The pinned overrides, by theme name, from `:root[data-theme="name"]`.
 *
 * The media-query copy is deliberately not read here. The file explains why it
 * exists at all, CSS having no mixins, and the two copies agreeing is asserted
 * on its own below rather than folded into the palette.
 */
const PINNED = new Map<string, Record<string, string>>();
for (const block of BLOCKS) {
  const named = /data-theme="([^"]+)"/u.exec(block.selector);
  if (block.inMedia || named === null) continue;
  PINNED.set(named[1] as string, { ...(PINNED.get(named[1] as string) ?? {}), ...block.tokens });
}

const DARK = Object.assign({}, ...BASE_BLOCKS.map((b) => b.tokens)) as Record<string, string>;

/**
 * A theme is the base with its own overrides on top, which is what the cascade
 * does and is also the trap.
 *
 * A palette written as a fork **inherits every token it does not set**. That is
 * right for light, which overrides part of the scale on purpose, and it is a
 * loaded gun for a new language: a `modern` palette that forgot half its tokens
 * would resolve to console's values for the rest and pass every ratio below
 * while looking nothing like itself on screen. "gives every named theme enough
 * of its own tokens to be one" is the assertion that makes that visible rather
 * than comfortable.
 */
const THEMES = [
  { name: "dark", tokens: DARK },
  ...[...PINNED.entries()].map(([name, overrides]) => ({
    name,
    tokens: { ...DARK, ...overrides } as Record<string, string>,
  })),
];

const LIGHT = THEMES.find((t) => t.name === "light")?.tokens ?? {};

/** The surfaces a control can sit on, and therefore be judged against. */
const SURFACES = [
  "--gc-surface-base",
  "--gc-surface-raised",
  "--gc-surface-inset",
  "--gc-surface-sunken",
  "--gc-surface-overlay",
] as const;

function surface(tokens: Record<string, string>, name: string): Srgb {
  // Resolved against black, which only matters for a surface written with an
  // alpha. None is, and if one ever is, this is the line that has to say what
  // it sits on rather than guessing.
  const resolved = resolveToken(tokens, name, { r: 0, g: 0, b: 0 });
  if (resolved === undefined) throw new Error(`the theme defines no ${name}`);
  return resolved;
}

function ratio(tokens: Record<string, string>, token: string, on: string): number {
  const background = surface(tokens, on);
  const foreground = resolveToken(tokens, token, background);
  if (foreground === undefined) throw new Error(`the theme defines no ${token}`);
  return contrastRatio(foreground, background);
}

describe("the palettes this file measures", () => {
  /**
   * That every `--gc-` declaration in the file landed in a block that is
   * measured, which is the question the ratios below cannot ask.
   *
   * Everything else here starts from a theme that was found, so it can only
   * report on palettes the parser already produced. A palette declared under a
   * selector this parser does not recognise is invisible to all of it: every
   * ratio still passes, the floor still clears, and a whole design language
   * goes unmeasured. Counting declarations is what makes that falsifiable, and
   * it is deliberately a count of the *file* rather than of the blocks, so the
   * two sides cannot share a mistake.
   */
  it("reads every token the file declares, under whatever selector", () => {
    const inFile = [...withoutComments(css).matchAll(/^\s*(--gc-[\w-]+)\s*:/gmu)].length;
    const inBlocks = BLOCKS.reduce((sum, block) => sum + Object.keys(block.tokens).length, 0);

    expect(inBlocks).toBe(inFile);
  });

  /**
   * That a theme is a real palette rather than a handful of overrides riding on
   * console's values.
   *
   * The cascade means a theme inherits everything it does not set, so a new
   * language that declared six tokens would be measured, would pass, and would
   * be console everywhere else. Light legitimately overrides most of the scale;
   * the floor is set low enough to allow a deliberate partial theme and high
   * enough that a stub cannot pass as a design.
   */
  it("gives every named theme enough of its own tokens to be one", () => {
    const thin = [...PINNED.entries()]
      .filter(([, overrides]) => Object.keys(overrides).length < 20)
      .map(([name, overrides]) => `${name}: ${String(Object.keys(overrides).length)} own tokens`);

    expect(thin).toEqual([]);
  });

  it("found the base and at least one theme above it", () => {
    expect(BASE_BLOCKS.length).toBeGreaterThan(0);
    expect(THEMES.length).toBeGreaterThan(1);
  });
});

describe("the token file itself", () => {
  it("was found and read, so a green test is not an empty one", () => {
    // The failure this guards against is the worst kind: a path that stopped
    // resolving turns every assertion below into a comparison against nothing,
    // and the suite goes green while checking no colours at all.
    expect(Object.keys(DARK).length).toBeGreaterThan(40);
    expect(Object.keys(LIGHT).length).toBeGreaterThan(40);
    expect(DARK["--gc-ring"]).toBeDefined();
    expect(LIGHT["--gc-ring"]).not.toBe(DARK["--gc-ring"]);
  });
});

describe.each(THEMES)("$name theme", ({ tokens }) => {
  it("passes AA for body text on every surface it is drawn on", () => {
    for (const on of SURFACES) {
      expect(ratio(tokens, "--gc-text-primary", on)).toBeGreaterThanOrEqual(WCAG_AA.TEXT);
      expect(ratio(tokens, "--gc-text-secondary", on)).toBeGreaterThanOrEqual(WCAG_AA.TEXT);
    }
  });

  it("passes AA for tertiary text, which is drawn far too small to be exempt", () => {
    // This assertion used to read `LARGE_TEXT`, and the comment beside it
    // called that a decision rather than a gap. It was a gap.
    //
    // WCAG's large-text exemption is 18.66px regular or 14px bold. Tertiary is
    // the explanatory sentence under a value, set at 11.5px, and `label-caps`
    // draws it at 10. Nothing it is ever set in comes near the boundary, so the
    // exemption was never available: the suite was green on a justification
    // that did not hold, which is worse than being red.
    //
    // Measured before the fix: 3.85 to 4.43 across these five surfaces in dark,
    // a real AA failure on every metadata line in the product. Light was 6.51
    // and up and never had it. Two independent reviews found it within a day of
    // each other, which is about one more than a defect filed as a decision
    // usually gets.
    for (const on of SURFACES) {
      expect(ratio(tokens, "--gc-text-tertiary", on)).toBeGreaterThanOrEqual(WCAG_AA.TEXT);
    }
  });

  it("passes AA for badge text on its own wash, which is not the same question", () => {
    // The gap this closes. A `StatusDot` is a graphic carrying its meaning in
    // colour and shape, so it owes 3:1 against the surface, and the test below
    // has always checked that. A `Badge` is text on its own wash, which owes
    // 4.5:1 against the wash, and nothing checked it: the status colour drawn
    // on its own wash measured 2.73 to 3.78 across every variant in light, and
    // 3.89 for `idle` and 4.22 for `crit` in dark.
    //
    // So the badge draws `--gc-{status}-ink` instead, and this is the assertion
    // that keeps the two questions apart. The wash is resolved over each
    // surface first, because it is translucent and what sits behind it decides
    // the answer: the overlay is the worst case in dark and the inset in light.
    for (const status of ["ok", "warn", "crit", "info", "locked", "idle", "accent"]) {
      for (const on of SURFACES) {
        const wash = resolveToken(tokens, `--gc-${status}-wash`, surface(tokens, on));
        expect(wash).toBeDefined();
        const ink = resolveToken(tokens, `--gc-${status}-ink`, wash as Srgb);
        expect(ink).toBeDefined();
        expect(contrastRatio(ink as Srgb, wash as Srgb)).toBeGreaterThanOrEqual(WCAG_AA.TEXT);
      }
    }
  });

  it("passes AA for the neutral prose a wash is allowed to carry", () => {
    // The third question about a wash, after the badge and the plain surface.
    // A wash is translucent colour over a surface, so it moves the floor for
    // anything drawn on it, and some of this product draws ordinary neutral
    // prose there rather than a status word: the emergency card's contained
    // state is a crit wash carrying a fact strip, a note and a footer sentence.
    //
    // Found by running axe against an instance that was actually contained.
    // Every previous sweep ran on a clear one, so the wash was never on screen
    // and the screen measured clean: 5 real AA failures, invisible to a route
    // list that never froze anything.
    //
    // `--gc-text-secondary` is the floor on a wash and this is the assertion
    // that keeps it there. `--gc-text-tertiary` is deliberately NOT asserted
    // here, and that is the rule rather than an omission: it measures 3.49 at
    // worst on a wash in dark against the 4.5 floor, and it is not a bar the
    // token has to clear, because tertiary is for surfaces. It passes AA on all
    // five of those, which the test above proves. A component that needs a
    // quiet label on a wash takes the one step up, which is what `FactStrip`'s
    // `onWash` does.
    //
    // The same argument applies to accent text: `--gc-text-accent` measures
    // 3.77 on an accent wash in light, so a selected filter pill draws
    // `--gc-accent-ink` at 4.62 instead. That pairing is covered by the badge
    // assertion above, since it is the same two tokens.
    for (const status of ["ok", "warn", "crit", "info", "locked", "idle", "accent"]) {
      for (const on of SURFACES) {
        const wash = resolveToken(tokens, `--gc-${status}-wash`, surface(tokens, on));
        expect(wash).toBeDefined();
        const secondary = resolveToken(tokens, "--gc-text-secondary", wash as Srgb);
        expect(secondary).toBeDefined();
        expect(contrastRatio(secondary as Srgb, wash as Srgb)).toBeGreaterThanOrEqual(WCAG_AA.TEXT);
      }
    }
  });

  it("passes AA for status text on a plain surface, which is most of where it is drawn", () => {
    // The other half of the same defect, and the larger half. `Badge` draws its
    // text on a wash, but far more of the product draws a status word straight
    // onto a surface: every `role="alert"` paragraph, every "reachable", every
    // "never", the attention sentence under a table row, the count beside a nav
    // item, the value in a `Metric`.
    //
    // The suite checked the status colours against the surfaces at the 3:1
    // non-text bar, which is right for a `StatusDot` and wrong for a sentence.
    // Asked at 4.5, light failed on all five: ok 3.10, warn 3.67, info 4.11,
    // locked 4.37, crit 4.49. Dark was 5.01 and up and never had it.
    //
    // So the split is the whole rule and it is worth stating once: the status
    // colour is the GRAPHIC and owes 3:1, the ink is the TEXT and owes 4.5:1.
    // The same ink serves both a wash and a bare surface, which is why there is
    // one extra token per status rather than two.
    for (const status of ["ok", "warn", "crit", "info", "locked", "idle", "accent"]) {
      for (const on of SURFACES) {
        expect(ratio(tokens, `--gc-${status}-ink`, on)).toBeGreaterThanOrEqual(WCAG_AA.TEXT);
      }
    }
  });

  it("gives quiet text on a wash a token that clears AA, which tertiary does not", () => {
    // The third instance of the same shape, after the badge and the status
    // sentence: a pairing nobody measured because it looked like one that had
    // been. Tertiary is asserted above against the five plain surfaces and
    // clears them. A wash is not one of them, and a wash is translucent, so
    // what sits behind it decides the answer.
    //
    // Measured across all seven washes over all five surfaces: tertiary bottoms
    // out at 3.49:1 in dark on `--gc-warn-wash` over the overlay, which is a
    // real AA failure, and light is fine at 5.47. Secondary is 6.88 and 8.94.
    //
    // So this is not a ratio the palette is asked to satisfy. It is the rule
    // that quiet text on a wash steps up one: `ChangeList`'s foot and
    // `SigningProvenance`'s explanation both draw on a wash and both take
    // secondary. Lifting tertiary to clear a wash would put it on top of
    // secondary everywhere else, which is the same trade the disabled test
    // below refuses.
    for (const status of ["ok", "warn", "crit", "info", "locked", "idle", "accent"]) {
      for (const on of SURFACES) {
        const wash = resolveToken(tokens, `--gc-${status}-wash`, surface(tokens, on));
        expect(wash).toBeDefined();
        const ink = resolveToken(tokens, "--gc-text-secondary", wash as Srgb);
        expect(ink).toBeDefined();
        expect(contrastRatio(ink as Srgb, wash as Srgb)).toBeGreaterThanOrEqual(WCAG_AA.TEXT);
      }
    }
  });

  it("leaves disabled exempt by keeping it off anything that is not a control", () => {
    // Deliberately not an assertion about the ratio. `--gc-text-disabled` is
    // 2.31 to 2.65 in dark and does not pass AA, and it does not have to:
    // WCAG 1.4.3 exempts text that is part of an inactive user interface
    // component, which is the only thing it is now allowed to draw.
    //
    // What is worth pinning is that it stays clearly quieter than tertiary. If
    // somebody "fixed" it by lifting it to AA it would land on top of tertiary,
    // the ramp would lose a step, and every disabled control would start
    // reading as an active one. That is the regression this catches, and it is
    // the opposite of the one a ratio assertion would catch.
    for (const on of SURFACES) {
      expect(ratio(tokens, "--gc-text-disabled", on)).toBeLessThan(
        ratio(tokens, "--gc-text-tertiary", on),
      );
    }
  });

  it("passes 1.4.11 for the focus ring on every surface", () => {
    // The one this aesthetic makes hard, and the reason the ring is a token at
    // all rather than each component inventing an outline. A focus indicator
    // that fails here is invisible to exactly the person who depends on it.
    for (const on of SURFACES) {
      expect(ratio(tokens, "--gc-ring", on)).toBeGreaterThanOrEqual(WCAG_AA.NON_TEXT);
    }
  });

  it("passes 1.4.11 for the border that bounds a control", () => {
    // `--gc-border-control` is the edge of an input, a select and a secondary
    // button: something a person has to find in order to use it, which is
    // exactly what 1.4.11 is about. It exists as its own token because it was
    // sharing `--gc-border-subtle` with every decorative divider in the
    // product, and one value cannot be both a 3:1 control boundary and a
    // hairline that stays out of the way.
    for (const on of SURFACES) {
      expect(ratio(tokens, "--gc-border-control", on)).toBeGreaterThanOrEqual(WCAG_AA.NON_TEXT);
      // The hover step has to stay above the resting one, or hovering a control
      // would make its edge harder to see rather than easier.
      expect(ratio(tokens, "--gc-border-strong", on)).toBeGreaterThanOrEqual(
        ratio(tokens, "--gc-border-control", on),
      );
    }
  });

  it("keeps the decorative borders visible, without claiming they are more", () => {
    // The hairline separates a panel from the page and a row from the next
    // one. 1.4.11 exempts a purely decorative boundary and these are: removing
    // one loses no information, because every panel it draws also carries a
    // heading and every row also carries its own text.
    //
    // So the bar here is that they are perceptible rather than that they are
    // 3:1, and saying out loud which of the two they meet is the difference
    // between a claim and a guess. Anything a customer has to be able to see in
    // order to use the product is drawn with `--gc-border-control`.
    for (const on of SURFACES) {
      expect(ratio(tokens, "--gc-border-hairline", on)).toBeGreaterThan(1.1);
      expect(ratio(tokens, "--gc-border-subtle", on)).toBeGreaterThan(1.3);
    }
  });

  it("passes 1.4.11 for every status colour, because a dot is the whole message", () => {
    // A status dot carries its meaning in colour and shape and nothing else, so
    // it is a non-text element conveying information. The dark red on a dark
    // surface is the one that goes first.
    //
    // `--gc-idle` is in this list now and was not before, which is how it went
    // unmeasured: it was exempt by being absent rather than by any rule, and it
    // read 2.31:1 against the overlay in dark against the 3:1 here. Every other
    // status was 5.01 and up, so the omission is the only reason the suite was
    // green. Compare `--gc-text-disabled` below, which is also exempt and says
    // so in a test of its own: an exemption nobody wrote down is indistinguishable
    // from a token nobody checked.
    for (const status of [
      "--gc-ok",
      "--gc-warn",
      "--gc-crit",
      "--gc-info",
      "--gc-locked",
      "--gc-idle",
    ]) {
      for (const on of SURFACES) {
        expect(ratio(tokens, status, on)).toBeGreaterThanOrEqual(WCAG_AA.NON_TEXT);
      }
    }
  });

  it("keeps idle quieter than the states that mean something is wrong", () => {
    // The regression that lifting `--gc-idle` to clear 3:1 opens, and the same
    // shape as the disabled test below: a ratio assertion alone is satisfied by
    // making a token louder and louder, and idle means dormant.
    //
    // The rule is narrower than "idle is the quietest status", and that matters
    // because the wider one is false here and was before the lift. In light,
    // idle reads 3.90 against ok at 3.10 and warn at 3.67, so it is already
    // louder than both. That is not a defect: the ramp carries how bad
    // something is, and neither ok nor warn is worse than dormant, so their
    // order against it says nothing.
    //
    // `crit` and `locked` are the two that do mean something is wrong, and a
    // dormant thing shouting louder than a broken one inverts the only meaning
    // colour carries here. That holds in both themes with room, 3.85 against
    // 5.01 and 5.88 in dark, 3.90 against 4.49 and 4.37 in light, and it is
    // asserted rather than left to whoever next adjusts the ramp.
    for (const on of SURFACES) {
      for (const worse of ["--gc-crit", "--gc-locked"]) {
        expect(ratio(tokens, "--gc-idle", on)).toBeLessThan(ratio(tokens, worse, on));
      }
    }
  });

  it("holds the chart axis to the text bar, because the axis is text", () => {
    // No chart token was named anywhere in this suite, which is how this got
    // through: `--gc-chart-axis` was set from the neutral ramp as though it
    // were a line, and `timeseries.tsx` uses it for `axisLabel.color` on both
    // axes at 10px. Those are the tick numbers on every chart in the product,
    // and rule 4 at the top of the theme file is about exactly those numbers.
    //
    // It measured 2.31 to 2.65 in dark and 3.90 to 4.65 in light against the
    // 4.5 AA asks of text this size, so it failed on all five surfaces in dark
    // and on three of five in light. It points at `--gc-text-tertiary` now,
    // which is the quietest token that clears the bar everywhere.
    for (const on of SURFACES) {
      expect(ratio(tokens, "--gc-chart-axis", on)).toBeGreaterThanOrEqual(WCAG_AA.TEXT);
    }
  });

  it("keeps the chart gridlines decorative rather than pretending otherwise", () => {
    // The counterpart to the axis, and the reason the two are separate tokens.
    // A gridline loses no information when it is removed, because the axis
    // labels carry the values and the series carry the shape, so 1.4.11 exempts
    // it the same way it exempts a hairline. Asserted as perceptible rather
    // than as 3:1, which is the honest claim: it reads 1.13 in dark and 1.19 in
    // light and is not being held to a bar it does not owe.
    for (const on of SURFACES) {
      expect(ratio(tokens, "--gc-chart-grid", on)).toBeGreaterThan(1.1);
    }
  });

  it("keeps a label on the accent readable, in every state the button has", () => {
    // Resting, hovered and pressed, and the last two are the point. This tested
    // `--gc-accent` alone, so it asked about a button nobody is touching: light
    // pointed hover at a lighter step under a white label and it measured
    // 3.32:1 there, against 5.08 at rest and 7.17 pressed. Every primary button
    // in the light theme lost AA the moment a pointer arrived, and the state
    // that was measured was the one state that was fine.
    //
    // The rule underneath is that hover moves AWAY from the label rather than
    // in a fixed direction: dark's label is near-black so lighter is right
    // there, light's is white so it has to darken. `theme.css` carries it.
    for (const state of ["--gc-accent", "--gc-accent-hover", "--gc-accent-press"]) {
      const ground = resolveToken(tokens, state, { r: 0, g: 0, b: 0 });
      const label = resolveToken(tokens, "--gc-accent-fg", ground ?? { r: 0, g: 0, b: 0 });
      expect(ground).toBeDefined();
      expect(label).toBeDefined();
      expect(contrastRatio(label as Srgb, ground as Srgb)).toBeGreaterThanOrEqual(WCAG_AA.TEXT);
    }
  });

  it("passes 1.4.11 for the accent border, which is where focus lands", () => {
    // `--gc-border-accent` is the focus border on `Input`, `Combobox` and
    // `CodeInput`, so it is the thing that says where the keyboard is. It was
    // declared only in the dark block, so light inherited a colour picked for a
    // near-black surface and drew it on a white one: 1.79 to 2.14 across the
    // five surfaces, against the 3:1 a focus indicator owes.
    //
    // Nothing caught it because the suite measured `--gc-ring` and stopped, and
    // these controls do not use the ring: they swap their border and add a wash
    // glow that is itself only 1.14:1. The border was the whole indicator.
    for (const on of SURFACES) {
      expect(ratio(tokens, "--gc-border-accent", on)).toBeGreaterThanOrEqual(WCAG_AA.NON_TEXT);
    }
  });
});

describe("the arithmetic underneath", () => {
  it("puts black and white 21:1 apart, which is the whole scale", () => {
    const black = parseOklch("oklch(0 0 0)");
    const white = parseOklch("oklch(1 0 0)");
    expect(contrastRatio(black as Srgb, white as Srgb)).toBeCloseTo(21, 1);
  });

  it("composites an alpha over its surface rather than judging it alone", () => {
    // The bug this exists to prevent. Nearly every border in this theme is
    // white at nine per cent; judged on its own it is pure white and passes
    // everything, which is the opposite of what the eye sees.
    const surfaceBlack = { r: 0, g: 0, b: 0 };
    const alone = parseOklch("oklch(1 0 0)");
    const composited = resolveToken({ "--x": "oklch(1 0 0 / 0.09)" }, "--x", surfaceBlack);
    expect(contrastRatio(alone as Srgb, surfaceBlack)).toBeCloseTo(21, 1);
    expect(contrastRatio(composited as Srgb, surfaceBlack)).toBeLessThan(1.3);
  });

  it("follows a var() to the value it names", () => {
    const tokens = { "--a": "var(--b)", "--b": "oklch(1 0 0)" };
    const white = resolveToken(tokens, "--a", { r: 0, g: 0, b: 0 });
    expect(white?.r).toBeCloseTo(1, 6);
    expect(white?.g).toBeCloseTo(1, 6);
    expect(white?.b).toBeCloseTo(1, 6);
  });

  it("refuses a cycle rather than looping for ever", () => {
    const tokens = { "--a": "var(--b)", "--b": "var(--a)" };
    expect(resolveToken(tokens, "--a", { r: 0, g: 0, b: 0 })).toBeUndefined();
  });
});

/**
 * Every semantic token is either measured or exempt with a reason written down.
 *
 * This exists because of how two real failures got through. `--gc-idle` was
 * under the 3:1 a status graphic owes, and `--gc-chart-axis` was text set from
 * the neutral ramp at 2.31:1. Neither was decided to be exempt; both were
 * simply absent from every loop in this file, and the suite was green because
 * nothing had ever named them.
 *
 * An assertion cannot notice a token nobody wrote down, so the guard has to run
 * the other way: enumerate what the theme declares and require that each one is
 * classified. Adding a token now fails this test until somebody says which it
 * is, and "exempt" costs a sentence saying why rather than costing nothing.
 *
 * `measured` means some assertion above pins a ratio for it. `exempt` carries
 * the reason, and the reasons are the interesting half: most are tokens that
 * are a ground rather than a mark, and a ground is judged by what is drawn on
 * it, which the tests for ink, prose and labels already do.
 */
/**
 * The semantic tokens, which are the ones this file is about.
 *
 * The first `:root` block is the raw palette: ramps that the file itself says
 * are never referenced directly by a component. A ramp step has no pairing to
 * be judged against, because what it means depends entirely on which semantic
 * token points at it, and those are classified below. Subtracting them is what
 * keeps the coverage list a list of decisions rather than of arithmetic.
 */
function semanticTokens(): string[] {
  const paletteStart = css.indexOf(":root {");
  const semanticStart = css.indexOf(":root {", paletteStart + 1);
  const palette = new Set(Object.keys(declarations(css, paletteStart, semanticStart)));
  const all = new Set([...Object.keys(DARK), ...Object.keys(LIGHT)]);
  return [...all].filter((token) => !palette.has(token)).sort();
}

const CLASSIFIED: Record<string, "measured" | string> = {
  // Grounds. Judged by what is drawn on them, which the ink, prose and label
  // assertions above already do against all five.
  "--gc-surface-base": "measured",
  "--gc-surface-raised": "measured",
  "--gc-surface-sunken": "measured",
  "--gc-surface-inset": "measured",
  "--gc-surface-overlay": "measured",
  "--gc-surface-hover":
    "a ground, and a translucent one: it lifts a row under a pointer and carries nothing itself",
  "--gc-surface-active": "a ground, as above, for the moment a row is pressed",
  "--gc-surface-selected": "a ground, and the wash assertions cover text drawn on a selected row",

  // Marks and boundaries.
  "--gc-border-hairline": "decorative under 1.4.11, and asserted as perceptible above",
  "--gc-border-subtle": "decorative under 1.4.11, and asserted as perceptible above",
  "--gc-border-control": "measured",
  "--gc-border-strong": "measured",
  "--gc-border-accent": "measured",
  "--gc-ring": "measured",
  "--gc-ring-offset":
    "a ground: it is the surface a ring is drawn against, and the ring is measured against it",

  // Text.
  "--gc-text-primary": "measured",
  "--gc-text-secondary": "measured",
  "--gc-text-tertiary": "measured",
  "--gc-text-disabled":
    "exempt under 1.4.3 as an inactive control, and pinned below tertiary above",
  "--gc-text-inverted":
    "drawn only on an inverted ground, which is a pairing rather than a token: the accent label assertion is the live instance",
  "--gc-text-accent": "measured",

  // Accent.
  "--gc-accent": "measured",
  "--gc-accent-hover": "measured",
  "--gc-accent-press": "measured",
  "--gc-accent-fg": "measured",
  "--gc-accent-wash": "a ground, and the wash assertions measure ink and prose on it",
  "--gc-accent-glow":
    "decorative: a soft outer glow that carries nothing and is never the only indicator",
  "--gc-accent-ink": "measured",

  // Status, each with its colour, its wash and its ink.
  "--gc-ok": "measured",
  "--gc-warn": "measured",
  "--gc-crit": "measured",
  "--gc-info": "measured",
  "--gc-locked": "measured",
  "--gc-idle": "measured",
  "--gc-ok-wash": "a ground, measured through the ink and prose drawn on it",
  "--gc-warn-wash": "a ground, measured through the ink and prose drawn on it",
  "--gc-crit-wash": "a ground, measured through the ink and prose drawn on it",
  "--gc-info-wash": "a ground, measured through the ink and prose drawn on it",
  "--gc-locked-wash": "a ground, measured through the ink and prose drawn on it",
  "--gc-idle-wash": "a ground, measured through the ink and prose drawn on it",
  "--gc-ok-ink": "measured",
  "--gc-warn-ink": "measured",
  "--gc-crit-ink": "measured",
  "--gc-info-ink": "measured",
  "--gc-locked-ink": "measured",
  "--gc-idle-ink": "measured",

  // Charts.
  "--gc-chart-axis": "measured",
  "--gc-chart-grid": "decorative under 1.4.11, and asserted as perceptible above",
  "--gc-chart-1":
    "OPEN: a series line carries meaning and owes 3:1. Light reads 2.79 on sunken and inset. Recorded rather than fixed, because the chart palette is a decision",
  "--gc-chart-2": "measured by hand at 4.30 and up in light, 7.50 and up in dark",
  "--gc-chart-3": "measured by hand at 3.10 and up in light, 7.70 and up in dark",
  "--gc-chart-4": "OPEN: as chart-1. Light reads 2.66 on sunken and inset and 2.95 on base",
  "--gc-chart-5": "measured by hand at 4.46 and up in light, 6.25 and up in dark",
  "--gc-chart-6": "measured by hand at 3.95 and up in light, 7.33 and up in dark",

  // Not colour.
  "--gc-shadow-sm":
    "a shadow is not a foreground on a background, so there is no pair to measure; the file also forbids them in dark, where elevation is border and ground",
  "--gc-shadow-md": "as shadow-sm: no foreground, no pair, nothing a ratio could be taken of",
  "--gc-shadow-lg": "as shadow-sm: no foreground, no pair, nothing a ratio could be taken of",
};

describe("the coverage of this file", () => {
  it("classifies every semantic token the theme declares", () => {
    // Both themes, because a token declared only in one block is exactly the
    // shape `--gc-border-accent` had: light inherited a dark value and nobody
    // noticed it had never been restated.
    const unclassified = semanticTokens().filter((token) => CLASSIFIED[token] === undefined);
    expect(unclassified).toEqual([]);
  });

  it("has no classification for a token the theme no longer declares", () => {
    // The other direction, so the list cannot rot into a record of tokens that
    // were deleted years ago while looking like coverage.
    const declared = new Set(semanticTokens());
    const stale = Object.keys(CLASSIFIED).filter((token) => !declared.has(token));
    expect(stale).toEqual([]);
  });

  it("gives every exemption a reason rather than a shrug", () => {
    for (const [token, why] of Object.entries(CLASSIFIED)) {
      if (why === "measured") continue;
      expect(why.length, `${token} is exempt without saying why`).toBeGreaterThan(24);
    }
  });
});

describe("the two copies of the light theme", () => {
  /**
   * The file states light twice, pinned and under a media query, because CSS
   * has no mixins. The comment above `LIGHT` says a divergence between them
   * would be "a different bug and one a diff catches", and this test exists
   * because that turned out not to be true.
   *
   * It was written by a script that matched the pinned block and not the
   * indented copy, so `--gc-accent-hover` was fixed for anybody with an
   * explicit theme and left broken for everybody on system-light, which is the
   * default. Every assertion here stayed green because they all read the pinned
   * copy, and a diff of a 500 line file with two near-identical blocks is
   * exactly where one changed line hides.
   */
  it("agree on every token, because half a theme fix is the worst kind", () => {
    /*
      Both sides now come from the block scan rather than from three `indexOf`
      boundaries. That is not only tidier: the old version found the media copy
      by searching for one literal selector, so it compared two blocks in a file
      that is about to hold more than two, and a second media-query mirror for a
      second theme would have been compared to nothing.
    */
    const mirrors = BLOCKS.filter((block) => block.inMedia);
    expect(mirrors.length, "no media-query copy of a theme was found").toBeGreaterThan(0);

    const ours = (record: Record<string, string>): string[] =>
      Object.keys(record).filter((token) => token.startsWith("--gc-"));

    for (const mirror of mirrors) {
      /*
        Which pinned theme a mirror is a copy of is read from the selector it
        excludes: `:root:not([data-theme="dark"])` under a light media query is
        the light theme's copy. Stated rather than assumed, so a mirror whose
        pair cannot be identified fails here instead of being skipped.
      */
      const excluded = /data-theme="([^"]+)"/u.exec(mirror.selector)?.[1];
      const pairedWith = [...PINNED.keys()].find((name) => name !== excluded);
      expect(pairedWith, `no pinned theme matches ${mirror.selector}`).toBeDefined();

      const pinned = PINNED.get(pairedWith as string) ?? {};
      expect(ours(mirror.tokens).sort(), mirror.selector).toEqual(ours(pinned).sort());
      for (const token of ours(pinned)) {
        expect(mirror.tokens[token], `${token} differs between the two ${pairedWith} blocks`).toBe(
          pinned[token],
        );
      }
    }
  });
});
