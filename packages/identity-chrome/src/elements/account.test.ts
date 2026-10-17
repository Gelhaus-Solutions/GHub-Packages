// @vitest-environment jsdom

/**
 * `<gp-account>` against sheet 32's contract, observed in a document: nothing
 * renders without a person or while off, the trigger is named and its tooltip
 * goes on Escape alone, focus opens on the pill, the picture falls back from
 * Identity's to the product's to the coloured initial, the organisations are a
 * radiogroup that switches on Enter and never on an arrow, "Show all" opens the
 * rest in place, and signing out is busy in place and never claims success it
 * did not have.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ChromeCore, ChromeState } from "../core.js";
import { avatarTint } from "../tint.js";
import type { ChromeView } from "../types.js";
import { defineAccountElement, type AccountOrganisation } from "./account.js";
import { defineChromeElements, type AccountElement } from "./index.js";

const IDENTITY = {
  accountUrl: "https://identity.example.test/account",
  pictureUrl: "https://identity.example.test/account/profile",
  setupUrl: "https://identity.example.test/register?from=gadvisory",
  iconUrl: "https://identity.example.test/api/v1/catalogue/gplatform-identity/icon",
};

const VIEW: ChromeView = {
  person: { hasIdentity: true, avatarUrl: null, tint: 2 },
  yours: [
    {
      slug: "gadvisory",
      displayName: "GAdvisory",
      homeUrl: "https://gadvisory.example.test/",
      iconUrl: null,
      current: true,
    },
  ],
  more: [],
  identity: IDENTITY,
  legal: {
    termsUrl: "https://gplatform.org/terms",
    privacyUrl: "https://gplatform.org/datenschutz",
  },
};

const PERSON = { name: "Mira Kessler", email: "mira.kessler@example.test", id: "usr-42" };

const ORGS: AccountOrganisation[] = [
  { id: "org_2", name: "Nordlicht Security GmbH", role: "member", active: false },
  { id: "org_1", name: "Kessler Rechtsanwaelte", role: "owner", active: true },
  { id: "org_3", name: "Hafen Labs", role: "admin", active: false },
];

function fakeCore(initial: Partial<ChromeState> = {}) {
  let state: ChromeState = {
    status: "ready",
    view: VIEW,
    updatedAt: Date.now(),
    error: null,
    ...initial,
  };
  const listeners = new Set<(next: ChromeState) => void>();
  const clear = vi.fn();
  const core: ChromeCore = {
    state: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load: vi.fn(async () => state),
    clear,
    dispose: () => undefined,
  };
  return {
    core,
    clear,
    set(next: Partial<ChromeState>) {
      state = { ...state, ...next };
      for (const listener of listeners) listener(state);
    },
  };
}

function mount(setup: Partial<AccountElement> = {}, core = fakeCore().core): AccountElement {
  const account = document.createElement("gp-account");
  account.core = core;
  account.person = PERSON;
  account.product = "GAdvisory";
  Object.assign(account, setup);
  document.body.append(account);
  return account;
}

const root = (account: AccountElement) => account.shadowRoot as ShadowRoot;
const $ = <T extends Element = HTMLElement>(account: AccountElement, selector: string) =>
  root(account).querySelector<T & Element>(selector);
const trigger = (account: AccountElement) => $<HTMLButtonElement>(account, "button.trigger")!;
const focused = (account: AccountElement) => root(account).activeElement as HTMLElement | null;
const press = (account: AccountElement, key: string, shiftKey = false) =>
  focused(account)?.dispatchEvent(
    new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, composed: true }),
  );
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeAll(() => {
  defineChromeElements();
});

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("<gp-account>", () => {
  it("renders nothing while off, and nothing without a person", () => {
    const off = mount({}, fakeCore({ status: "off", view: null, updatedAt: null }).core);
    expect(off.hidden).toBe(true);
    const nobody = mount({ person: null });
    expect(nobody.hidden).toBe(true);
    trigger(nobody).click();
    expect(nobody.open).toBe(false);
  });

  it("is a button named for the person, with a tooltip that Escape takes away and nothing else", () => {
    vi.useFakeTimers();
    const account = mount();
    const button = trigger(account);
    expect(button.getAttribute("aria-label")).toBe("Account: Mira Kessler");
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");

    const outer = vi.fn();
    document.addEventListener("keydown", outer);
    button.focus();
    const tip = $(account, ".tip")!;
    expect(tip.hidden).toBe(true);
    vi.advanceTimersByTime(500);
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toBe("Account: Mira Kessler");

    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
    );
    expect(tip.hidden).toBe(true);
    expect(outer).not.toHaveBeenCalled();
    document.removeEventListener("keydown", outer);
  });

  it("opens a dialog named by the person and described by the address, on the pill", () => {
    const account = mount();
    trigger(account).click();
    const dialog = $(account, '[role="dialog"]')!;
    expect(account.open).toBe(true);
    expect(dialog.getAttribute("aria-modal")).toBeNull();
    expect($(account, `#${dialog.getAttribute("aria-labelledby") ?? ""}`)?.textContent).toBe(
      "Mira Kessler",
    );
    expect($(account, `#${dialog.getAttribute("aria-describedby") ?? ""}`)?.textContent).toBe(
      "mira.kessler@example.test",
    );
    expect($(account, ".context")?.textContent).toBe("Signed in to GAdvisory");
    expect(focused(account)?.textContent).toBe("Manage your Identity account");
    expect(focused(account)?.getAttribute("href")).toBe(IDENTITY.accountUrl);
    expect($(account, ".pencil")?.getAttribute("href")).toBe(IDENTITY.pictureUrl);
    expect($(account, ".pencil")?.getAttribute("aria-label")).toBe("Change your picture");
  });

  it("cuts the address in the middle so its domain survives", () => {
    const account = mount();
    account.show();
    expect($(account, ".email .local")?.textContent).toBe("mira.kessler");
    expect($(account, ".email .domain")?.textContent).toBe("@example.test");
  });

  it("invites somebody with no Identity to set one up, with no pencil", () => {
    const account = mount(
      {},
      fakeCore({ view: { ...VIEW, person: { hasIdentity: false, avatarUrl: null, tint: null } } })
        .core,
    );
    account.show();
    expect(focused(account)?.textContent).toBe("Set up your Identity");
    expect(focused(account)?.getAttribute("href")).toBe(IDENTITY.setupUrl);
    expect($(account, ".pencil")).toBeNull();
  });

  it("draws Identity's picture, else the product's, else the initial in the Identity's tint", () => {
    const withPicture = mount(
      { person: { ...PERSON, avatarUrl: "https://gadvisory.example.test/me.png" } },
      fakeCore({
        view: {
          ...VIEW,
          person: {
            hasIdentity: true,
            avatarUrl: "https://identity.example.test/a/1.png",
            tint: 2,
          },
        },
      }).core,
    );
    expect($(withPicture, ".trigger img")?.getAttribute("src")).toBe(
      "https://identity.example.test/a/1.png",
    );

    const productsOwn = mount(
      { person: { ...PERSON, avatarUrl: "/me.png" } },
      fakeCore({ view: { ...VIEW, person: { hasIdentity: false, avatarUrl: null, tint: null } } })
        .core,
    );
    expect($(productsOwn, ".trigger img")?.getAttribute("src")).toBe(
      new URL("/me.png", document.baseURI).href,
    );

    const initial = mount();
    const face = $(initial, ".trigger .avatar")!;
    expect(face.textContent).toBe("M");
    expect(face.classList.contains("t2")).toBe(true);

    const noIdentity = mount(
      {},
      fakeCore({ view: { ...VIEW, person: { hasIdentity: false, avatarUrl: null, tint: null } } })
        .core,
    );
    expect(
      $(noIdentity, ".trigger .avatar")?.classList.contains(`t${String(avatarTint("usr-42"))}`),
    ).toBe(true);
  });

  it("lists the organisations as a radiogroup, the active one first and the only tab stop", () => {
    const account = mount({ organisations: ORGS, onSwitch: vi.fn() });
    account.show();
    const group = $(account, '[role="radiogroup"]')!;
    expect($(account, `#${group.getAttribute("aria-labelledby") ?? ""}`)?.textContent).toBe(
      "Organisations",
    );
    const radios = [...group.querySelectorAll('[role="radio"]')];
    expect(radios.map((one) => one.getAttribute("aria-label"))).toEqual([
      "Kessler Rechtsanwaelte, Owner",
      "Nordlicht Security GmbH, Member",
      "Hafen Labs, Admin",
    ]);
    expect(radios.map((one) => one.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
      "false",
    ]);
    expect(group.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    expect(radios[0]?.textContent).toContain("Active");
  });

  it("moves with the arrows without switching, and switches on Enter, closing and saying so", async () => {
    const onSwitch = vi.fn(async () => undefined);
    const account = mount({ organisations: ORGS, onSwitch });
    account.show();
    ($(account, '[role="radio"][aria-checked="true"]') as HTMLElement).focus();
    press(account, "ArrowDown");
    expect(focused(account)?.dataset["id"]).toBe("org_2");
    expect(onSwitch).not.toHaveBeenCalled();

    press(account, "Enter");
    await settle();
    expect(onSwitch).toHaveBeenCalledWith("org_2");
    expect(account.open).toBe(false);
    expect(focused(account)).toBe(trigger(account));
    expect($(account, '[role="status"]')?.textContent).toBe("Switched to Nordlicht Security GmbH");
  });

  it("keeps the popup open and says so when a switch fails", async () => {
    const account = mount({
      organisations: ORGS,
      onSwitch: () => Promise.reject(new Error("no")),
    });
    account.show();
    ($(account, '[data-id="org_3"]') as HTMLElement).click();
    await settle();
    expect(account.open).toBe(true);
    expect($(account, '[role="alert"]')?.textContent).toBe(
      "Could not switch to Hafen Labs. Try again.",
    );
  });

  it("shows five, and Show all opens the rest in place with focus on the row in its spot", () => {
    const many = Array.from({ length: 14 }, (_, i) => ({
      id: `org_${String(i)}`,
      name: `Organisation ${String(i)}`,
      role: "member" as const,
      active: i === 0,
    }));
    const account = mount({ organisations: many, onSwitch: vi.fn() });
    account.show();
    expect(root(account).querySelectorAll('[role="radio"]')).toHaveLength(5);
    const more = $<HTMLButtonElement>(account, "button.more")!;
    expect(more.textContent).toBe("Show all 14");
    more.focus();
    more.click();
    expect(root(account).querySelectorAll('[role="radio"]')).toHaveLength(14);
    expect($(account, "button.more")).toBeNull();
    expect(focused(account)?.dataset["id"]).toBe("org_5");
  });

  it("draws no section when no organisations are passed", () => {
    const account = mount({ organisations: [] });
    account.show();
    expect($(account, '[role="radiogroup"]')).toBeNull();
  });

  it("goes busy in place while signing out, and forgets the kept list once it has", async () => {
    let finish: () => void = () => undefined;
    const fake = fakeCore();
    const account = mount(
      { onSignOut: () => new Promise<void>((resolve) => (finish = resolve)) },
      fake.core,
    );
    account.show();
    const row = () => $<HTMLButtonElement>(account, "button.signout")!;
    expect(row().textContent).toBe("Sign out of GAdvisory");
    row().focus();
    row().click();
    expect(row().getAttribute("aria-busy")).toBe("true");
    expect(row().textContent).toBe("Signing out of GAdvisory");
    expect(focused(account)).toBe(row());
    expect(fake.clear).not.toHaveBeenCalled();
    finish();
    await settle();
    expect(fake.clear).toHaveBeenCalled();
  });

  it("says the person is still signed in when signing out fails, and offers to try again", async () => {
    const onSignOut = vi.fn(() => Promise.reject(new Error("down")));
    const account = mount({ onSignOut });
    account.show();
    $<HTMLButtonElement>(account, "button.signout")!.click();
    await settle();
    expect(account.open).toBe(true);
    expect($(account, '[role="alert"]')?.textContent).toBe(
      "You are still signed in. GAdvisory did not answer. Try again, or close the browser to end this session.",
    );
    expect($(account, "button.signout")?.textContent).toBe("Try again");
  });

  it("says it signs out of Identity too where the product signs in through it", () => {
    const account = mount({ onSignOut: vi.fn(), viaIdentity: true });
    account.show();
    expect($(account, "button.signout")?.textContent).toBe("Sign out of GAdvisory and Identity");
  });

  it("ends the tab order on the footer: Tab from the last link closes and gives focus back", () => {
    const account = mount({ onSignOut: vi.fn() });
    account.show();
    const links = [...root(account).querySelectorAll<HTMLAnchorElement>(".legal a")];
    expect(links.map((one) => one.getAttribute("href"))).toEqual([
      "https://gplatform.org/terms",
      "https://gplatform.org/datenschutz",
    ]);
    links[1]?.focus();
    press(account, "Tab");
    expect(account.open).toBe(false);
    expect(focused(account)).toBe(trigger(account));

    account.show();
    press(account, "Escape");
    expect(account.open).toBe(false);
    expect(focused(account)).toBe(trigger(account));
  });

  it("still signs somebody out while Identity cannot be reached, without its links", () => {
    const account = mount(
      { onSignOut: vi.fn() },
      fakeCore({ status: "error", view: null, updatedAt: null }).core,
    );
    account.show();
    expect($(account, ".pill")).toBeNull();
    expect($(account, ".legal")).toBeNull();
    expect(focused(account)).toBe($(account, "button.signout"));
  });

  it("takes properties set before it was defined", () => {
    const early = document.createElement("gp-account-late") as AccountElement;
    early.core = fakeCore().core;
    early.person = PERSON;
    document.body.append(early);
    defineAccountElement("gp-account-late");
    expect(early.hidden).toBe(false);
    expect(early.shadowRoot?.querySelector("button.trigger")?.getAttribute("aria-label")).toBe(
      "Account: Mira Kessler",
    );
  });
});
