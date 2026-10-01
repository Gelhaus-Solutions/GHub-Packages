/**
 * What console renders today, pinned, so that it cannot change by accident.
 *
 * **This exists because of a decision rather than a defect.** This package is
 * growing a second design language: `console` keeps GControl and GPlatform
 * Control exactly as they are, and `modern` is a complete redesign for
 * GPlatform SSO and GPlatform Billing. "Console remains as-is" is a promise
 * somebody has to keep on every commit, and a promise nothing can falsify is a
 * hope. This is the thing that goes red.
 *
 * It is a characterisation test and not a specification: it asserts what the
 * markup *is*, not what it ought to be. Nothing here says the current output is
 * good. It says that changing it is a decision somebody took on purpose, which
 * is the only property that matters while a second language is being built
 * beside it.
 *
 * **Updating the snapshot is allowed and is the point.** A real console change
 * should update it, in the same commit, with the diff visible in review. What
 * must never happen is `vitest -u` run to make a red go away without reading
 * what moved.
 *
 * **This is also the first test in this package that has ever rendered a
 * component.** Every suite here before it tested a behaviour module with no
 * markup in it, and that was not a choice: `tsconfig.json` extends the react
 * config, which sets `jsx: "preserve"`, so vite could not parse the first
 * `.tsx` it was handed and failed with "content contains invalid JS syntax".
 * Thirty-nine component files, no test able to load one, and nothing saying so,
 * because the failure only appears when somebody tries. `vitest.config.ts`
 * carries the one line that fixes it and the reason.
 *
 * **The count is not what the file listing suggests.** There are thirty-nine
 * `.tsx` files and seventy-three exported components, because several files
 * publish a family: the table alone is eleven, the panel four, the nav three.
 * A fixture map keyed by file would have covered a third of the surface while
 * looking complete.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as ui from "./index.js";

/**
 * The clock, frozen, or this suite rots instead of failing.
 *
 * Several components render a time relative to now: `MeterPanel` prints "last
 * 2 minutes ago" through a helper whose second argument defaults to
 * `Date.now()`, and the countdown does the same. Pinned against a live clock,
 * their snapshots would drift on their own and somebody would learn to run
 * `vitest -u` to clear a red that means nothing, which is the habit that makes
 * the whole gate worthless on the day it catches something real.
 */
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
});

afterAll(() => {
  vi.useRealTimers();
});

/**
 * Props offered to every component, from which each takes what it recognises.
 *
 * A generic bag rather than a hand-written fixture per component, because
 * sixty-one of the seventy-three render from it unchanged, and a hand-written
 * one for each would be seventy-three more things to keep true. Every value is
 * fixed: a date at the epoch rather than `new Date()`, so the snapshot pins the
 * markup rather than the hour it was taken.
 */
const BAG: Record<string, unknown> = {
  children: "child",
  label: "Label",
  title: "Title",
  description: "Description",
  name: "Name",
  value: "value",
  href: "/x",
  id: "id",
  ariaLabel: "Aria",
  items: [],
  rows: [],
  columns: [],
  options: [],
  data: [],
  series: [],
  count: 1,
  total: 3,
  page: 1,
  pageSize: 10,
  step: 1,
  steps: [],
  status: "ok",
  tone: "ok",
  variant: "secondary",
  size: "md",
  open: false,
  checked: false,
  disabled: false,
  loading: false,
  active: false,
  onChange: () => {},
  onClick: () => {},
  onSelect: () => {},
  onClose: () => {},
  date: new Date(0),
  at: new Date(0),
  until: new Date(0),
};

/** Marks a key to be removed from the bag rather than overridden. */
const OMIT = Symbol("omit");

/**
 * The twelve that need a real shape, and what each one is.
 *
 * Three of them are not shapes at all: `input`, `textarea` and the checkbox are
 * void or value-bearing elements that React refuses to give children, and the
 * bag hands children to everything. Dropping the key is the fixture.
 */
const OVERRIDES: Readonly<Record<string, Record<string, unknown>>> = {
  /*
    `tone` is in the bag as "ok", which is a Status and not one of this
    component's three. It indexes a lookup and reads `.title` off undefined, so
    the failure names a property rather than the prop. Worth the note: an
    absence is idle, locked or warn, and deliberately never ok or crit.
  */
  Absence: { title: "Nothing here", tone: "idle" },
  /*
    The five below take their copy as REQUIRED props now, because a design
    system has no locale and both consoles that render these do. The bag cannot
    supply them: two are functions taking the numbers the component worked out,
    and a bag of strings renders "copy is undefined" rather than a panel.
  */
  GeneratedForm: {
    schema: { type: "object", properties: {} },
    values: {},
    submitLabel: "Save",
    copy: {
      noSettings: "This app declares no settings.",
      lockNote: (requires: string) => `Needs ${requires}.`,
    },
  },
  SigningProvenance: {
    provider: "vault",
    copy: {
      fileTitle: "Signed from a key file",
      vaultTitle: "Signed in vault",
      fileDetail: "The signing key sits on disk rather than in the vault.",
      vaultDetail: "The signing key never leaves the vault.",
    },
  },
  /*
    Pagination's copy is REQUIRED props now, so the bag cannot supply it: two of
    the five are functions taking the counts the component works out, and a bag
    of strings renders "summaryLabel is not a function" rather than a pager.
    Fixtures rather than the old defaults, because the defaults were the bug:
    English living in a package that has no locale, rendered by both consoles.

    The `total`, `limit` and `offset` here are new too, and the reason is in the
    snapshot this replaces: it read "Showing NaN to NaN of 3 rows" and "Page NaN
    of NaN". The bag carried `total: 3` and neither of the other two, so every
    derived number was NaN and the pin recorded it. Nothing caught that, because
    the only other assertion is that the markup is non-empty, and NaN is not
    empty. A fixture that renders a component wrong pins it wrong.
  */
  Pagination: {
    total: 120,
    limit: 50,
    offset: 50,
    summaryLabel: ({ from, to, total }: { from: number; to: number; total: number }) =>
      `Showing ${from} to ${to} of ${total} rows`,
    pageLabel: ({ page, pages }: { page: number; pages: number }) => `Page ${page} of ${pages}`,
    emptyLabel: "No rows",
    previousLabel: "Previous",
    nextLabel: "Next",
  },
  /*
    The five overlays below render nothing at all while closed, which is correct
    and is why the bag's `open: false` produced empty markup for each. Opened
    here on purpose: a pin of five empty strings would match a package where
    every one of them had been deleted.
  */
  Dialog: { open: true },
  Sheet: { open: true },
  Popover: { open: true },
  Menu: { open: true },
  ChangeList: {
    gains: ["Something gained"],
    losses: ["Something lost"],
  },
  Checkbox: { children: OMIT },
  Input: { children: OMIT },
  Textarea: { children: OMIT },
  FactStrip: { facts: [{ label: "Label", value: "Value" }] },
  Timeline: { events: [{ stage: "done", title: "It happened", when: "just now" }] },
  HealthPanel: {
    readings: [
      {
        key: "k",
        label: "Label",
        type: "gauge",
        display: "number",
        unit: null,
        description: null,
        value: 1,
        severity: "ok",
        series: [1, 2, 3],
      },
    ],
    emptyTitle: "Nothing declared",
    emptyDescription: "Health is opt-in.",
    notReported: "not reported",
    declaredAbsent: "Declared in the manifest, absent from the last beat.",
  },
  LevelMap: {
    levels: [{ kind: "Customer", label: "A customer", count: 1 }],
    slots: 1,
  },
  MeterPanel: {
    meters: [
      {
        key: "k",
        label: "Label",
        unit: "calls",
        aggregation: "sum",
        description: null,
        today: 1,
        period: 7,
        series: [1, 2, 3],
        days: 3,
        lastAt: new Date(0),
      },
    ],
    emptyTitle: "Nothing declared",
    emptyDescription: "Metering is opt-in.",
    copy: {
      footnote: "Counted across every deployment.",
      nothingReported: "nothing reported yet",
      today: "today ·",
      last: "· last",
      periodLabel: ({ days, aggregation }: { days: number; aggregation: string }) =>
        aggregation === "sum" ? `${days} day total` : `${days} day peak`,
    },
  },
  ProviderGrid: {
    providers: [{ id: "p", label: "A provider" }],
    onChoose: () => {},
    moreLabel: (hidden: number) => `${String(hidden)} more`,
  },
  Sparkline: { values: [1, 2, 3] },
  NavItem: {
    render: ({ className, children }: { className?: string; children?: ReactNode }) =>
      createElement("a", { className, href: "/x" }, children),
  },
};

/**
 * Components deliberately not rendered, each with the reason.
 *
 * Empty, and it is a real category rather than a formality: something needing a
 * browser, a portal target or a parent's context legitimately cannot be
 * server-rendered alone, and the footprint assertion below demands that such a
 * thing be named here rather than quietly dropping out of the count.
 */
const EXEMPT: Readonly<Record<string, string>> = {
  /*
    The four overlays, and this is a gap rather than a tidy category.

    Each of them ends `if (!open || typeof document === "undefined") return null`
    and then calls `createPortal`. Under `environment: "node"` there is no
    document, so all four return null by design and a pin of them would be a pin
    of four empty strings: it would match a package in which every one of them
    had been deleted, which is the worst thing a gate can do.

    They are also the four with the most behaviour in them. Focus trapping,
    restore-on-close, escape handling and the scroll lock all live here, and
    they are exactly the components a redesign is most likely to disturb.

    **And nothing else covered them either, which this exemption originally
    implied without checking.** The obvious answer to "these four are not
    pinned" is that the axe sweep audits them on the gallery, and it did not:
    that sweep runs on every push and audits the page AS LOADED, and all four
    sit behind `useState(false)` with nothing clicking them, so none of them was
    ever in the DOM while it ran. Two mechanisms, a different blind spot each,
    and between them they covered every component in this package EXCEPT the
    four carrying the focus trap, `aria-modal`, the escape handler and focus
    return.

    Opening them found a real one: `Menu` put a `role="none"` wrapper between
    `role="menu"` and the element a person clicks, which axe reports as
    `aria-required-children` at critical in both themes, since fixed. An
    exemption is a claim that something is covered somewhere else, and this one
    was not true when it was written.

    Closing it needs a DOM, and no package in this repository has one: there is
    no happy-dom or jsdom installed anywhere and every vitest config is
    `environment: "node"`. The fix is a second file carrying a per-file
    environment directive naming a DOM implementation, so the other suites keep
    their node environment, and it is a dependency decision rather than
    something to add in passing.

    Do not write that directive out in full anywhere in this file. Vitest scans
    the source for it rather than parsing it, so spelling it inside a comment
    explaining the future fix switched the environment on for real: the whole
    file failed to start with "Cannot find package 'happy-dom'" and reported
    "Tests no tests", which is the shape that reads as harmless.
  */
  Dialog: "portals, and returns null without a document; needs a DOM environment to pin",
  Sheet: "portals, and returns null without a document; needs a DOM environment to pin",
  Popover: "portals, and returns null without a document; needs a DOM environment to pin",
  Menu: "portals, and returns null without a document; needs a DOM environment to pin",
};

/**
 * Components the barrel deliberately does not re-export, with the reason.
 *
 * Anything that appears here is a component this pin cannot see, which is a
 * fact worth having to write down rather than discover. The panel bridge used
 * to be the first entry; it is GControl's protocol rather than part of a design
 * system, and it left this package when the package left GControl.
 */
const OFF_BARREL: Readonly<Record<string, string>> = {
  /*
   * Modern is a second design language, not an addition to this one, and it is
   * held off the barrel by the hardlink rather than by taste.
   *
   * `dist/index.js` is one inode shared with three GPlatform trees, so adding
   * an export here rebuilds it into all three the moment anybody builds, while
   * the FILE it points at reaches only whichever of them last ran an install.
   * The other two then fail at build on a path inside
   * `node_modules/.pnpm/@ghub+ui@file+..`, which reads as a corrupt
   * install rather than a stale copy. Behind its own subpath, `dist/index.js`
   * does not change at all and console's consumers are untouched.
   *
   * These are pinned by `modern-components.test.ts` instead, which asserts the
   * contracts sheet 22 states rather than a snapshot: which element is the
   * `h1`, what is optional, and that no console utility is reached for.
   */
};

/**
 * Every capitalised component declared anywhere in the source tree.
 *
 * The footprint question, and the reason it is asked against the FILES rather
 * than against the barrel: everything else in this suite starts from what
 * `index.ts` exports, so it can only ever ask about a component that is already
 * reachable. A component file added and never re-exported is invisible to all
 * of it, every snapshot still matches, and the floor still clears. Reading the
 * tree is what makes "the barrel is complete" falsifiable.
 */
function declaredComponents(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        /*
         * `modern/` is a second design language behind `@ghub/ui/modern`,
         * not an addition to this one, and this gate is console's: its name
         * says so and its snapshots are console's markup.
         *
         * Skipped rather than listed in OFF_BARREL, because every component
         * under `modern/` is deliberately off the root barrel: `dist/index.js`
         * is hardlinked into three GPlatform trees and must not move, so this
         * gate would flag every one of them and OFF_BARREL would grow a
         * permanent list that distinguishes nothing.
         *
         * THE NAMES NO LONGER COLLIDE, and that is not a reason to remove this
         * skip. Console's `Field` is a read-only label over a value, the
         * workhorse of a detail screen; modern's form control is `FormField`,
         * and modern's equivalent of console's `Field` is `SummaryPair`. The
         * collision used to be a second reason to skip this directory. It has
         * been resolved, the barrel reason has not, and only one of the two
         * was ever the durable one.
         *
         * The footprint question modern needs is asked in
         * `modern-components.test.ts`, against its own barrel.
         */
        if (entry.name === "modern") continue;
        walk(path);
        continue;
      }
      if (!entry.name.endsWith(".tsx")) continue;
      for (const match of readFileSync(path, "utf8").matchAll(
        /^export (?:function|const) ([A-Z][A-Za-z0-9]*)/gmu,
      )) {
        const name = match[1] as string;
        /*
          A constant is not a component, and the two are only told apart by
          case. `CONTROL_SIZES` and `NOT_FOUND` match the pattern above and stop
          at the underscore, so they arrived here as "CONTROL" and "NOT" and
          were reported as components the barrel could not reach. Requiring a
          lowercase letter is what separates PascalCase from SCREAMING_SNAKE.
        */
        if (!/[a-z]/u.test(name)) continue;
        found.push(name);
      }
    }
  };
  walk(here);
  return [...new Set(found)].sort();
}

/** Every export that is a component: a capitalised function, or a `forwardRef`. */
function componentNames(): string[] {
  return Object.entries(ui)
    .filter(([name, value]) => {
      if (!/^[A-Z]/u.test(name)) return false;
      if (typeof value === "function") return true;
      return typeof value === "object" && value !== null && "$$typeof" in value;
    })
    .map(([name]) => name)
    .sort();
}

function propsFor(name: string): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...BAG, ...(OVERRIDES[name] ?? {}) };
  for (const [key, value] of Object.entries(merged)) {
    if (value === OMIT) delete merged[key];
  }
  return merged;
}

function render(name: string, extra: Record<string, unknown> = {}): string {
  const component = (ui as Record<string, unknown>)[name];
  const props = { ...propsFor(name), ...extra };
  return renderToStaticMarkup(createElement(component as never, props as never) as ReactNode);
}

/**
 * The axes a component's appearance varies along, and the values of each.
 *
 * **This list is the difference between a pin and a decoration, and it was
 * added after the pin was proved not to work.** The first version rendered each
 * component once, with one set of props, which meant it pinned the default
 * state and nothing else. `variant="primary"` was never rendered by anything,
 * so the filled accent button, the one control on every screen that a redesign
 * is most likely to touch, could be changed freely with seventy-five tests
 * passing. Measured: adding a marker class to the `primary` arm of
 * `button-variants.ts` moved nothing.
 *
 * Applied one axis at a time rather than as a cross product. The product of
 * these is thousands of renders per component and the extra pairs pin almost
 * nothing new, because these properties are read independently: a component
 * that draws `variant` and `size` from separate lookups cannot disagree with
 * itself about their combination.
 */
const AXES: Readonly<Record<string, readonly unknown[]>> = {
  variant: ["primary", "secondary", "ghost", "danger"],
  size: ["sm", "md", "lg", "xl"],
  status: ["ok", "warn", "crit", "idle", "locked"],
  tone: ["ok", "warn", "crit", "idle", "locked"],
  severity: ["ok", "warn", "crit", "idle"],
  active: [true],
  disabled: [true],
  loading: [true],
  collapsed: [true],
  onWash: [true],
  live: [true],
};

/**
 * Everything one component draws, as the base render plus each axis that
 * changes it.
 *
 * Only the axes that actually move the markup are kept. Most components ignore
 * most of these, and recording "variant=ghost is identical to the base" for
 * sixty-nine components would bury the handful of real differences in a file
 * nobody could read a diff of.
 */
type Drawn = { base: string } & Record<string, string>;

function profile(name: string): Drawn {
  const out: Drawn = { base: render(name) };
  const { base } = out;
  for (const [prop, values] of Object.entries(AXES)) {
    for (const value of values) {
      let html: string;
      try {
        html = render(name, { [prop]: value });
      } catch {
        // A value this component rejects is not a state it has. The base render
        // above is what proves the component works at all.
        continue;
      }
      if (html !== base) out[`${prop}=${String(value)}`] = html;
    }
  }
  return out;
}

describe("the console components, pinned", () => {
  for (const name of componentNames()) {
    if (EXEMPT[name] !== undefined) continue;
    it(name, () => {
      const drawn = profile(name);
      /*
        Per component, because a snapshot of the whole set agreeing is also what
        a harness that rendered one component seventy-three times would produce.
        This asserts that THIS component produced markup, which is the question
        a total cannot answer.
      */
      expect(drawn.base.length, `${name} rendered nothing`).toBeGreaterThan(0);
      expect(drawn).toMatchSnapshot();
    });
  }
});

describe("the pin covers what the package actually publishes", () => {
  /**
   * The footprint question, which the three assertions above cannot answer.
   *
   * Each of them describes what the harness *found*. None of them notices a
   * component the harness never opened, and a component added to the barrel
   * tomorrow is exactly that: every snapshot still matches, the count still
   * clears its floor, and the new thing is pinned by nothing. This is the
   * assertion that makes the coverage falsifiable, and it is here because a
   * sibling gate in this same package scanned one directory of two for months
   * while being correct about everything it read.
   */
  it("reaches every component declared in the source tree", () => {
    const declared = declaredComponents();
    const reachable = new Set(componentNames());
    const invisible = declared.filter(
      (name) => !reachable.has(name) && OFF_BARREL[name] === undefined,
    );

    expect(invisible).toEqual([]);
  });

  it("keeps no off-barrel note for a component that is now reachable", () => {
    const reachable = new Set(componentNames());
    expect(Object.keys(OFF_BARREL).filter((name) => reachable.has(name))).toEqual([]);
  });

  it("keeps no exemption for a component that has gone", () => {
    const live = new Set(componentNames());
    expect(Object.keys(EXEMPT).filter((name) => !live.has(name))).toEqual([]);
  });

  it("keeps no fixture for a component that has gone", () => {
    const live = new Set(componentNames());
    expect(Object.keys(OVERRIDES).filter((name) => !live.has(name))).toEqual([]);
  });

  /**
   * The floor, which proves the enumeration is alive.
   *
   * Deliberately the weakest of these and stated as such: an empty export list
   * would satisfy every assertion above, because "none missing" is true of
   * nothing at all.
   */
  it("found the components at all", () => {
    expect(componentNames().length).toBeGreaterThan(60);
  });

  /**
   * That the fixtures are doing work rather than the bag defeating everything.
   *
   * If a component quietly started rendering an empty shell, its snapshot would
   * change and this would not fire. What this catches is the other shape: a
   * harness where most components collapse to the same trivial output, which is
   * what a broken transform or a wrong element type produces, and which reads
   * as seventy-three healthy passes.
   */
  it("renders components that differ from one another", () => {
    const rendered = componentNames()
      .filter((name) => EXEMPT[name] === undefined)
      .map((name) => render(name));
    const distinct = new Set(rendered);
    expect(distinct.size).toBeGreaterThan(rendered.length / 2);
  });
});
