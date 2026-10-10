/**
 * TypedConfirmation's rule and its markup, rendered rather than reasoned about.
 *
 * Sheet 09 draws P3 with three rules and an announcement: exact after trimming
 * with case counting, paste allowed, a match shown at once and a mismatch only
 * on blur or submit, and the expected string read out as part of the field's
 * description. The rule and the static states are asserted here; the timing of
 * the verdict needs a document and is in
 * `modern-typed-confirmation-interaction.test.ts`.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { typedConfirmationMatches } from "./modern/typed-confirmation-match.js";
import { TypedConfirmation, type TypedConfirmationProps } from "./modern/typed-confirmation.js";

const TITLE = "Privacy and terms, October 2026";

function render(props: Partial<TypedConfirmationProps> = {}): string {
  return renderToStaticMarkup(
    createElement(TypedConfirmation, {
      label: "Type the campaign's title",
      expected: TITLE,
      value: "",
      onChange: () => {},
      matchesLabel: "Matches",
      mismatch: "This does not match the title. Type it exactly as shown above it.",
      hint: "Typed again to confirm.",
      ...props,
    }),
  );
}

function attr(html: string, tag: string, name: string): string | undefined {
  return new RegExp(`<${tag}[^>]*\\s${name}="([^"]*)"`).exec(html)?.[1];
}

describe("typedConfirmationMatches", () => {
  it("forgives space at either end and nothing else", () => {
    expect(typedConfirmationMatches(`  ${TITLE}\t`, TITLE)).toBe(true);
    expect(typedConfirmationMatches("Privacy and  terms, October 2026", TITLE)).toBe(false);
    expect(typedConfirmationMatches("Privacy and terms October 2026", TITLE)).toBe(false);
  });

  it("counts case for text", () => {
    expect(typedConfirmationMatches("privacy and terms, october 2026", TITLE)).toBe(false);
  });

  it("compares a count as the digits it is, with no rounding or parsing", () => {
    expect(typedConfirmationMatches("148", "148")).toBe(true);
    expect(typedConfirmationMatches(" 148 ", "148")).toBe(true);
    expect(typedConfirmationMatches("151", "148")).toBe(false);
    expect(typedConfirmationMatches("148.0", "148")).toBe(false);
    expect(typedConfirmationMatches("0148", "148")).toBe(false);
  });

  it("treats canonically equivalent text as the same text", () => {
    const composed = "Geschäftsbedingungen";
    const decomposed = "Geschäftsbedingungen";
    expect(composed).not.toBe(decomposed);
    expect(typedConfirmationMatches(decomposed, composed)).toBe(true);
  });

  it("never matches an empty answer to a real string", () => {
    expect(typedConfirmationMatches("", TITLE)).toBe(false);
    expect(typedConfirmationMatches("   ", TITLE)).toBe(false);
  });

  it("lives in a module the server can call", () => {
    /*
     * The action behind the field re-checks the string when the form arrives.
     * A function from a "use client" module reaches the server as a reference
     * it cannot call, and a second copy of the rule is how the field and the
     * server end up disagreeing.
     */
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "modern", "typed-confirmation-match.ts"), "utf8");
    expect(source).not.toMatch(/^\s*["']use client["']/m);
  });
});

describe("TypedConfirmation shows what to type", () => {
  it("shows the expected string, in mono, between the label and the field", () => {
    const html = render();
    const label = html.indexOf("<label");
    const expected = html.indexOf(TITLE);
    const input = html.indexOf("<input");
    expect(label).toBeGreaterThan(-1);
    expect(expected).toBeGreaterThan(label);
    expect(input).toBeGreaterThan(expected);
    expect(html).toMatch(new RegExp(`<p[^>]*class="[^"]*font-mono[^"]*"[^>]*>${TITLE}</p>`));
  });

  it("puts the expected string FIRST in the field's description", () => {
    const html = render();
    const describedBy = attr(html, "input", "aria-describedby")?.split(" ") ?? [];
    expect(describedBy.length).toBeGreaterThanOrEqual(2);
    const first = describedBy[0] as string;
    expect(html).toMatch(new RegExp(`<p[^>]*id="${first}"[^>]*>${TITLE}</p>`));
  });

  it("keeps the browser from translating the string to type", () => {
    const html = render();
    expect(html).toMatch(new RegExp(`<p[^>]*translate="no"[^>]*>${TITLE}</p>`));
  });

  it("points every described id at an element that exists", () => {
    for (const html of [render(), render({ value: "nope", showMismatch: true })]) {
      for (const id of attr(html, "input", "aria-describedby")?.split(" ") ?? []) {
        expect(html).toContain(`id="${id}"`);
      }
    }
  });

  it("turns off everything a phone would do to the text", () => {
    const html = render();
    expect(attr(html, "input", "autoComplete") ?? attr(html, "input", "autocomplete")).toBe("off");
    expect(attr(html, "input", "autoCapitalize") ?? attr(html, "input", "autocapitalize")).toBe(
      "off",
    );
    expect(attr(html, "input", "autoCorrect") ?? attr(html, "input", "autocorrect")).toBe("off");
    expect(attr(html, "input", "spellCheck") ?? attr(html, "input", "spellcheck")).toBe("false");
  });

  it("is 44 tall by default, and mono in the field only when asked", () => {
    expect(attr(render(), "input", "class")).toContain("h-11");
    expect(attr(render(), "input", "class")).not.toContain("font-mono");
    expect(attr(render({ mono: true }), "input", "class")).toContain("font-mono");
  });
});

describe("TypedConfirmation at rest", () => {
  it("shows the hint and no verdict", () => {
    const html = render({ value: "Privacy and terms, Oct" });
    expect(html).toContain("Typed again to confirm.");
    expect(html).not.toContain("Matches");
    expect(html).not.toContain("This does not match");
    expect(html).not.toMatch(/\saria-invalid=/);
    expect((attr(html, "input", "class") ?? "").split(" ")).not.toContain("border-m-crit");
  });

  it("mounts an empty status region, visually hidden, before anything matches", () => {
    /*
     * A live region mounted with its text already inside is not announced by
     * most screen readers, so the region has to exist before the match does.
     */
    const html = render({ value: "Privacy" });
    expect(html).toMatch(/<div role="status" class="sr-only"><\/div>/);
  });
});

describe("TypedConfirmation once it matches", () => {
  it("shows Matches in the status region in place of the hint", () => {
    const html = render({ value: TITLE });
    const region = /<div role="status"[^>]*>(.*?)<\/div>/s.exec(html)?.[1] ?? "";
    expect(region).toContain("Matches");
    expect(html).not.toContain("Typed again to confirm.");
    expect(html).not.toMatch(/\saria-invalid=/);
  });

  it("says it in a word beside the dot, never the dot alone", () => {
    const html = render({ value: TITLE });
    expect(html).toMatch(/<span aria-hidden="true"[^>]*bg-m-ok[^>]*><\/span>Matches/);
  });

  it("is not refused even when a submit was attempted", () => {
    const html = render({ value: ` ${TITLE} `, showMismatch: true });
    expect(html).toContain("Matches");
    expect(html).not.toContain("This does not match");
  });
});

describe("TypedConfirmation refused", () => {
  it("replaces the hint with the sentence and draws the red edge", () => {
    const html = render({ value: "Privacy and terms, Oct", showMismatch: true });
    expect(html).toContain("This does not match the title. Type it exactly as shown above it.");
    expect(html).not.toContain("Typed again to confirm.");
    expect(attr(html, "input", "aria-invalid")).toBe("true");
    expect(attr(html, "input", "class")).toContain("border-m-crit");
    expect(attr(html, "input", "class")).not.toContain("border-m-control");
  });

  it("refuses an empty field on submit, where nothing typed is not an answer", () => {
    const html = render({ value: "", showMismatch: true });
    expect(html).toContain("This does not match the title.");
  });

  it("names the figure somebody typed when the caller can", () => {
    const html = renderToStaticMarkup(
      createElement(TypedConfirmation, {
        label: "Type the number of addresses",
        expected: "148",
        value: "151",
        onChange: () => {},
        matchesLabel: "Matches",
        mismatch: (typed: string) =>
          typed.trim() === "151"
            ? "151 is the number of accounts. Type the number of addresses, 148."
            : "This does not match the number of addresses.",
        showMismatch: true,
        mono: true,
        inputMode: "numeric",
      }),
    );
    expect(html).toContain("151 is the number of accounts. Type the number of addresses, 148.");
    expect(attr(html, "input", "inputMode") ?? attr(html, "input", "inputmode")).toBe("numeric");
  });

  it("still describes the field with the expected string while refused", () => {
    const html = render({ value: "x", showMismatch: true });
    const first = attr(html, "input", "aria-describedby")?.split(" ")[0] as string;
    expect(html).toMatch(new RegExp(`<p[^>]*id="${first}"[^>]*>${TITLE}</p>`));
  });
});

describe("TypedConfirmation reaches for no console utility", () => {
  const CONSOLE_ONLY =
    /\b(?:bg|text|border|ring|fill|stroke|shadow|from|to|via)-(?:fg|sunken|base|raised|overlay|inset|hairline|subtle|strong|accent|ok|warn|crit|info|idle|locked)\b(?!-m\b)/;

  it("renders no console colour at rest, matched or refused", () => {
    for (const html of [
      render(),
      render({ value: TITLE }),
      render({ value: "x", showMismatch: true }),
    ]) {
      const classes = Array.from(html.matchAll(/class="([^"]*)"/g), (m) => m[1] as string);
      const offenders = classes.flatMap((c) => c.split(/\s+/).filter((u) => CONSOLE_ONLY.test(u)));
      expect(offenders).toEqual([]);
    }
  });
});
