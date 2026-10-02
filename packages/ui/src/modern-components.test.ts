/**
 * What modern's components have to hold, rendered rather than reasoned about.
 *
 * Sheet 22 gives each component a contract alongside its numbers, and the
 * contract half is the part a screenshot cannot check: which element is the
 * `h1`, what is optional, what must never truncate. Those are mechanical and so
 * they are asserted here.
 *
 * Rendered through `renderToStaticMarkup` because this package tests in a node
 * environment with no jsdom and no testing-library. That is enough for a
 * contract about structure and classes, and it is honest about what it cannot
 * see: nothing here observes focus, hover or anything a pointer does.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import * as modern from "./modern/index.js";
import {
  Banner,
  Card,
  Consequence,
  Disclosure,
  FormField,
  type Column,
  Input,
  Money,
  PageHead,
  Pagination,
  Provenance,
  RecordRow,
  Refusal,
  Section,
  Status,
  SummaryPair,
  Table,
  Tabs,
} from "./modern/index.js";

function render(node: ReactNode): string {
  return renderToStaticMarkup(node as never);
}

describe("PageHead", () => {
  it("makes the title the only h1 on the screen", () => {
    const html = render(
      createElement(PageHead, { eyebrow: "Account", title: "Where you are signed in" }),
    );
    expect(html.match(/<h1[\s>]/g) ?? []).toHaveLength(1);
    expect(html).toContain("Where you are signed in");
  });

  it("puts the eyebrow outside the heading, so it is not part of the page's name", () => {
    /*
     * The eyebrow repeats the rail group for somebody who arrived from a link.
     * Inside the `h1` it would become part of the screen's accessible name and
     * every screen in a group would announce the group first.
     */
    const html = render(createElement(PageHead, { eyebrow: "Account", title: "Sessions" }));
    const heading = /<h1[^>]*>(.*?)<\/h1>/s.exec(html)?.[1] ?? "";
    expect(heading).toContain("Sessions");
    expect(heading).not.toContain("Account");
  });

  it("renders no eyebrow, lede or action element when none is given", () => {
    const html = render(createElement(PageHead, { title: "Recovery codes" }));
    expect(html.match(/<p[\s>]/g) ?? []).toHaveLength(0);
    expect(html.match(/<div[\s>]/g) ?? []).toHaveLength(1);
  });

  it("holds the lede to the prose measure rather than the content width", () => {
    const html = render(
      createElement(PageHead, { title: "Sessions", lede: "Ending one signs that browser out." }),
    );
    expect(html).toContain("max-w-m-prose");
  });

  it("never truncates the title", () => {
    /*
     * The contract says a long title wraps to two lines and never truncates. A
     * record name is the one thing on a screen that must not be cut off: an
     * ellipsis in a heading is how a customer cannot tell two records apart.
     */
    const html = render(
      createElement(PageHead, { title: "A deployment name that runs well past the measure" }),
    );
    const heading = /<h1[^>]*class="([^"]*)"/.exec(html)?.[1] ?? "";
    expect(heading).not.toMatch(/truncate|text-ellipsis|line-clamp/);
  });

  it("keeps the action out of the prose measure", () => {
    const html = render(
      createElement(PageHead, {
        title: "Sessions",
        lede: "One sentence.",
        action: createElement("button", { type: "button" }, "End all others"),
      }),
    );
    const measured = /<p[^>]*max-w-m-prose[^>]*>.*?<\/p>/s.exec(html)?.[0] ?? "";
    expect(measured).not.toContain("<button");
    expect(html).toContain("End all others");
  });
});

describe("RecordRow", () => {
  it("never makes the whole row a link", () => {
    /*
     * A row-wide click target pulls the name, the meta and the status into the
     * link's accessible name, so the row is announced as one long string and
     * the meta line, which exists to be skimmed, becomes something a person has
     * to listen through. The action is the link; the row is not.
     */
    const html = render(
      createElement(RecordRow, {
        name: "Chrome on macOS",
        meta: "Hamburg, last used 14:02",
        action: createElement("a", { href: "/sessions/1" }, "End it"),
      }),
    );
    /*
     * Asserted POSITIVELY, because the first version of this could not fail.
     * It read the outer tag with /^<div[^>]*>/ and checked the match held no
     * href; when the mutation turned the row into an <a> the regex matched
     * nothing, the match defaulted to "", and "" contains no href either. The
     * check passed precisely when the thing it forbids had happened.
     */
    const outer = /^<(\w+)([^>]*)>/.exec(html);
    expect(outer?.[1]).toBe("div");
    expect(outer?.[2] ?? "").not.toContain("href");
    expect(html).toContain('href="/sessions/1"');
  });

  it("carries the full name even though the visible text is truncated", () => {
    /*
     * The visible string is cut by an ellipsis, so the whole name has to reach
     * assistive technology another way or the tail is lost for exactly the
     * people who cannot see that it was cut.
     */
    const full = "Mandantenportal der Kesseler Rechtsanwaltsgesellschaft mbH und Partner";
    const html = render(createElement(RecordRow, { name: full }));
    expect(html).toContain(`title="${full}"`);
    expect(html).toContain("truncate");
  });

  it("shows no status element when nothing is wrong", () => {
    /*
     * A column of dots that are all fine trains the eye to skip the column,
     * which is the one column the eye must not skip.
     */
    const without = render(createElement(RecordRow, { name: "Chrome on macOS" }));
    const withStatus = render(
      createElement(RecordRow, {
        name: "Chrome on macOS",
        status: createElement("span", null, "Signed in"),
      }),
    );
    expect(withStatus.match(/<div[\s>]/g) ?? []).toHaveLength(
      (without.match(/<div[\s>]/g) ?? []).length + 1,
    );
  });

  it("offers a hover film only when there is something to press", () => {
    const inert = render(createElement(RecordRow, { name: "Chrome on macOS" }));
    const pressable = render(
      createElement(RecordRow, {
        name: "Chrome on macOS",
        action: createElement("button", { type: "button" }, "End it"),
      }),
    );
    expect(inert).not.toContain("hover:bg-m-hover");
    expect(pressable).toContain("hover:bg-m-hover");
  });

  it("lets the name give way rather than the status or the action", () => {
    /*
     * At 390 the row still has to work. A truncated name is recognisable and a
     * truncated verb is not, so the name is the only slot allowed to shrink.
     */
    const html = render(
      createElement(RecordRow, {
        name: "Chrome on macOS",
        status: createElement("span", null, "Signed in"),
        action: createElement("button", { type: "button" }, "End it"),
      }),
    );
    expect(html.match(/shrink-0/g) ?? []).toHaveLength(2);
  });
});

describe("Money", () => {
  it("takes the divisor from the currency and never from 100", () => {
    /*
     * The trap the component exists for. JPY has no minor unit and KWD has
     * three, so a hardcoded /100 prints a hundredth of a yen bill and a tenth
     * of a dinar one. Both are wrong in a direction nobody notices on a EUR
     * invoice, which is every invoice anyone tests with.
     */
    expect(
      render(createElement(Money, { minorUnits: 128520, currency: "EUR", locale: "en-US" })),
    ).toContain("1,285.20");
    expect(
      render(createElement(Money, { minorUnits: 128520, currency: "JPY", locale: "en-US" })),
    ).toContain("128,520");
    expect(
      render(createElement(Money, { minorUnits: 128520, currency: "KWD", locale: "en-US" })),
    ).toContain("128.520");
  });

  it("formats separators by the locale it is given", () => {
    const us = render(
      createElement(Money, { minorUnits: 108000, currency: "EUR", locale: "en-US" }),
    );
    const de = render(
      createElement(Money, { minorUnits: 108000, currency: "EUR", locale: "de-DE" }),
    );
    expect(us).toContain("1,080.00");
    expect(de).toContain("1.080,00");
  });

  it("names the currency on a total and omits it on a line item", () => {
    /*
     * A column of figures each repeating EUR is a column nobody can scan, and a
     * total with no currency is a number somebody has to go and look up.
     */
    const line = render(
      createElement(Money, { minorUnits: 108000, currency: "EUR", locale: "en-US" }),
    );
    const total = render(
      createElement(Money, { minorUnits: 128520, currency: "EUR", locale: "en-US", total: true }),
    );
    expect(line).not.toContain("EUR");
    expect(total).toContain("EUR");
  });

  it("is always mono with tabular figures", () => {
    /*
     * Proportional digits make a column ragged, and a column a person compares
     * down is the only reason to set money in mono at all.
     */
    const html = render(
      createElement(Money, { minorUnits: 100, currency: "EUR", locale: "en-US" }),
    );
    expect(html).toContain("font-mono");
    expect(html).toContain("tabular-nums");
  });
});

describe("SummaryPair", () => {
  it("renders a real description pair", () => {
    const html = render(createElement(SummaryPair, { label: "Standing", value: "Owner" }));
    expect(html).toMatch(/<dt[^>]*>Standing<\/dt>/);
    expect(html).toMatch(/<dd[^>]*>Owner<\/dd>/);
  });

  it("prints a sentence when the value is absent, never a dash", () => {
    /*
     * A dash cannot distinguish "we have no address for you" from "this does
     * not apply to you" from a rendering bug, and those want three different
     * responses from the reader.
     */
    const html = render(
      createElement(SummaryPair, {
        label: "Billing address",
        emptyText: "You have not added one.",
      }),
    );
    expect(html).toContain("You have not added one.");
    expect(html).not.toMatch(/<dd[^>]*>\s*[-\u2013\u2014]\s*<\/dd>/);
  });

  it("does not set an absent value in mono even when asked", () => {
    /*
     * `mono` describes the VALUE, and the empty sentence is not one: it is
     * prose, and prose in tabular mono reads as data that failed to load.
     */
    const html = render(
      createElement(SummaryPair, { label: "Identity", mono: true, emptyText: "Not issued yet." }),
    );
    expect(html).not.toContain("font-mono");
  });

  it("sets an identifier in mono when asked", () => {
    const html = render(
      createElement(SummaryPair, { label: "Identity", value: "4f2ac91b8e77", mono: true }),
    );
    expect(html).toContain("font-mono");
  });
});

describe("FormField", () => {
  const input = (c: {
    id: string;
    "aria-describedby": string | undefined;
    "aria-invalid": true | undefined;
  }) => createElement("input", { ...c, type: "text" });

  it("ties the label to the control it labels", () => {
    const html = render(createElement(FormField, { label: "Email address", children: input }));
    const forId = /<label[^>]*for="([^"]*)"/.exec(html)?.[1];
    const controlId = /<input[^>]*id="([^"]*)"/.exec(html)?.[1];
    expect(forId).toBeDefined();
    expect(controlId).toBe(forId);
  });

  it("replaces the hint with the error rather than showing both", () => {
    /*
     * Both at once gives a person two sentences about the same box, one of
     * which is now wrong, and the wrong one is the calm one they are likelier
     * to believe.
     */
    const html = render(
      createElement(FormField, {
        label: "New password",
        hint: "We send a code here.",
        error: "Too short by six characters",
        children: input,
      }),
    );
    expect(html).toContain("Too short by six characters");
    expect(html).not.toContain("We send a code here.");
  });

  it("marks invalid only when refused", () => {
    const resting = render(createElement(FormField, { label: "Email", children: input }));
    const refused = render(
      createElement(FormField, { label: "Email", error: "Add the domain", children: input }),
    );
    // `aria-invalid="false"` is noise, so the attribute is absent when resting.
    expect(resting).not.toContain("aria-invalid");
    expect(refused).toContain('aria-invalid="true"');
  });

  it("points describedby at ids that actually exist", () => {
    /*
     * The failure this catches is a describedby naming an element that was
     * never rendered, which is silent: the attribute is present, it looks
     * wired, and the control describes nothing.
     */
    const html = render(
      createElement(FormField, {
        label: "New password",
        error: "Too short by six characters",
        rules: [
          { text: "At least twelve characters", met: false },
          { text: "Not one of the ten thousand most common", met: true },
        ],
        children: input,
      }),
    );
    const described = /<input[^>]*aria-describedby="([^"]*)"/.exec(html)?.[1];
    expect(described).toBeDefined();
    const ids = (described as string).split(" ");
    expect(ids).toHaveLength(2);
    for (const id of ids) expect(html).toContain(`id="${id}"`);
  });

  it("carries every describer in one attribute", () => {
    /*
     * A control with several describers needs them space-separated in ONE
     * attribute. A second aria-describedby silently replaces the first.
     */
    const html = render(
      createElement(FormField, {
        label: "New password",
        hint: "Twelve characters or more.",
        rules: [{ text: "At least twelve characters", met: false }],
        children: input,
      }),
    );
    expect(html.match(/aria-describedby=/g) ?? []).toHaveLength(1);
  });

  it("makes the rules a described target and never a live region", () => {
    /*
     * A list that announces on every keystroke talks over the person typing.
     */
    const html = render(
      createElement(FormField, {
        label: "New password",
        rules: [{ text: "At least twelve characters", met: false }],
        children: input,
      }),
    );
    expect(html).not.toContain("aria-live");
    expect(html).not.toContain('role="status"');
  });

  it("never shows a rule dot without its words", () => {
    /*
     * A dot alone puts the whole meaning in a colour: forbidden by the colour
     * rule, and received by nobody using a screen reader. The dot is decoration
     * and says so.
     */
    const html = render(
      createElement(FormField, {
        label: "New password",
        rules: [
          { text: "At least twelve characters", met: false },
          { text: "Not one of the ten thousand most common", met: true },
        ],
        children: input,
      }),
    );
    expect(html).toContain("At least twelve characters");
    expect(html).toContain("Not one of the ten thousand most common");
    expect(html.match(/aria-hidden="true"/g) ?? []).toHaveLength(2);
  });
});

describe("Banner", () => {
  it("offers no way to dismiss it", () => {
    /*
     * The condition is what removes it. A dismissable banner lets somebody
     * clear a card failure from their screen without clearing it from their
     * account, and the next thing they see is the product switching off.
     */
    const html = render(
      createElement(Banner, {
        title: "A card payment failed on 2 September",
        tone: "warn",
        children: "Products keep working until 16 September.",
      }),
    );
    // Anchored positively first: every assertion below is a `not`, and a `not`
    // over an empty string passes. Prove the banner rendered before proving
    // what it did not render.
    expect(html).toContain("A card payment failed on 2 September");
    expect(html).not.toContain("<button");
    expect(html).not.toMatch(/aria-label="[^"]*(?:[Dd]ismiss|[Cc]lose)/);
  });

  it("is polite when it is part of the screen and an alert when it arrives", () => {
    /*
     * `alert` interrupts. A banner already on the screen must not: announcing
     * it politely lets a reader finish the sentence they were on. One that
     * arrives afterwards is news, and news reached at the reader's own pace
     * arrives after the decision it was meant to inform.
     */
    const atLoad = render(createElement(Banner, { title: "T", children: "S" }));
    const arrived = render(createElement(Banner, { title: "T", children: "S", afterLoad: true }));
    expect(atLoad).toContain('role="status"');
    expect(arrived).toContain('role="alert"');
  });

  it("never sets its sentence in quiet ink, because a wash moves the floor", () => {
    /*
     * ink-3 is the floor against a surface and does not clear it against a
     * wash, where it measures 4.04 on warn. Sheet 21 states the rule and this
     * is the component that would break it first.
     */
    const html = render(createElement(Banner, { title: "T", tone: "warn", children: "S" }));
    expect(html).toContain("bg-m-warn-wash");
    expect(html).toContain("S");
    expect(html).not.toContain("text-m-ink-3");
  });
});

describe("Disclosure", () => {
  const open = (isOpen: boolean) =>
    createElement(Disclosure, {
      label: "Withdraw support access",
      open: isOpen,
      onOpenChange: () => undefined,
      children: createElement("input", { type: "text", defaultValue: "a note" }),
    });

  it("ties the trigger to the panel it controls", () => {
    const html = render(open(true));
    const controls = /aria-controls="([^"]*)"/.exec(html)?.[1];
    expect(controls).toBeDefined();
    expect(html).toContain(`id="${controls as string}"`);
  });

  it("says whether it is open", () => {
    expect(render(open(false))).toContain('aria-expanded="false"');
    expect(render(open(true))).toContain('aria-expanded="true"');
  });

  it("keeps the panel mounted when closed, so nothing typed is lost", () => {
    /*
     * The failure that makes a person stop trusting the control: they type a
     * note, close the block, reopen it and the note is gone. `hidden` keeps the
     * DOM node and its value while taking it out of the accessibility tree.
     */
    const html = render(open(false));
    expect(html).toContain("<input");
    expect(html).toContain("hidden");
  });

  it("draws no scrim, because a block that needs one is an Overlay", () => {
    /*
     * The whole boundary between the two components. A scrim says "deal with me
     * first" and a disclosure is the next part of the thing already being read.
     */
    const html = render(open(true));
    // Same reason as the banner above: anchor the negative.
    expect(html).toContain("Withdraw support access");
    expect(html).not.toMatch(/fixed inset-0|bg-black\/|backdrop/);
  });
});

describe("Card", () => {
  it("draws a plate", () => {
    const html = render(createElement(Card, { children: "Recovery codes" }));
    expect(html).toContain("bg-m-plate");
    expect(html).toContain("rounded-m-card");
  });

  it("flattens when nested rather than drawing a second plate", () => {
    /*
     * A nested card is a visual mistake. Flattening keeps the layout right and
     * never crashes a page, where throwing would turn a styling error into an
     * outage. It matters because a card is exactly the thing somebody drops
     * into a slot without knowing what is already there.
     */
    const nested = render(
      createElement(Card, { children: createElement(Card, { children: "Inner" }) }),
    );
    expect(nested).toContain("Inner");
    expect(nested.match(/bg-m-plate/g) ?? []).toHaveLength(1);
  });
});

describe("Section", () => {
  it("renders an h2, under the page head's h1", () => {
    const html = render(createElement(Section, { heading: "Addresses", children: "rows" }));
    expect(html).toMatch(/<h2[^>]*>Addresses<\/h2>/);
    expect(html).not.toContain("<h1");
  });

  it("groups without decorating", () => {
    /*
     * No wash, no icon, no accent: the three ways a section starts competing
     * with the thing inside it for attention.
     */
    const html = render(createElement(Section, { heading: "Addresses", children: "rows" }));
    expect(html).toContain("Addresses");
    expect(html).not.toMatch(/-wash|text-m-accent|bg-m-accent/);
  });

  it("sets an optional count in mono and omits it when absent", () => {
    const with2 = render(createElement(Section, { heading: "Addresses", count: 2, children: "r" }));
    const without = render(createElement(Section, { heading: "Addresses", children: "r" }));
    expect(with2).toContain("font-mono");
    expect(without).not.toContain("font-mono");
  });
});

describe("Status", () => {
  it("always shows the word, never the colour alone", () => {
    /*
     * A bare coloured dot is unreadable to anybody who cannot separate the
     * hues, invisible to a screen reader, and meaningless in a screenshot
     * pasted into a ticket. The word is a required prop for that reason.
     */
    const html = render(createElement(Status, { level: "crit", children: "Payment failed" }));
    expect(html).toContain("Payment failed");
  });

  it("hides the dot from assistive technology", () => {
    /*
     * The word beside it already carries the state. Two elements saying one
     * thing is how a list of eight statuses becomes sixteen things to hear.
     */
    const html = render(createElement(Status, { level: "ok", children: "Verified" }));
    expect(html.match(/aria-hidden="true"/g) ?? []).toHaveLength(1);
  });

  it("uses the ink for the word and the graphic colour for the dot", () => {
    /*
     * Different bars: the ink is read and owes 4.5, the dot is a graphic and
     * owes 3. They are separate tokens for that reason and not by accident.
     */
    const html = render(createElement(Status, { level: "warn", children: "Expires in 3 days" }));
    /*
     * Matched as WHOLE CLASS TOKENS. `toContain("bg-m-warn")` passed a mutation
     * that pointed the dot at `bg-m-warn-ink`, because the correct name is a
     * prefix of the wrong one. A substring check cannot tell a token from a
     * token that starts the same way, which is most of this palette.
     */
    const classes = new Set(
      Array.from(html.matchAll(/class="([^"]*)"/g)).flatMap((m) => (m[1] as string).split(/\s+/)),
    );
    expect(classes).toContain("text-m-warn-ink");
    expect(classes).toContain("bg-m-warn");
    expect(classes).not.toContain("bg-m-warn-ink");
  });

  it("takes a wash only as a chip", () => {
    const inline = render(createElement(Status, { level: "ok", children: "Verified" }));
    const chip = render(createElement(Status, { level: "ok", children: "Verified", chip: true }));
    expect(inline).not.toContain("bg-m-ok-wash");
    expect(chip).toContain("bg-m-ok-wash");
  });
});

describe("Refusal", () => {
  it("always renders all three parts", () => {
    /*
     * Title and reason alone leave somebody informed and stuck, which is the
     * state that produces a ticket saying only "it will not let me". `next` is
     * required by the type, so a screen cannot ship the two-part version by
     * omission.
     */
    const html = render(
      createElement(Refusal, {
        title: "This asks for a password, and your account has none",
        reason: "You sign in with a passkey, which this check cannot ask for yet.",
        next: "Write to us and a member of staff will take you through it.",
      }),
    );
    expect(html).toContain("This asks for a password");
    expect(html).toContain("which this check cannot ask for yet");
    expect(html).toContain("Write to us");
  });

  it("sits on a plate rather than a wash", () => {
    /*
     * A refusal is usually not an emergency and a washed panel says it is.
     * Severity is a 3px rule down the side: enough to find, not enough to
     * shout.
     */
    const html = render(
      createElement(Refusal, { title: "T", reason: "R", next: "N", severity: "crit" }),
    );
    const classes = new Set(
      Array.from(html.matchAll(/class="([^"]*)"/g)).flatMap((m) => (m[1] as string).split(/\s+/)),
    );
    expect(classes).toContain("bg-m-plate");
    expect(classes).toContain("border-l-m-crit");
    expect([...classes].filter((c) => c.endsWith("-wash"))).toEqual([]);
  });
});

describe("Tabs", () => {
  const link = (p: {
    href: string;
    className: string;
    "aria-current": "page" | undefined;
    children: ReactNode;
  }) =>
    createElement(
      "a",
      { href: p.href, className: p.className, "aria-current": p["aria-current"] },
      p.children,
    );

  const three = [
    { href: "/members", label: "Members", current: true },
    { href: "/invitations", label: "Invitations" },
    { href: "/products", label: "Products" },
  ];

  it("renders real links and never a tablist", () => {
    /*
     * The ARIA tabs pattern describes a widget whose panels are swapped by
     * script, with arrow keys and one tab stop. These are navigation.
     * Announcing them as a tablist promises keyboard behaviour that is not
     * there.
     */
    const html = render(createElement(Tabs, { tabs: three, renderLink: link, label: "Sections" }));
    expect(html.match(/<a /g) ?? []).toHaveLength(3);
    expect(html).not.toContain('role="tab"');
    expect(html).not.toContain('role="tablist"');
  });

  it("marks the current tab for assistive technology, not only in colour", () => {
    const html = render(createElement(Tabs, { tabs: three, renderLink: link, label: "Sections" }));
    expect(html.match(/aria-current="page"/g) ?? []).toHaveLength(1);
  });

  it("gives every tab a 2px edge so the row does not shift when the selection moves", () => {
    /*
     * The underline is 2px of accent on the current one and 2px of nothing on
     * the rest. Applying the border only to the current tab moves every other
     * label by two pixels when somebody navigates.
     */
    const html = render(createElement(Tabs, { tabs: three, renderLink: link, label: "Sections" }));
    expect(html.match(/border-b-2/g) ?? []).toHaveLength(3);
    expect(html.match(/border-transparent/g) ?? []).toHaveLength(2);
  });

  it("names the set for somebody moving by landmark", () => {
    const html = render(createElement(Tabs, { tabs: three, renderLink: link, label: "Sections" }));
    expect(html).toMatch(/<nav[^>]*aria-label="Sections"/);
  });
});

describe("Table", () => {
  interface Person {
    id: string;
    name: string;
    sessions: number;
  }
  const rows: Person[] = [
    { id: "a", name: "Theresa Mahr", sessions: 8 },
    { id: "b", name: "Jonas Weidner", sessions: 1 },
  ];
  /*
   * Annotated `Column<Person>[]` rather than inferred, and that is the fix for
   * a typecheck I broke on main.
   *
   * Inferred, the array's element type is a union of the two object LITERALS,
   * neither of which mentions `sort` or `onSort`, so `Partial<...>` of it
   * rejects both as unknown properties and the sortable cases could not be
   * expressed at all. Annotating makes the element type the real one, which is
   * the type the component actually accepts.
   */
  const columns: Column<Person>[] = [
    { key: "name", header: "Identity", cell: (r) => r.name },
    { key: "sessions", header: "Sessions", cell: (r) => r.sessions, numeric: true },
  ];

  /** Replaces the first column, so a case can make it sortable. */
  const table = (extra?: Partial<Column<Person>>) => {
    const [first, second] = columns as [Column<Person>, Column<Person>];
    return createElement(Table<Person>, {
      columns: extra === undefined ? columns : [{ ...first, ...extra }, second],
      rows,
      rowKey: (r: Person) => r.id,
      caption: "People in this organisation",
    });
  };

  it("is a real table with scoped column headers", () => {
    const html = render(table());
    expect(html).toContain("<table");
    expect(html.match(/<th[^>]*scope="col"/g) ?? []).toHaveLength(2);
  });

  it("names itself for somebody moving between tables", () => {
    /*
     * A table with no caption is announced only as "table", which in a list of
     * three is no help. Visually hidden rather than absent.
     */
    const html = render(table());
    expect(html).toMatch(/<caption[^>]*class="[^"]*sr-only/);
    expect(html).toContain("People in this organisation");
  });

  it("allows mono only in the cells that asked for it", () => {
    /*
     * Inside a data cell is the only place on a modern screen where mono is
     * allowed, and only for an identifier, a date, a figure or money. A name is
     * not one of those.
     */
    const html = render(table());
    expect(html.match(/font-mono/g) ?? []).toHaveLength(rows.length);
  });

  it("says which column is ordering the rows, not only which has a chevron", () => {
    const unsorted = render(table());
    const sorted = render(table({ sort: "ascending", onSort: () => undefined }));
    expect(unsorted).not.toContain("aria-sort");
    expect(sorted).toContain('aria-sort="ascending"');
  });

  it("makes a sortable header a real button", () => {
    const html = render(table({ onSort: () => undefined }));
    expect(html).toMatch(/<th[^>]*>\s*<button type="button"/);
  });

  it("scrolls rather than dropping a column", () => {
    /*
     * A column removed at a narrow width is data a person cannot reach and has
     * no way to know was there. A scrollbar is worse looking and strictly more
     * honest.
     */
    const html = render(table());
    expect(html).toContain("overflow-x-auto");
  });
});

describe("Input", () => {
  it("is 44 tall by default, the height a thumb can hit", () => {
    const html = render(createElement(Input, { type: "text" }));
    const classes = new Set(
      Array.from(html.matchAll(/class="([^"]*)"/g)).flatMap((m) => (m[1] as string).split(/\s+/)),
    );
    expect(classes).toContain("h-11");
    expect(classes).not.toContain("h-9");
  });

  it("offers 36 and nothing smaller", () => {
    /*
     * Console's 32 is an instrument density and is not in modern. The type
     * refuses it: `height` is 44 | 36, so a third value is a compile error
     * rather than a review comment.
     */
    const html = render(createElement(Input, { type: "text", height: 36 }));
    const classes = new Set(
      Array.from(html.matchAll(/class="([^"]*)"/g)).flatMap((m) => (m[1] as string).split(/\s+/)),
    );
    expect(classes).toContain("h-9");
    expect(classes).not.toContain("h-8");
  });

  it("reads as a well rather than a plate", () => {
    const html = render(createElement(Input, { type: "text" }));
    expect(html).toContain("bg-m-inset");
    expect(html).toContain("shadow-m-inset");
  });

  it("sets mono only when asked", () => {
    expect(render(createElement(Input, { type: "text" }))).not.toContain("font-mono");
    expect(render(createElement(Input, { type: "text", mono: true }))).toContain("font-mono");
  });
});

describe("Consequence", () => {
  const lines = [
    { level: "idle" as const, text: "Your address and your name stay as they are." },
    { level: "crit" as const, text: "Eight sessions end, including this one." },
    { level: "warn" as const, text: "The ten recovery codes stop working." },
  ];

  it("puts the worst first whatever order the caller passed", () => {
    /*
     * Sorted here rather than trusted from the array, so a screen cannot bury
     * the destructive line under two reassuring ones by listing them in
     * whatever order the code produced.
     */
    const html = render(createElement(Consequence, { lines }));
    const order = ["Eight sessions end", "recovery codes stop working", "stay as they are"];
    const at = order.map((text) => html.indexOf(text));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("keeps the line about what does not change, and puts it last", () => {
    /*
     * That line is usually the reason somebody goes through with a safe action
     * rather than abandoning it. A list of only losses reads as a warning to
     * stop.
     */
    const html = render(createElement(Consequence, { lines }));
    expect(html).toContain("stay as they are");
    expect(html.indexOf("stay as they are")).toBeGreaterThan(html.indexOf("Eight sessions end"));
  });

  it("sits inside the thing it warns about, with no heading and no card", () => {
    const html = render(createElement(Consequence, { lines }));
    expect(html).toContain("Eight sessions end");
    expect(html).not.toMatch(/<h[1-6]|bg-m-plate|rounded-m-card/);
  });

  it("hides every dot and keeps every sentence", () => {
    const html = render(createElement(Consequence, { lines }));
    expect(html.match(/aria-hidden="true"/g) ?? []).toHaveLength(lines.length);
  });
});

describe("Pagination", () => {
  const pager = (onBack?: () => void, onNext?: () => void) =>
    createElement(Pagination, {
      summary: "Showing 1 to 25 of 214",
      backLabel: "Back",
      nextLabel: "Next",
      ...(onBack === undefined ? {} : { onBack }),
      ...(onNext === undefined ? {} : { onNext }),
    });

  it("shows a range and a total rather than a page count", () => {
    /*
     * "Page 3 of 9" asks somebody to multiply to find where they are in 214
     * records. The range tells them.
     */
    const html = render(
      pager(
        () => undefined,
        () => undefined,
      ),
    );
    expect(html).toContain("Showing 1 to 25 of 214");
    expect(html).not.toMatch(/Page \d+ of \d+/);
  });

  it("gives an inactive button no material at all", () => {
    /*
     * Inactive is expressed as nothing raised, not as grey ink on something
     * that still looks pressable. That version is the one people keep clicking.
     */
    const active = render(
      pager(
        () => undefined,
        () => undefined,
      ),
    );
    const inert = render(pager());
    expect(active).toContain("bg-m-plate");
    expect(inert).not.toContain("bg-m-plate");
    expect(inert).not.toContain("shadow-m-quiet");
    expect((inert.match(/disabled/g) ?? []).length).toBeGreaterThan(0);
  });

  it("renders exactly two buttons", () => {
    const html = render(
      pager(
        () => undefined,
        () => undefined,
      ),
    );
    expect(html.match(/<button/g) ?? []).toHaveLength(2);
  });
});

describe("Provenance", () => {
  it("formats nothing and sets only the time in mono", () => {
    /*
     * A date format is a locale decision and this package has no locale. Money
     * takes one and formats, because there is a single correct rendering of an
     * amount given a locale; there is no equivalent for a timestamp, where
     * absolute against relative is a product decision per screen.
     */
    const html = render(
      createElement(Provenance, {
        actor: "Theresa Mahr",
        action: "Password changed by",
        at: "3 Sep 2026, 14:02",
      }),
    );
    expect(html).toContain("Password changed by");
    expect(html).toContain("Theresa Mahr");
    expect(html).toMatch(/<time[^>]*class="[^"]*font-mono[^"]*"[^>]*>3 Sep 2026, 14:02<\/time>/);
  });

  it("does not set the actor in mono", () => {
    /*
     * A name is a word being read, not a figure being lined up.
     */
    const html = render(
      createElement(Provenance, { actor: "Theresa Mahr", action: "Signed in by", at: "14:02" }),
    );
    const mono = /<time[^>]*>.*?<\/time>/s.exec(html)?.[0] ?? "";
    expect(mono).toContain("14:02");
    expect(mono).not.toContain("Theresa Mahr");
  });
});

describe("the pin covers every modern component", () => {
  /**
   * The footprint question, and it lives here rather than in
   * `console-characterisation.test.ts` for a reason worth writing down.
   *
   * That gate reads the whole source tree and keeps a bare-NAME registry of
   * components the ROOT barrel cannot reach, and every component under
   * `modern/` is deliberately off that barrel, because `dist/index.js` is
   * hardlinked into three GPlatform trees and must not move. So modern is
   * skipped there and asked about here, against its own barrel instead.
   *
   * Console's `Field` and modern's `FormField` no longer share a name, so the
   * name-keyed registry could now tell them apart. It is still the wrong place
   * to ask: being off the root barrel is the intended state for all of modern
   * and an exemption list saying so for every component would assert nothing.
   *
   * Without this, a component added under `modern/` and never exported or
   * never exercised is invisible to both suites: every assertion above still
   * passes and the new thing is pinned by nothing.
   */
  const HERE = dirname(fileURLToPath(import.meta.url));

  function declaredInModern(): string[] {
    const dir = join(HERE, "modern");
    const found: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".tsx")) continue;
      for (const match of readFileSync(join(dir, entry.name), "utf8").matchAll(
        /^export function ([A-Z][A-Za-z0-9]*)/gmu,
      )) {
        found.push(match[1] as string);
      }
    }
    return found.sort();
  }

  /** Every component this file actually renders. Kept by hand, on purpose. */
  const EXERCISED = [
    "AsOf",
    "Banner",
    "BilingualReader",
    "Button",
    "Card",
    "Consequence",
    "Disclosure",
    "FormField",
    "Hash",
    "Input",
    "MailPreview",
    "Money",
    "PageHead",
    "Pagination",
    "Provenance",
    "RecordRow",
    "Refusal",
    "ReorderList",
    "Section",
    "Standing",
    "Status",
    "SummaryPair",
    "Table",
    "Tabs",
    "TypedConfirmation",
    "ZonedDateTime",
    "ZonedDateTimeInput",
  ] as const;

  it("found the components at all", () => {
    // A walk that finds nothing would make every assertion below vacuous.
    expect(declaredInModern().length).toBeGreaterThanOrEqual(17);
  });

  it("exports every component the directory declares", () => {
    const exported = new Set(
      Object.entries(modern)
        .filter(([name, value]) => /^[A-Z]/u.test(name) && typeof value === "function")
        .map(([name]) => name),
    );
    expect(declaredInModern().filter((name) => !exported.has(name))).toEqual([]);
  });

  it("renders every component it exports", () => {
    const exercised = new Set<string>(EXERCISED);
    expect(declaredInModern().filter((name) => !exercised.has(name))).toEqual([]);
  });

  it("keeps no entry for a component that has gone", () => {
    const declared = new Set(declaredInModern());
    expect(EXERCISED.filter((name) => !declared.has(name))).toEqual([]);
  });
});

describe("modern reaches for no console utility", () => {
  /*
   * The two languages disagree about what `sunken`, `overlay`, `inset`,
   * `accent` and every status level are worth, which is why modern's Tailwind
   * utilities carry the `m-` prefix. A modern component that reached for
   * `text-fg` or `bg-raised` would render in console's palette wherever both
   * sheets are loaded, and look correct in isolation: the class exists, the
   * colour resolves, and it is the wrong language.
   *
   * Asserted on rendered output rather than on the source, so a class arriving
   * through `cn`, a variant or a default prop is caught the same way a literal
   * one is.
   */
  const CONSOLE_ONLY =
    /\b(?:bg|text|border|ring|fill|stroke|shadow|from|to|via)-(?:fg|sunken|base|raised|overlay|inset|hairline|subtle|strong|accent|ok|warn|crit|info|idle|locked)\b(?!-m\b)/;

  it("renders no console colour utility in PageHead", () => {
    const html = render(
      createElement(PageHead, {
        eyebrow: "Account",
        title: "Where you are signed in",
        lede: "Ending one signs that browser out.",
        action: createElement("button", { type: "button" }, "End all others"),
      }),
    );
    const classes = Array.from(html.matchAll(/class="([^"]*)"/g), (m) => m[1] as string);
    const offenders = classes.flatMap((c) => c.split(/\s+/).filter((u) => CONSOLE_ONLY.test(u)));
    expect(offenders).toEqual([]);
  });

  it("renders no console colour utility in RecordRow", () => {
    const html = render(
      createElement(RecordRow, {
        name: "Chrome on macOS",
        chip: createElement("span", null, "This browser"),
        meta: "Hamburg, last used 14:02",
        status: createElement("span", null, "Signed in"),
        action: createElement("button", { type: "button" }, "End it"),
      }),
    );
    const classes = Array.from(html.matchAll(/class="([^"]*)"/g), (m) => m[1] as string);
    const offenders = classes.flatMap((c) => c.split(/\s+/).filter((u) => CONSOLE_ONLY.test(u)));
    expect(offenders).toEqual([]);
  });
});
