// @vitest-environment jsdom

/**
 * `<gp-apps>` against sheet 31's contract, observed in a document: off renders
 * nothing, focus opens on the current product, each tile is named with its
 * state, the arrows move in two dimensions and between the groups, Tab from
 * the last group and Escape close and give focus back, and a list that swaps
 * in underneath keeps the focus where it was.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ChromeCore, ChromeState } from "../core.js";
import type { ChromeTile, ChromeView } from "../types.js";
import { defineAppsElement, moveInGrid } from "./apps.js";

interface Apps extends HTMLElement {
  core: ChromeCore | null;
  open: boolean;
  show(): void;
  close(returnFocus: boolean): void;
}

const tile = (slug: string, displayName: string, current = false): ChromeTile => ({
  slug,
  displayName,
  homeUrl: `https://${slug}.example.test/`,
  iconUrl: `https://identity.example.test/api/v1/assets/${slug}`,
  current,
});

const VIEW: ChromeView = {
  person: { hasIdentity: true, avatarUrl: null, tint: null },
  yours: [
    tile("gadvisory", "GAdvisory", true),
    tile("ganalytics", "GAnalytics"),
    tile("gboarse", "GBoarse"),
    tile("gegroups", "GeGroups"),
    tile("danalytics", "DAnalytics"),
  ],
  more: [tile("gopencsr", "GOpenCSR"), tile("gopencdr", "GOpenCDR"), tile("gvet", "GVet")],
  identity: null,
  legal: null,
};

/** A core whose state the test sets, with the subscription the element relies on. */
function fakeCore(initial: Partial<ChromeState>) {
  let state: ChromeState = {
    status: "ready",
    view: VIEW,
    updatedAt: Date.now(),
    error: null,
    ...initial,
  };
  const listeners = new Set<(next: ChromeState) => void>();
  const load = vi.fn(async () => state);
  const core: ChromeCore = {
    state: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load,
    clear: () => undefined,
    dispose: () => undefined,
  };
  return {
    core,
    load,
    set(next: Partial<ChromeState>) {
      state = { ...state, ...next };
      for (const listener of listeners) listener(state);
    },
  };
}

function mount(core: ChromeCore): Apps {
  const apps = document.createElement("gp-apps") as Apps;
  apps.core = core;
  document.body.append(apps);
  return apps;
}

const root = (apps: Apps) => apps.shadowRoot as ShadowRoot;
const trigger = (apps: Apps) => root(apps).querySelector("button.trigger") as HTMLButtonElement;
const focused = (apps: Apps) => root(apps).activeElement as HTMLElement | null;
const press = (apps: Apps, key: string, shiftKey = false) =>
  focused(apps)?.dispatchEvent(
    new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, composed: true }),
  );

beforeAll(() => {
  defineAppsElement();
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("moveInGrid", () => {
  it("moves in two dimensions and never wraps a row", () => {
    expect(moveInGrid(0, 5, 3, "ArrowRight")).toBe(1);
    expect(moveInGrid(2, 5, 3, "ArrowRight")).toBe(2);
    expect(moveInGrid(3, 5, 3, "ArrowLeft")).toBe(3);
    expect(moveInGrid(1, 5, 3, "ArrowDown")).toBe(4);
    expect(moveInGrid(2, 5, 3, "ArrowDown")).toBe("below");
    expect(moveInGrid(1, 5, 3, "ArrowUp")).toBe("above");
    expect(moveInGrid(4, 5, 3, "Home")).toBe(0);
    expect(moveInGrid(0, 5, 3, "End")).toBe(4);
    expect(moveInGrid(0, 5, 3, "Enter")).toBeNull();
  });
});

describe("<gp-apps>", () => {
  it("renders nothing and asks nobody when it is off", () => {
    const { core, load } = fakeCore({ status: "off", view: null, updatedAt: null });
    const apps = mount(core);
    expect(apps.hidden).toBe(true);
    trigger(apps).click();
    expect(apps.open).toBe(false);
    expect(load).not.toHaveBeenCalled();
  });

  it("is a button named Products that opens a dialog on the current product", () => {
    const { core } = fakeCore({});
    const apps = mount(core);
    const button = trigger(apps);
    expect(button.getAttribute("aria-label")).toBe("Products");
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");

    button.click();
    const dialog = root(apps).querySelector('[role="dialog"]') as HTMLElement;
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(dialog.hidden).toBe(false);
    expect(dialog.getAttribute("aria-modal")).toBeNull();
    expect(focused(apps)?.getAttribute("aria-label")).toBe("GAdvisory, you are here");
    expect(focused(apps)?.getAttribute("aria-current")).toBe("page");
  });

  it("names each tile with its state, and invitations as open to join", () => {
    const { core } = fakeCore({});
    const apps = mount(core);
    apps.show();
    const names = [...root(apps).querySelectorAll("a.tile")].map((one) =>
      one.getAttribute("aria-label"),
    );
    expect(names).toEqual([
      "GAdvisory, you are here",
      "GAnalytics",
      "GBoarse",
      "GeGroups",
      "DAnalytics",
      "GOpenCSR, open to join",
      "GOpenCDR, open to join",
      "GVet, open to join",
    ]);
    expect(root(apps).querySelectorAll('a.tile[data-group="more"] .plus')).toHaveLength(3);
  });

  it("keeps one tab stop per group and moves with the arrows, between the groups too", () => {
    const { core } = fakeCore({});
    const apps = mount(core);
    apps.show();
    expect(root(apps).querySelectorAll('a.tile[tabindex="0"]')).toHaveLength(2);

    press(apps, "ArrowRight");
    expect(focused(apps)?.dataset["slug"]).toBe("ganalytics");
    press(apps, "ArrowDown");
    expect(focused(apps)?.dataset["slug"]).toBe("danalytics");
    // Down from the last row of the first group: the same column of the second.
    press(apps, "ArrowDown");
    expect(focused(apps)?.dataset["slug"]).toBe("gopencdr");
    press(apps, "ArrowUp");
    expect(focused(apps)?.dataset["slug"]).toBe("danalytics");
    press(apps, "End");
    expect(focused(apps)?.dataset["slug"]).toBe("danalytics");
    press(apps, "Home");
    expect(focused(apps)?.dataset["slug"]).toBe("gadvisory");
  });

  it("closes on Tab from the last group and on Escape, and gives focus back to the trigger", () => {
    const { core } = fakeCore({});
    const apps = mount(core);
    apps.show();
    press(apps, "ArrowDown");
    press(apps, "ArrowDown");
    expect(focused(apps)?.dataset["group"]).toBe("more");
    press(apps, "Tab");
    expect(apps.open).toBe(false);
    expect(focused(apps)).toBe(trigger(apps));

    apps.show();
    press(apps, "Escape");
    expect(apps.open).toBe(false);
    expect(focused(apps)).toBe(trigger(apps));
  });

  it("keeps the focus on the same tile when a changed list swaps in", () => {
    const fake = fakeCore({});
    const apps = mount(fake.core);
    apps.show();
    press(apps, "ArrowRight");
    expect(focused(apps)?.dataset["slug"]).toBe("ganalytics");

    fake.set({ view: { ...VIEW, yours: [tile("gvet", "GVet"), ...VIEW.yours] } });
    expect(focused(apps)?.dataset["slug"]).toBe("ganalytics");
    expect(root(apps).querySelectorAll('a.tile[data-group="yours"]')).toHaveLength(6);
  });

  it("draws a skeleton only on a first visit, and one sentence and a button when nothing loads", () => {
    const first = fakeCore({ status: "loading", view: null, updatedAt: null });
    const apps = mount(first.core);
    apps.show();
    expect(root(apps).querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(root(apps).querySelectorAll(".skeleton")).toHaveLength(6);

    first.set({ status: "error", view: null, error: "network" });
    expect(root(apps).querySelector('[role="alert"]')?.textContent).toContain(
      "The list could not be loaded.",
    );
    expect(root(apps).querySelector("a.tile")).toBeNull();
    (root(apps).querySelector(".pill") as HTMLButtonElement).click();
    expect(first.load).toHaveBeenCalled();
  });

  it("says a kept list is old, and says why an empty group is empty", () => {
    const fake = fakeCore({
      status: "stale",
      updatedAt: new Date("2026-10-17T14:02:00").getTime(),
    });
    const apps = mount(fake.core);
    apps.show();
    expect(root(apps).querySelector(".stale")?.textContent).toMatch(
      /Showing the list from .*(14|02).02/u,
    );

    fake.set({ status: "ready", view: { ...VIEW, yours: [] } });
    expect(root(apps).querySelector(".note")?.textContent).toBe(
      "Nothing here yet. Products you use appear here after you open them.",
    );
  });

  it("marks every tile as unreachable while the browser is offline, and keeps it focusable", () => {
    vi.stubGlobal("navigator", { ...navigator, onLine: false });
    const { core } = fakeCore({});
    const apps = mount(core);
    apps.show();
    const first = root(apps).querySelector("a.tile") as HTMLAnchorElement;
    expect(first.getAttribute("aria-disabled")).toBe("true");
    expect(first.getAttribute("aria-label")).toBe("GAdvisory, cannot be opened while offline");
    expect(focused(apps)).toBe(first);
  });

  it("takes a property set before it was defined", () => {
    const { core } = fakeCore({});
    const early = document.createElement("gp-apps-late") as Apps;
    early.core = core;
    document.body.append(early);
    defineAppsElement("gp-apps-late");
    expect(early.hidden).toBe(false);
  });
});
