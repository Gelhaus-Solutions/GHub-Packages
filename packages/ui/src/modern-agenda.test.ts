/**
 * Agenda's markup contract: an ordered list that keeps its list role, a day
 * block whose date is a `time` element carrying the full instant, the distance
 * outside that element, and a sentence rather than an empty list.
 *
 * It has no keyboard of its own (its links are the caller's), so there is no
 * interaction file.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Agenda, type AgendaItem } from "./modern/agenda.js";

const ITEMS: AgendaItem[] = [
  {
    at: "2026-10-08T00:00:00+02:00",
    day: "Thu 8 Oct",
    time: "00:00 CEST",
    distance: "in 5 days",
    children: createElement("a", { href: "/rollouts/2026-10-08" }, "What changes on 8 Oct"),
  },
  {
    at: "2026-11-20T00:00:00+01:00",
    day: "Fri 20 Nov",
    time: "00:00 CET",
    children: createElement(
      "p",
      null,
      "Accounts that have not accepted by then become restricted.",
    ),
  },
];

function render(items: readonly AgendaItem[] = ITEMS): string {
  return renderToStaticMarkup(
    createElement(Agenda, {
      items,
      label: "Coming up",
      empty: "Nothing is announced or comes into force before 2 Dec 2026.",
    }),
  );
}

describe("Agenda", () => {
  it("is a named ordered list that keeps its list role under list-style: none", () => {
    const html = render();
    expect(html).toMatch(/^<ol role="list" aria-label="Coming up"/);
    expect(html.match(/<li[\s>]/g) ?? []).toHaveLength(2);
  });

  it("puts each row on its own plate, the day block in a fixed column beside the content", () => {
    const li = /<li [^>]*>/.exec(render())?.[0] ?? "";
    for (const cls of [
      "bg-m-plate",
      "shadow-m-plate",
      "rounded-m-panel",
      "grid-cols-[104px_minmax(0,1fr)]",
    ]) {
      expect(li).toContain(cls);
    }
  });

  it("makes the date a time element carrying the full instant", () => {
    const html = render();
    expect(html).toContain('<time dateTime="2026-10-08T00:00:00+02:00" class="block">');
    expect(html).toMatch(/<time [^>]*><span class="[^"]*font-semibold[^"]*">Thu 8 Oct<\/span>/);
    expect(html).toMatch(/<span class="[^"]*font-mono[^"]*">00:00 CEST<\/span><\/time>/);
  });

  it("keeps the distance outside the time element, in quiet meta, and leaves it out when absent", () => {
    const html = render();
    expect(html).toContain('</time><p class="text-m-meta text-m-ink-3">in 5 days</p>');
    expect(html.match(/in \d+ days/g) ?? []).toHaveLength(1);
  });

  it("lays the caller's content out in a column that may shrink", () => {
    expect(render()).toContain(
      '<div class="flex min-w-0 flex-col gap-2"><a href="/rollouts/2026-10-08">What changes on 8 Oct</a></div>',
    );
  });

  it("says so in a sentence, never an empty list, when nothing is coming", () => {
    const html = render([]);
    expect(html).toBe(
      '<p class="text-m-body text-m-ink-3">Nothing is announced or comes into force before 2 Dec 2026.</p>',
    );
  });

  it("takes no focus of its own", () => {
    expect(render()).not.toMatch(/tabindex|<button/i);
  });
});
