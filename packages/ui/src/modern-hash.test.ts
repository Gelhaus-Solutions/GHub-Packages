/**
 * Hash's short form, its name and its verdict, rendered rather than reasoned
 * about.
 *
 * Sheet 09 draws P7 because CopyChip truncates at the end, which hides the half
 * people compare, and has no verdict. The contract is mechanical: which
 * characters are shown, which are copied and named, and that a verdict is a
 * word. Copying and opening are in `modern-hash-interaction.test.ts`.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Hash, type HashProps } from "./modern/hash.js";

const SHA = "4f70b949879bfff286688687888cc5bfd40d66fc442b85635b01cd5edd6b6a75";
const OTHER = "e0c5cedd3b1c4a2f9d7e6b5a4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8aa71f02";

const VERDICT = {
  matchesLabel: "Matches",
  mismatchLabel: "Does not match",
  expectedLabel: "Expected",
};

function render(props: Partial<HashProps> = {}): string {
  return renderToStaticMarkup(
    createElement(Hash, {
      value: SHA,
      label: "Copy the sha256 of the English text",
      showFullLabel: "Show full",
      copiedLabel: "Copied",
      refusedLabel: "This browser would not copy it. Select it by hand.",
      ...props,
    }),
  );
}

/** The opening tag of the first button, which is the copy chip. */
function chip(html: string): string {
  return /<button[^>]*>/.exec(html)?.[0] ?? "";
}

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}

describe("Hash shortens in the middle", () => {
  it("shows the first eight and the last six around an ellipsis", () => {
    const html = render();
    expect(html).toContain("<span>4f70b949…6b6a75</span>");
  });

  it("shows a value too short to shorten whole", () => {
    const html = render({ value: "4f70b9496b6a75" });
    expect(html).toContain("<span>4f70b9496b6a75</span>");
    expect(html).not.toContain("…");
  });
});

describe("Hash copies and names the whole value", () => {
  it("puts the full value in the copy button's accessible name", () => {
    expect(attr(chip(render()), "aria-label")).toBe(`Copy the sha256 of the English text: ${SHA}`);
  });

  it("is one button for the copy, a native one", () => {
    const tag = chip(render());
    expect(tag).toContain('type="button"');
    expect(tag).not.toContain("tabindex");
  });

  it("keeps the browser from translating the value", () => {
    expect(attr(chip(render()), "translate")).toBe("no");
  });

  it("mounts the copy status beside the button, never inside it", () => {
    /*
     * A button's children are presentational, so a live region inside one is
     * not reliably exposed. The chip closes before the region opens.
     */
    const html = render();
    const closes = html.indexOf("</button>");
    const region = html.indexOf('role="status"');
    expect(region).toBeGreaterThan(closes);
  });

  it("holds the type step and the ink together on the chip", () => {
    // `cn` would keep only the ink; the chip is joined, so both survive.
    const classes = attr(chip(render()), "class")?.split(" ") ?? [];
    expect(classes).toEqual(expect.arrayContaining(["text-m-meta", "text-m-ink-2", "font-mono"]));
  });

  it("draws the chip's edge at the control weight, which owes 3:1", () => {
    expect(attr(chip(render()), "class")?.split(" ")).toContain("border-m-control");
  });
});

describe("Hash opens in place, grouped in eights", () => {
  it("ties a Show full trigger to a panel that exists and is hidden", () => {
    const html = render();
    const trigger = /<button[^>]*aria-expanded[^>]*>/.exec(html)?.[0] ?? "";
    expect(attr(trigger, "aria-expanded")).toBe("false");
    const panelId = attr(trigger, "aria-controls") as string;
    expect(panelId).toBeTruthy();
    expect(html).toMatch(new RegExp(`<div[^>]*id="${panelId}"[^>]*hidden`));
  });

  it("holds the full value grouped in eights inside the panel, mounted while closed", () => {
    expect(render()).toContain(
      "4f70b949 879bfff2 86688687 888cc5bf d40d66fc 442b8563 5b01cd5e dd6b6a75",
    );
  });

  it("gives the trigger a 24px target", () => {
    const trigger = /<button[^>]*aria-expanded[^>]*>/.exec(render())?.[0] ?? "";
    expect(attr(trigger, "class")?.split(" ")).toContain("min-h-6");
  });

  it("draws the ring on both buttons: 2px m-ring at offset 2", () => {
    const buttons = render().match(/<button[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(attr(button, "class")?.split(" ")).toEqual(
        expect.arrayContaining([
          "focus-visible:outline-2",
          "focus-visible:outline-offset-2",
          "focus-visible:outline-m-ring",
        ]),
      );
    }
  });
});

describe("Hash with no expected value", () => {
  it("is neutral: no verdict word, no dot, nothing described", () => {
    const html = render();
    expect(html).not.toContain("Matches");
    expect(html).not.toContain("Does not match");
    expect(html).not.toContain("bg-m-ok");
    expect(html).not.toContain("bg-m-crit");
    expect(attr(chip(html), "aria-describedby")).toBeUndefined();
  });
});

describe("Hash against an expected value", () => {
  it("says Matches in a word, ignoring case and outer space", () => {
    const html = render({ verdict: { ...VERDICT, expected: ` ${SHA.toUpperCase()} ` } });
    expect(html).toMatch(/<span aria-hidden="true"[^>]*bg-m-ok[^>]*><\/span>Matches/);
    expect(html).not.toContain("Expected");
  });

  it("says Does not match in a word, never in colour alone", () => {
    const html = render({ value: OTHER, verdict: { ...VERDICT, expected: SHA } });
    expect(html).toMatch(/<span aria-hidden="true"[^>]*bg-m-crit[^>]*><\/span>Does not match/);
    expect(html).not.toContain(">Matches<");
  });

  it("shows the expected value on a mismatch, short beside it and whole in the panel", () => {
    const html = render({ value: OTHER, verdict: { ...VERDICT, expected: SHA } });
    expect(html).toMatch(/Expected <span[^>]*>4f70b949…6b6a75<\/span>/);
    expect(html).toContain(
      "4f70b949 879bfff2 86688687 888cc5bf d40d66fc 442b8563 5b01cd5e dd6b6a75",
    );
  });

  it("describes the copy button by the verdict, and by the expected value on a mismatch", () => {
    for (const [value, count] of [
      [SHA, 1],
      [OTHER, 2],
    ] as const) {
      const html = render({ value, verdict: { ...VERDICT, expected: SHA } });
      const ids = attr(chip(html), "aria-describedby")?.split(" ") ?? [];
      expect(ids).toHaveLength(count);
      for (const id of ids) expect(html).toContain(`id="${id}"`);
    }
  });

  it("sets the verdict at the meta step even though Status loses its own", () => {
    const html = render({ verdict: { ...VERDICT, expected: SHA } });
    expect(html).toMatch(/<span id="[^"]*" class="text-m-meta"><span/);
  });
});

describe("Hash reaches for no console utility", () => {
  const CONSOLE_ONLY =
    /\b(?:bg|text|border|ring|fill|stroke|shadow|from|to|via)-(?:fg|sunken|base|raised|overlay|inset|hairline|subtle|strong|accent|ok|warn|crit|info|idle|locked)\b(?!-m\b)/;

  it("renders no console colour, neutral, matching or not", () => {
    for (const html of [
      render(),
      render({ verdict: { ...VERDICT, expected: SHA } }),
      render({ value: OTHER, verdict: { ...VERDICT, expected: SHA } }),
    ]) {
      const classes = Array.from(html.matchAll(/class="([^"]*)"/g), (m) => m[1] as string);
      const offenders = classes.flatMap((c) =>
        c.split(/\s+/).filter((u) => CONSOLE_ONLY.test(u) || u.includes("--gc-")),
      );
      expect(offenders).toEqual([]);
    }
  });
});
