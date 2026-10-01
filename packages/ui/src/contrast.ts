/**
 * Contrast, computed rather than asserted.
 *
 * The design system is hand-rolled and dark-first, with hairline borders and a
 * high-density type scale. That is exactly the aesthetic that fails WCAG on
 * borders and focus indicators, and it fails quietly: nothing looks broken, the
 * screenshot looks right, and the first person to find out is a procurement
 * questionnaire or somebody who cannot see the outline.
 *
 * So the ratios are a test rather than an intention. This module is what that
 * test runs, and it is exported because a customer who overrides a token is
 * doing the same thing we are and should be able to check the same way. An
 * accessibility claim with no evidence behind it is the one thing this phase
 * refuses to publish.
 *
 * Everything here is sRGB. The tokens are written in oklch because it is a
 * better space to design a palette in, and WCAG's ratios are defined over sRGB
 * relative luminance, so the conversion happens here once instead of in each
 * caller's head.
 */

/**
 * Gamma-encoded sRGB, each channel 0..1: the numbers a browser composites with.
 *
 * Not linear light, deliberately. Compositing is defined over the encoded
 * values, and doing it in linear light overstates a translucent colour badly:
 * white at nine per cent over black comes out at 2.8:1 done linearly and 1.2:1
 * done the way it actually renders. Every border in this theme is a white or
 * black alpha, so getting that wrong would have made the whole check flatter
 * the palette rather than test it.
 */
export interface Srgb {
  r: number;
  g: number;
  b: number;
}

/** A parsed colour: sRGB plus the alpha it was written with. */
export interface ParsedColour extends Srgb {
  /** 1 unless the value carried a slash alpha. */
  alpha: number;
}

const OKLCH = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/i;

function number(text: string): number {
  return text.endsWith("%") ? Number(text.slice(0, -1)) / 100 : Number(text);
}

/**
 * Parses `oklch(L C H)` or `oklch(L C H / A)` into gamma-encoded sRGB.
 *
 * Out-of-gamut results are clamped per channel, which is what a display does
 * with them anyway. Computing a luminance from negative light would make a
 * vivid colour look better than it renders.
 */
export function parseOklch(value: string): ParsedColour | undefined {
  const match = OKLCH.exec(value.trim());
  if (match === null) return undefined;
  const [, lightness, chroma, hue, alpha] = match as unknown as [
    string,
    string,
    string,
    string,
    string | undefined,
  ];

  const L = number(lightness);
  const C = Number(chroma);
  const h = (Number(hue) * Math.PI) / 180;

  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const encode = (channel: number): number => {
    const clamped = Math.min(1, Math.max(0, channel));
    return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  };

  return {
    r: encode(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: encode(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: encode(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    alpha: alpha === undefined ? 1 : number(alpha),
  };
}

/** Undoes the sRGB transfer function, which is what luminance is defined over. */
function linearise(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

/**
 * A translucent colour over an opaque one, which is what the eye actually sees.
 *
 * Most of the border and wash tokens are white or black at eight to twenty per
 * cent. Judging one of those on its own would say a hairline border is pure
 * white and passes everything, which is the opposite of true.
 */
export function over(foreground: ParsedColour, background: Srgb): Srgb {
  const mix = (a: number, b: number): number => a * foreground.alpha + b * (1 - foreground.alpha);
  return {
    r: mix(foreground.r, background.r),
    g: mix(foreground.g, background.g),
    b: mix(foreground.b, background.b),
  };
}

/** WCAG relative luminance, from gamma-encoded sRGB. */
export function luminance(colour: Srgb): number {
  return 0.2126 * linearise(colour.r) + 0.7152 * linearise(colour.g) + 0.0722 * linearise(colour.b);
}

/**
 * The WCAG 2.x contrast ratio between two opaque colours, 1 to 21.
 *
 * Order does not matter: the lighter of the two goes on top either way, which
 * is why a caller never has to decide which argument is the text.
 */
export function contrastRatio(a: Srgb, b: Srgb): number {
  const first = luminance(a);
  const second = luminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * The thresholds this product holds itself to, named rather than typed as bare
 * numbers at each call site.
 *
 * `TEXT` and `LARGE_TEXT` are WCAG 2.2 AA for body and for large text.
 * `NON_TEXT` is 1.4.11, which is what a focus indicator and the boundary of a
 * control have to meet, and it is the one this design's aesthetic makes hard.
 */
export const WCAG_AA = {
  TEXT: 4.5,
  LARGE_TEXT: 3,
  NON_TEXT: 3,
} as const;

/**
 * Resolves a token to linear sRGB, following `var(--other)` and compositing any
 * alpha over the surface it is drawn on.
 *
 * Written against a flat map of declarations rather than a browser, so the
 * check runs in a unit test with no rendering, no headless browser and no
 * screenshot to compare. Returns undefined for a name nothing defines, which a
 * caller should treat as a failure rather than a pass: a token a test cannot
 * find is one nothing is checking.
 */
export function resolveToken(
  tokens: Readonly<Record<string, string>>,
  name: string,
  on: Srgb,
  seen: ReadonlySet<string> = new Set(),
): Srgb | undefined {
  if (seen.has(name)) return undefined;
  const raw = tokens[name];
  if (raw === undefined) return undefined;

  const reference = /^var\(\s*(--[\w-]+)\s*\)$/.exec(raw.trim());
  if (reference !== null) {
    return resolveToken(tokens, reference[1] as string, on, new Set([...seen, name]));
  }

  const parsed = parseOklch(raw);
  if (parsed === undefined) return undefined;
  // The alpha is dropped either way: a caller wants the colour as it renders,
  // and an opaque result carrying `alpha: 1` would compare unequal to the same
  // colour written without one.
  return over(parsed, on);
}
