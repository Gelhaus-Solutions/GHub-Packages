/**
 * The modern button recipe, rendered rather than reasoned about.
 *
 * Sheet 09 draws P0 as eight buttons and three rules: two sizes, a radius and a
 * type step; a native button for the keyboard; and busy as `aria-busy` with the
 * label left alone. The classes and the attributes are mechanical, so they are
 * asserted here. What a press does is in `modern-button-interaction.test.ts`,
 * which has a document to press it in.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buttonClasses, type ButtonVariant } from "./modern/button-classes.js";
import { Button } from "./modern/button.js";

function render(node: ReactNode): string {
  return renderToStaticMarkup(node as never);
}

function classesOf(html: string): string[] {
  return (/class="([^"]*)"/.exec(html)?.[1] ?? "").split(/\s+/);
}

const VARIANTS: readonly ButtonVariant[] = ["primary", "secondary", "quiet", "destructive"];

describe("buttonClasses draws each variant in its own material", () => {
  it("fills the primary with the accent and labels it in accent-on", () => {
    const classes = buttonClasses({ variant: "primary" }).split(" ");
    expect(classes).toEqual(
      expect.arrayContaining([
        "bg-m-accent",
        "text-m-accent-on",
        "hover:bg-m-accent-hover",
        "active:bg-m-accent-press",
      ]),
    );
  });

  it("draws the secondary as a quiet plate with a control edge", () => {
    const classes = buttonClasses({ variant: "secondary" }).split(" ");
    expect(classes).toEqual(
      expect.arrayContaining(["bg-m-plate", "border-m-control", "shadow-m-quiet", "text-m-ink"]),
    );
  });

  it("keeps the plate under the hover film rather than replacing it", () => {
    /*
     * The film is an image layer. A hover background COLOUR would replace the
     * plate, and a hovered secondary would turn into whatever is behind it,
     * which is a step to another surface and not a film.
     */
    const classes = buttonClasses({ variant: "secondary" }).split(" ");
    expect(classes).toContain("bg-m-plate");
    expect(classes.some((c) => c.startsWith("hover:bg-[linear-gradient("))).toBe(true);
  });

  it("sets the quiet verb as a link: accent ink, no fill, no edge", () => {
    const classes = buttonClasses({ variant: "quiet" }).split(" ");
    expect(classes).toEqual(
      expect.arrayContaining(["text-m-accent-text", "bg-transparent", "border-transparent"]),
    );
    expect(classes.some((c) => c.startsWith("shadow-m"))).toBe(false);
  });

  it("fills the destructive with crit-fill and a white label, not the status crit", () => {
    const classes = buttonClasses({ variant: "destructive" }).split(" ");
    expect(classes).toEqual(expect.arrayContaining(["bg-m-crit-fill", "text-white"]));
    expect(classes).not.toContain("bg-m-crit");
  });

  it("defaults to the secondary at 44, so the accent is always asked for by name", () => {
    expect(buttonClasses()).toBe(buttonClasses({ variant: "secondary", size: 44 }));
  });
});

describe("buttonClasses holds the geometry sheet 09 states", () => {
  it("is 44 or 36 tall and nothing else", () => {
    expect(buttonClasses({ size: 44 }).split(" ")).toContain("h-11");
    expect(buttonClasses({ size: 36 }).split(" ")).toContain("h-9");
  });

  it("pads 18 at 44 and 12 at 36, and 2 for the quiet verb at either", () => {
    expect(buttonClasses({ size: 44 }).split(" ")).toContain("px-[18px]");
    expect(buttonClasses({ size: 36 }).split(" ")).toContain("px-3");
    for (const size of [44, 36] as const) {
      const classes = buttonClasses({ variant: "quiet", size }).split(" ");
      expect(classes).toContain("px-0.5");
      expect(classes.filter((c) => c.startsWith("px-"))).toHaveLength(1);
    }
  });

  it("takes the control radius and the control type step on every variant", () => {
    for (const variant of VARIANTS) {
      const classes = buttonClasses({ variant }).split(" ");
      expect(classes).toContain("rounded-m-control");
      expect(classes).toContain("text-m-control");
    }
  });

  it("keeps the type step beside the label ink, in every variant and state", () => {
    /*
     * tailwind-merge reads `text-m-control` and `text-m-accent-on` as two text
     * colours and keeps the last, so a recipe run through `cn` loses its type
     * step and the label inherits whatever the page sets. Measured against
     * the `cn` in this package: that is what it does today.
     */
    for (const variant of VARIANTS) {
      for (const busy of [false, true]) {
        const classes = buttonClasses({ variant, busy }).split(" ");
        expect(classes).toContain("text-m-control");
        expect(classes.filter((c) => /^text-(?!m-control$)/.test(c))).toHaveLength(1);
      }
    }
    const html = render(createElement(Button, { variant: "primary", className: "ml-auto" }, "Go"));
    expect(classesOf(html)).toEqual(expect.arrayContaining(["text-m-control", "text-m-accent-on"]));
  });

  it("never lists two classes for one property", () => {
    // Joined, not merged, so a duplicate would be settled by stylesheet order.
    for (const variant of VARIANTS) {
      for (const size of [44, 36] as const) {
        for (const busy of [false, true]) {
          const classes = buttonClasses({ variant, size, busy }).split(" ");
          expect(classes.filter((c) => /^px-/.test(c))).toHaveLength(1);
          expect(classes.filter((c) => /^h-/.test(c))).toHaveLength(1);
          expect(classes.filter((c) => /^bg-m-|^bg-transparent$/.test(c)).length).toBeLessThan(2);
        }
      }
    }
  });

  it("fills its container only when asked", () => {
    expect(buttonClasses({ block: true }).split(" ")).toContain("w-full");
    expect(buttonClasses().split(" ")).not.toContain("w-full");
  });
});

describe("buttonClasses draws the focus ring and never animates it", () => {
  it("puts a 2px m-ring at offset 2 on every variant", () => {
    for (const variant of VARIANTS) {
      const classes = buttonClasses({ variant }).split(" ");
      expect(classes).toEqual(
        expect.arrayContaining([
          "focus-visible:outline-2",
          "focus-visible:outline-offset-2",
          "focus-visible:outline-m-ring",
        ]),
      );
    }
  });

  it("carries no transition that could fade the ring in", () => {
    /*
     * Tailwind v4's `transition-colors` includes `outline-color`, and so do
     * `transition` and `transition-all`. Any of them would animate the ring.
     */
    for (const variant of VARIANTS) {
      for (const busy of [false, true]) {
        const transitions = buttonClasses({ variant, busy })
          .split(" ")
          .filter((c) => /(^|:)transition(-|$)/.test(c) || /(^|:)duration-/.test(c));
        expect(transitions).toEqual([]);
      }
    }
  });
});

describe("buttonClasses draws inactive as no material", () => {
  it("drops the fill, the edge and the shadow, and sets the inactive ink", () => {
    for (const variant of VARIANTS) {
      const classes = buttonClasses({ variant }).split(" ");
      expect(classes).toEqual(
        expect.arrayContaining([
          "disabled:bg-transparent",
          "disabled:border-transparent",
          "disabled:shadow-none",
          "disabled:text-m-ink-off",
        ]),
      );
    }
  });

  it("stops a disabled button from taking a hover", () => {
    // `hover:` is emitted after `disabled:` in v4, so without this a disabled
    // primary would put its hover fill back on the moment a pointer crossed it.
    expect(buttonClasses({ variant: "primary" }).split(" ")).toContain(
      "disabled:pointer-events-none",
    );
  });
});

describe("buttonClasses draws busy as held down", () => {
  it("shows the primary in its press token and offers no hover", () => {
    const classes = buttonClasses({ variant: "primary", busy: true }).split(" ");
    expect(classes).toContain("bg-m-accent-press");
    expect(classes).not.toContain("bg-m-accent");
    expect(classes.some((c) => c.startsWith("hover:"))).toBe(false);
  });
});

describe("Button", () => {
  it("is a native button, so Enter and Space work without being taught", () => {
    const html = render(createElement(Button, { variant: "primary" }, "Schedule"));
    expect(html.startsWith("<button")).toBe(true);
    expect(html).not.toContain("role=");
    expect(html).not.toContain("tabindex");
  });

  it("is a plain button unless a submit is asked for by name", () => {
    expect(render(createElement(Button, null, "Back"))).toContain('type="button"');
    expect(render(createElement(Button, { type: "submit" }, "Save"))).toContain('type="submit"');
  });

  it("says aria-busy while waiting and keeps the label exactly as it was", () => {
    const html = render(createElement(Button, { variant: "primary", busy: true }, "Schedule"));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain(">Schedule</button>");
    // No spinner standing in for the words, and nothing hiding them.
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("opacity-0");
    expect(html).not.toContain("invisible");
  });

  it("stays focusable while busy rather than becoming disabled", () => {
    const html = render(createElement(Button, { busy: true }, "Schedule"));
    expect(html).not.toMatch(/\sdisabled(=|\s|>)/);
    expect(html).toContain('aria-disabled="true"');
  });

  it("writes no busy attribute at rest", () => {
    const html = render(createElement(Button, null, "Schedule"));
    expect(html).not.toContain("aria-busy");
    expect(html).not.toContain("aria-disabled");
  });

  it("draws the recipe it is given and lets the caller add to it", () => {
    const html = render(
      createElement(Button, { variant: "destructive", size: 36, className: "ml-auto" }, "Cancel"),
    );
    const classes = classesOf(html);
    expect(classes).toEqual(expect.arrayContaining(["bg-m-crit-fill", "h-9", "ml-auto"]));
  });

  it("is a real disabled button when disabled, with no material", () => {
    const html = render(createElement(Button, { variant: "primary", disabled: true }, "Verify"));
    expect(html).toMatch(/\sdisabled=""/);
    expect(classesOf(html)).toContain("disabled:bg-transparent");
  });
});

describe("the recipe is callable from the server", () => {
  const HERE = dirname(fileURLToPath(import.meta.url));

  it("keeps buttonClasses in a module with no client directive", () => {
    /*
     * A function exported from a "use client" module reaches a server component
     * as a reference it cannot call, so a Link could not wear the recipe. The
     * button itself is the client half and says so.
     */
    const recipe = readFileSync(join(HERE, "modern", "button-classes.ts"), "utf8");
    expect(recipe).not.toMatch(/^\s*["']use client["']/m);
    const button = readFileSync(join(HERE, "modern", "button.tsx"), "utf8");
    expect(button.trimStart().startsWith('"use client";')).toBe(true);
  });
});

describe("the modern button reaches for no console utility", () => {
  // The same pattern `modern-components.test.ts` applies to the rest of modern.
  const CONSOLE_ONLY =
    /\b(?:bg|text|border|ring|fill|stroke|shadow|from|to|via)-(?:fg|sunken|base|raised|overlay|inset|hairline|subtle|strong|accent|ok|warn|crit|info|idle|locked)\b(?!-m\b)/;

  it("renders no console colour in any variant, busy or not", () => {
    for (const variant of VARIANTS) {
      for (const busy of [false, true]) {
        const offenders = buttonClasses({ variant, busy })
          .split(" ")
          .filter((c) => CONSOLE_ONLY.test(c) || c.includes("--gc-"));
        expect(offenders).toEqual([]);
      }
    }
  });
});
