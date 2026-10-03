/**
 * VersionState and ChangeLine, as markup.
 *
 * VersionState: the ramp is decided inside, from the state alone, and Status
 * sits inside unchanged. ChangeLine: the sentence is the caller's, the figures
 * are mono with a true minus, and assistive technology hears them as words
 * rather than as arithmetic.
 *
 * Neither has behaviour, so there is no interaction file: what a reader is
 * left with once the hidden parts are gone is checked here by walking the
 * markup the same way.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChangeLine, type ChangeLineProps } from "./modern/change-line.js";
import { Status } from "./modern/status.js";
import {
  VERSION_STATE_WORDS,
  VersionState,
  type VersionStateValue,
} from "./modern/version-state.js";

function state(value: VersionStateValue, extra: { word?: string; chip?: boolean } = {}): string {
  return renderToStaticMarkup(createElement(VersionState, { state: value, ...extra }));
}

describe("VersionState", () => {
  it("decides each level inside, and only Not dated yet takes warn", () => {
    const expected: Record<VersionStateValue, string> = {
      "in-force": "text-m-ok-ink",
      announced: "text-m-info-ink",
      scheduled: "text-m-info-ink",
      "not-dated": "text-m-warn-ink",
      held: "text-m-idle-ink",
      superseded: "text-m-idle-ink",
      "never-in-force": "text-m-idle-ink",
      draft: "text-m-idle-ink",
    };
    for (const [value, ink] of Object.entries(expected)) {
      expect(state(value as VersionStateValue), value).toContain(ink);
    }
  });

  it("never reaches for crit: no state of a version is something already lost", () => {
    for (const value of Object.keys(VERSION_STATE_WORDS) as VersionStateValue[]) {
      expect(state(value, { chip: true })).not.toContain("m-crit");
    }
  });

  it("says the sheet's words by default", () => {
    expect(VERSION_STATE_WORDS).toEqual({
      "in-force": "In force",
      announced: "Announced",
      scheduled: "Scheduled",
      "not-dated": "Not dated yet",
      held: "Held for a campaign",
      superseded: "Superseded",
      "never-in-force": "Never in force",
      draft: "Draft",
    });
    expect(state("held")).toContain(">Held for a campaign</span>");
  });

  it("takes the caller's word in place of the default", () => {
    const html = state("held", { word: "Held on Contribution Checker" });
    expect(html).toContain("Held on Contribution Checker");
    expect(html).not.toContain("Held for a campaign");
  });

  it("is the existing Status, chip and all, unchanged", () => {
    for (const chip of [false, true]) {
      const expected = renderToStaticMarkup(
        createElement(Status, { level: "warn", chip, children: "Not dated yet" }),
      );
      expect(state("not-dated", { chip })).toBe(expected);
    }
  });
});

function line(extra: Partial<ChangeLineProps> = {}): string {
  return renderToStaticMarkup(
    createElement(ChangeLine, {
      children: "Reworded 2 sections: Sub-processors; Transfers.",
      ...extra,
    }),
  );
}

/** What is left to read once everything aria-hidden is gone. */
function heard(html: string): string {
  return html
    .replace(/<span aria-hidden="true"[^>]*>[^<]*<\/span>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

describe("ChangeLine", () => {
  it("is the caller's sentence alone when no figures are given", () => {
    expect(line()).toBe(
      '<p class="text-m-body text-m-ink">Reworded 2 sections: Sub-processors; Transfers.</p>',
    );
  });

  it("draws the figures in mono, quiet, unbroken, with a true minus", () => {
    const html = line({ added: 19, removed: 4, unit: "words" });
    const stat = /<span aria-hidden="true" class="([^"]*)">([^<]*)<\/span>/.exec(html);
    expect(stat?.[2]).toBe("+19 −4 words");
    expect(stat?.[1]?.split(" ")).toEqual(
      expect.arrayContaining(["font-mono", "text-m-meta", "text-m-ink-3", "whitespace-nowrap"]),
    );
    expect(html).not.toMatch(/-4 words/);
  });

  it("drops the unit when there is none", () => {
    expect(line({ added: 46, removed: 15 })).toContain(">+46 −15</span>");
  });

  it("says the figures as words rather than as arithmetic", () => {
    expect(heard(line({ added: 19, removed: 4, unit: "words" }))).toBe(
      "Reworded 2 sections: Sub-processors; Transfers. 19 words added, 4 removed",
    );
    expect(heard(line({ added: 46, removed: 15 }))).toBe(
      "Reworded 2 sections: Sub-processors; Transfers. 46 added, 15 removed",
    );
  });

  it("takes the caller's words for the figures in another language", () => {
    const html = line({
      added: 19,
      removed: 4,
      unit: "words",
      statLabel: (added, removed) =>
        `${String(added)} Wörter hinzugefügt, ${String(removed)} entfernt`,
    });
    expect(html).toContain('<span class="sr-only">19 Wörter hinzugefügt, 4 entfernt</span>');
  });

  it("counts a missing side as nothing when only one is given", () => {
    expect(line({ added: 3 })).toContain(">+3 −0</span>");
  });
});
