/**
 * Standing's markup contract: the ramp is decided inside, Status is reused
 * unchanged, the objection is a colourless link that never tints the chip, and
 * assistive technology hears one sentence rather than the scanned fragments.
 *
 * The link's role and name, and what a screen reader is left with once the
 * hidden parts are gone, are asked of a document in
 * `modern-standing-interaction.test.ts`.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Standing, type StandingProps, type StandingValue } from "./modern/standing.js";
import { Status } from "./modern/status.js";

function render(props: StandingProps): string {
  return renderToStaticMarkup(createElement(Standing, props));
}

const RESTRICTED: StandingProps = {
  standing: "restricted",
  word: "Restricted",
  at: "on 21 Nov 2026, 00:00 CET",
  cause: "Behind on gs-terms-2026-10-01, in force since 20 Nov 2026, 00:00 CET",
  objection: { text: "Objected 12 Oct, by mail", href: "#objections" },
};

/** The sr-only sentence. */
function said(html: string): string {
  return /<p class="sr-only">([^<]*)<\/p>/.exec(html)?.[1] ?? "";
}

describe("Standing", () => {
  it("maps each standing to its level inside, not by the caller", () => {
    const expected: Record<StandingValue, string> = {
      agreed: "bg-m-ok-wash",
      asked: "bg-m-info-wash",
      "owed-paid": "bg-m-warn-wash",
      restricted: "bg-m-warn-wash",
      exempt: "bg-m-idle/10",
    };
    for (const [standing, wash] of Object.entries(expected)) {
      const html = render({ standing: standing as StandingValue, word: "Word" });
      expect(html, standing).toContain(wash);
    }
  });

  it("never reaches for crit: a standing is not something already lost", () => {
    for (const standing of ["agreed", "asked", "owed-paid", "restricted", "exempt"] as const) {
      expect(render({ standing, word: "Word" })).not.toContain("m-crit");
    }
  });

  it("wraps the existing Status chip unchanged", () => {
    const html = render({ standing: "restricted", word: "Restricted" });
    const chip = renderToStaticMarkup(
      createElement(Status, { level: "warn", chip: true, children: "Restricted" }),
    );
    expect(html).toContain(chip);
  });

  it("composes one sentence from the word, the instant and a string cause", () => {
    expect(said(render(RESTRICTED))).toBe(
      "Restricted on 21 Nov 2026, 00:00 CET. Behind on gs-terms-2026-10-01, in force since 20 Nov 2026, 00:00 CET.",
    );
    expect(said(render({ standing: "agreed", word: "Agreed" }))).toBe("Agreed.");
  });

  it("uses the caller's sentence when there is one", () => {
    const html = render({
      ...RESTRICTED,
      summary: "Restricted on 21 November 2026. Behind on gs-terms-2026-10-01.",
    });
    expect(said(html)).toBe("Restricted on 21 November 2026. Behind on gs-terms-2026-10-01.");
  });

  it("hides the chip, the instant and the cause, which the sentence already says", () => {
    const html = render(RESTRICTED);
    expect(html).toMatch(
      /<span aria-hidden="true" class="inline-flex"><span class="[^"]*rounded-m-chip/,
    );
    expect(html).toMatch(
      /<span aria-hidden="true" class="[^"]*">on 21 Nov 2026, 00:00 CET<\/span>/,
    );
    expect(html).toMatch(/<p aria-hidden="true" class="[^"]*">Behind on gs-terms/);
  });

  it("leaves the objection out of the sentence, because its link follows and says it", () => {
    const html = render(RESTRICTED);
    expect(said(html)).not.toContain("Objected");
    expect(html.indexOf("Objected 12 Oct")).toBeGreaterThan(html.indexOf('class="sr-only"'));
  });

  describe("the objection marker", () => {
    const html = render(RESTRICTED);
    const link = /<a [^>]*>.*?<\/a>/s.exec(html)?.[0] ?? "";

    it("is a link to the objection", () => {
      // That no hidden ancestor swallows it is walked in the jsdom file.
      expect(link).toMatch(/^<a href="#objections"/);
      expect(link).toContain("Objected 12 Oct, by mail");
    });

    it("carries no colour: ink-2 on a dashed strong edge, chip radius", () => {
      expect(link).toContain("text-m-ink-2");
      expect(link).toContain("border-dashed");
      expect(link).toContain("border-m-strong");
      expect(link).toContain("rounded-m-chip");
      expect(link).not.toMatch(/m-(?:ok|info|warn|crit|idle|accent)/);
    });

    it("draws a hidden speech glyph at stroke 1.75", () => {
      const svg = /<svg[^>]*>/.exec(link)?.[0] ?? "";
      expect(svg).toContain('aria-hidden="true"');
      expect(svg).toContain('stroke-width="1.75"');
      expect(svg).toContain("lucide-message-square");
    });

    it("is at least 24 tall and keeps a visible focus ring", () => {
      expect(link).toContain("min-h-6");
      expect(link).toContain("focus-visible:outline-m-ring");
      expect(link).toContain("focus-visible:outline-offset-2");
    });

    it("never tints the chip", () => {
      const without = render({ ...RESTRICTED, objection: undefined });
      const chip = (h: string) => /<span class="[^"]*rounded-m-chip[^"]*"/.exec(h)?.[0];
      expect(chip(html)).toBe(chip(without));
    });
  });

  it("renders the breakdown slot under the rest, readable", () => {
    const html = render({
      ...RESTRICTED,
      breakdown: createElement("p", null, "Behind on 1 of 5 documents"),
    });
    expect(html).toContain("<div><p>Behind on 1 of 5 documents</p></div>");
    expect(html.indexOf("Behind on 1 of 5")).toBeGreaterThan(html.indexOf("Behind on gs-terms"));
  });

  it("will not compose a sentence from a cause that is markup", () => {
    /*
     * A sentence cannot be read back out of markup, so a markup cause without a
     * `summary` is a type error rather than a sentence that quietly drops it.
     * `tsc` checks that the error below exists; this body only runs.
     */
    // @ts-expect-error A cause that is markup needs the caller's summary.
    const props: StandingProps = {
      standing: "restricted",
      word: "Restricted",
      cause: createElement("code", null, "gs-terms-2026-10-01"),
    };
    expect(props.standing).toBe("restricted");
  });

  it("draws no cause line, instant or marker that was not given", () => {
    const html = render({ standing: "exempt", word: "Exempt, staff" });
    expect(html).not.toContain("<a ");
    expect(html.match(/<p[\s>]/g) ?? []).toHaveLength(1);
  });
});
