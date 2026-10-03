/**
 * DayStepper's markup contract: one plate, arrows named in words with their
 * chevrons hidden, 36 at a desk and 44 on a phone, a mono field, quiet verbs
 * for Today and Next, and a live region present before anything is committed.
 *
 * Committing on Enter or blur, the arrows' stepping and focus are in
 * `modern-day-stepper-interaction.test.ts`.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DayStepper, type DayStepperProps } from "./modern/day-stepper.js";

function render(extra: Partial<DayStepperProps> = {}): string {
  return renderToStaticMarkup(
    createElement(DayStepper, {
      day: "2026-11-20",
      onCommit: () => undefined,
      labels: {
        before: "The day before",
        after: "The day after",
        today: "Today",
        next: "Next date with changes",
        field: "Day, as year, month and day",
      },
      today: "2026-10-03",
      next: "2026-12-01",
      ...extra,
    }),
  );
}

function classesOf(tag: string): string[] {
  return (/class="([^"]*)"/.exec(tag)?.[1] ?? "").split(" ");
}

describe("DayStepper", () => {
  it("sits on one plate", () => {
    const outer = /^<div [^>]*>/.exec(render())?.[0] ?? "";
    expect(classesOf(outer)).toEqual(
      expect.arrayContaining(["bg-m-plate", "shadow-m-plate", "rounded-m-panel", "flex-wrap"]),
    );
  });

  it("names the arrows in words and hides their chevrons", () => {
    const html = render();
    for (const name of ["The day before", "The day after"]) {
      const tag = new RegExp(
        `<button type="button" aria-label="${name}" class="([^"]*)">(<svg[^>]*>)`,
      ).exec(html);
      expect(tag, name).not.toBeNull();
      expect(tag?.[1]?.split(" ")).toEqual(expect.arrayContaining(["size-9", "max-sm:size-11"]));
      expect(tag?.[2]).toContain('aria-hidden="true"');
      expect(tag?.[2]).toContain('stroke-width="1.75"');
    }
  });

  it("sets the day in a mono field 36 tall, 44 on a phone", () => {
    const input = /<input [^>]*>/.exec(render())?.[0] ?? "";
    expect(input).toContain('aria-label="Day, as year, month and day"');
    expect(input).toContain('value="2026-11-20"');
    expect(classesOf(input)).toEqual(
      expect.arrayContaining(["font-mono", "h-9", "max-sm:h-11", "w-[132px]"]),
    );
  });

  it("draws Today and Next as quiet verbs, and an inert Next without the accent", () => {
    const html = render();
    expect(html).toMatch(
      /<button type="button" class="[^"]*text-m-accent-text[^"]*">Today<\/button>/,
    );
    expect(html).toMatch(
      /<button type="button" class="[^"]*text-m-accent-text[^"]*">Next date with changes<\/button>/,
    );
    const inert = render({ next: null });
    expect(inert).toMatch(
      /<button type="button" aria-disabled="true" class="[^"]*text-m-ink-off[^"]*">Next date with changes<\/button>/,
    );
  });

  it("has its live region from the first paint, empty", () => {
    expect(render()).toContain('<p role="status" class="sr-only"></p>');
  });

  it("draws the visible word as the field's label only when given", () => {
    expect(render()).not.toContain("<label");
    const html = render({
      labels: {
        before: "The day before",
        after: "The day after",
        today: "Today",
        next: "Next date with changes",
        field: "Day, as year, month and day",
        day: "Day",
      },
    });
    expect(html).toMatch(/<label for="[^"]+" class="text-m-label text-m-ink">Day<\/label>/);
  });
});
