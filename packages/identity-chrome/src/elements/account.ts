/**
 * `<gp-account>`, the account popup (GPlatform Identity, sheet 32, option A).
 *
 * An avatar at the right end of a product's top bar and, under it, a card on a
 * tinted ground: who is signed in, where their Identity account is, which
 * organisation they are acting in, and how to sign out of this product and
 * only this product (D21).
 *
 * **Most of what it shows is the product's.** The name, the address, the
 * organisations and both actions are properties the product sets from its own
 * session. Identity adds the picture, the tint, its own two links and the
 * footer, through the same core as `<gp-apps>`, so the popup still signs
 * somebody out while Identity cannot be reached.
 *
 * **What it is to assistive technology:**
 *
 * - The trigger is a `button` with `aria-haspopup="dialog"`, named "Account:
 *   Mira Kessler", with the same words as a tooltip on hover and on focus after
 *   half a second, which Escape dismisses without closing anything else (1.4.13).
 * - The popup is a `dialog` labelled by the person's name and described by their
 *   address, not modal. Below 600 wide it is a modal sheet with a scrim and a
 *   contained focus loop, as the picker is.
 * - Focus opens on the pill (Manage your Identity account, or Set up your
 *   Identity), else the active organisation, else Sign out. The close button is
 *   a stop and never the first one.
 * - The organisations are a `radiogroup`, one tab stop, Up and Down moving
 *   between them. Choosing is Space or Enter and never an arrow, because
 *   choosing switches the product: it closes the popup and announces
 *   "Switched to ...". Five show; "Show all" opens the rest in place, scrolling
 *   inside, and focus lands on the row that took its place.
 * - Signing out goes busy in place. A failure keeps the popup open, says in one
 *   sentence that the person is still signed in, and turns the row into Try
 *   again. It never claims to have signed out.
 *
 * **Hidden for now (D20):** the other accounts and "Add another account" are
 * not drawn until Identity holds several sessions in one browser and products
 * sign in through it, and no product can switch them on.
 *
 * The words are English by default and every one can be replaced (`labels`).
 */

import type { ChromeCore } from "../core.js";
import { AVATAR_INK, AVATAR_TINTS, avatarTint } from "../tint.js";
import type { ChromeView } from "../types.js";
import { safeUrl } from "../validate.js";
import { CONTRACT_CSS } from "./contract.js";
import { crossMark, element, pathIcon } from "./dom.js";

export type OrganisationRole = "owner" | "admin" | "member";

/** Who is signed in, from the product's own session. */
export interface AccountPerson {
  name: string;
  email: string;
  /** The product's own stable id for this person: it picks the tint where they have no Identity. Never shown. */
  id?: string;
  /** The product's own picture, drawn where Identity has none. */
  avatarUrl?: string | null;
}

/** An organisation the person can act in, as the product or Identity passes it (D24, D33). */
export interface AccountOrganisation {
  id: string;
  name: string;
  role: OrganisationRole;
  active: boolean;
}

/** Signs the person out of this product. Rejecting means they are still signed in. */
export type SignOutHandler = () => unknown;
/** Switches the product to this organisation. Rejecting means it did not. */
export type SwitchHandler = (organisationId: string) => unknown;

export interface AccountLabels {
  /** The trigger's name and its tooltip. */
  trigger: (name: string) => string;
  signedInTo: (product: string) => string;
  close: string;
  changePicture: string;
  manage: string;
  setUp: string;
  organisations: string;
  roles: Record<OrganisationRole, string>;
  active: string;
  showAll: (count: number) => string;
  switched: (organisation: string) => string;
  switchFailed: (organisation: string) => string;
  signOut: (product: string) => string;
  /** In a product that signs in through Identity, where signing out ends both. */
  signOutBoth: (product: string) => string;
  signingOut: (product: string) => string;
  signOutFailed: (product: string) => string;
  retry: string;
  /** Stands in for the product's name where it was not given. */
  thisProduct: string;
  terms: string;
  privacy: string;
}

const sentence = (words: string) => `${words.charAt(0).toUpperCase()}${words.slice(1)}`;

export const ACCOUNT_LABELS: AccountLabels = {
  trigger: (name) => `Account: ${name}`,
  signedInTo: (product) => `Signed in to ${product}`,
  close: "Close",
  changePicture: "Change your picture",
  manage: "Manage your Identity account",
  setUp: "Set up your Identity",
  organisations: "Organisations",
  roles: { owner: "Owner", admin: "Admin", member: "Member" },
  active: "Active",
  showAll: (count) => `Show all ${String(count)}`,
  switched: (organisation) => `Switched to ${organisation}`,
  switchFailed: (organisation) => `Could not switch to ${organisation}. Try again.`,
  signOut: (product) => `Sign out of ${product}`,
  signOutBoth: (product) => `Sign out of ${product} and Identity`,
  signingOut: (product) => `Signing out of ${product}`,
  signOutFailed: (product) =>
    `You are still signed in. ${sentence(product)} did not answer. Try again, or close the browser to end this session.`,
  retry: "Try again",
  thisProduct: "this product",
  terms: "Terms of Service",
  privacy: "Privacy policy",
};

/** A view asked again on opening when it is older than this. */
const FRESH_MS = 60_000;
const SHEET_QUERY = "(max-width: 599px)";
/** The organisations shown before "Show all". */
const SHOWN = 5;
const TIP_DELAY_MS = 500;
/** Long enough to cross from the trigger to its tooltip without losing it. */
const TIP_LINGER_MS = 150;
const ROLES: readonly OrganisationRole[] = ["owner", "admin", "member"];

const tintRules = AVATAR_TINTS.map(
  (tint, index) => `.t${String(index)} { background: ${tint}; }`,
).join("\n  ");

export const ACCOUNT_CSS = `${CONTRACT_CSS}
  .trigger {
    width: 40px; height: 40px; padding: 0; margin: 0; border: 0; border-radius: 9999px;
    display: grid; place-items: center; background: transparent; color: inherit; cursor: pointer;
  }
  .trigger:hover { background: var(--_hover); }
  .trigger:active { background: var(--_active); }
  .trigger[aria-expanded="true"] { box-shadow: 0 0 0 2px var(--_accent); }
  .trigger:focus-visible { outline: 2px solid var(--_ring); outline-offset: 2px; }
  @media (pointer: coarse) { .trigger { box-sizing: content-box; padding: 2px; } }

  .avatar {
    position: relative; display: grid; place-items: center; flex-shrink: 0; overflow: hidden;
    border-radius: 9999px; color: ${AVATAR_INK}; font-weight: 600; line-height: 1;
  }
  .avatar img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .s32 { width: 32px; height: 32px; font-size: 14px; }
  .s72 { width: 72px; height: 72px; font-size: 30px; }
  ${tintRules}

  .tip {
    position: absolute; top: calc(100% + 6px); right: 0; z-index: 2147483001; box-sizing: border-box;
    width: max-content; max-width: min(320px, calc(100vw - 32px)); padding: 5px 9px; border-radius: 8px;
    background: var(--_ink); color: var(--_overlay-solid); box-shadow: 0 0 0 1px var(--_hairline);
    font-size: 12px; line-height: 16px; overflow-wrap: anywhere;
  }
  .tip[hidden], .popup[hidden], .scrim[hidden] { display: none; }

  .popup {
    position: absolute; top: calc(100% + 8px); right: 0; z-index: 2147483000;
    box-sizing: border-box; width: 384px; max-width: calc(100vw - 32px); max-height: calc(100dvh - 96px);
    overflow-y: auto; overscroll-behavior: contain; display: flex; flex-direction: column;
    padding: 8px 8px 10px; border-radius: 28px;
    background: var(--_tint); -webkit-backdrop-filter: var(--_backdrop); backdrop-filter: var(--_backdrop);
    box-shadow: var(--_shadow); color: var(--_ink); animation: rise 120ms ease-out;
  }
  :host([align="start"]) .popup, :host([align="start"]) .tip { right: auto; left: 0; }
  .popup.sheet {
    position: fixed; top: auto; right: 0; bottom: 0; left: 0; width: 100%; max-width: none;
    max-height: calc(100dvh - 48px); border-radius: 20px 20px 0 0;
    padding-bottom: calc(20px + env(safe-area-inset-bottom, 0px)); animation: slide 200ms ease-out;
  }
  .scrim { position: fixed; inset: 0; z-index: 2147482999; background: oklch(0 0 0 / 0.45); }
  @keyframes rise { from { opacity: 0; transform: translateY(4px); } }
  @keyframes slide { from { transform: translateY(100%); } }
  @keyframes spin { to { transform: rotate(360deg); } }

  .panel { background: var(--_panel); }
  button.panel, .org { -webkit-tap-highlight-color: transparent; }
  button.panel:hover, .org:hover { background-image: linear-gradient(var(--_hover), var(--_hover)); }

  .top { display: flex; align-items: center; min-height: 40px; padding-left: 44px; }
  .context { flex: 1; min-width: 0; margin: 0; text-align: center; font-size: 13px; line-height: 18px; color: var(--_ink-2); }
  .close {
    display: grid; place-items: center; flex-shrink: 0; width: 40px; height: 40px; padding: 0; border: 0;
    border-radius: 9999px; background: transparent; color: var(--_ink-2); cursor: pointer;
  }
  .close:hover { background: var(--_hover); }
  .close:focus-visible { outline: 2px solid var(--_ring); outline-offset: -2px; }

  .card {
    position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px;
    padding: 22px 20px 20px; border-radius: 24px;
  }
  .portrait { position: relative; width: 72px; height: 72px; margin-bottom: 12px; }
  .pencil {
    position: absolute; right: -4px; bottom: -2px; box-sizing: border-box; width: 28px; height: 28px;
    display: grid; place-items: center; border-radius: 9999px; color: var(--_ink);
    background: var(--_overlay-solid); box-shadow: 0 0 0 2px var(--_tint-solid), inset 0 0 0 1px var(--_control);
  }
  .pencil::after { content: ""; position: absolute; inset: -8px; }
  .pencil:focus-visible { outline: 2px solid var(--_ring); outline-offset: 2px; }
  .name {
    max-width: 100%; margin: 0; font-size: 20px; line-height: 26px; font-weight: 600; letter-spacing: -0.015em;
    text-align: center; overflow-wrap: anywhere;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .email {
    display: flex; justify-content: center; max-width: 100%; margin: 0; overflow: hidden; white-space: nowrap;
    font-size: 14px; line-height: 20px; color: var(--_ink-2);
  }
  .local { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .domain { flex-shrink: 0; }
  .pill {
    display: inline-flex; align-items: center; gap: 10px; box-sizing: border-box; max-width: 100%;
    min-height: 44px; margin-top: 16px; padding: 0 20px 0 14px; border: 1px solid var(--_control); border-radius: 9999px;
    color: var(--_ink); font-size: 14px; line-height: 20px; font-weight: 500; text-decoration: none;
  }
  .pill img { display: block; flex-shrink: 0; width: 20px; height: 20px; }
  .pill:hover { background: var(--_hover); }
  .pill.invite { background: var(--_selected); }
  .pill:focus-visible { outline: 2px solid var(--_ring); outline-offset: 2px; }

  .section { display: flex; flex-direction: column; gap: 2px; margin-top: 6px; }
  .heading { margin: 0; padding: 8px 16px 4px; font-size: 13px; line-height: 18px; font-weight: 500; color: var(--_ink-2); }
  .wrap, .radios { display: flex; flex-direction: column; gap: 2px; }
  .radios.all {
    max-height: 300px; overflow-y: auto; overscroll-behavior: contain;
    -webkit-mask-image: linear-gradient(180deg, #000 82%, transparent); mask-image: linear-gradient(180deg, #000 82%, transparent);
  }
  .radios.all.end { -webkit-mask-image: none; mask-image: none; }
  .org {
    display: flex; align-items: center; gap: 12px; box-sizing: border-box; min-height: 56px; padding: 8px 16px;
    border-radius: 4px; cursor: pointer;
  }
  .org[aria-checked="true"] { background: var(--_selected); }
  .radios[aria-readonly="true"] .org { cursor: default; }
  .radios[aria-busy="true"] .org { cursor: progress; }
  .org:focus-visible { outline: 2px solid var(--_ring); outline-offset: -2px; }
  .wrap > .radios:last-child > .org:last-child { border-radius: 4px 4px 18px 18px; }
  .org-mark {
    display: grid; place-items: center; flex-shrink: 0; width: 32px; height: 32px; border-radius: 9px;
    color: ${AVATAR_INK}; font-size: 14px; font-weight: 600;
  }
  .org-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .org-name { font-size: 14px; line-height: 20px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .org-role { font-size: 12.5px; line-height: 17px; color: var(--_ink-2); }
  .active { display: flex; align-items: center; gap: 6px; flex-shrink: 0; font-size: 12.5px; font-weight: 500; color: var(--_accent-text); }
  .check { width: 5px; height: 10px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: translateY(-2px) rotate(45deg); }
  .more {
    display: flex; align-items: center; min-height: 48px; padding: 0 16px; border: 0; border-radius: 4px 4px 18px 18px;
    color: var(--_accent-text); font: inherit; font-size: 14px; font-weight: 500; text-align: left; cursor: pointer;
  }
  .more:focus-visible, .signout:focus-visible { outline: 2px solid var(--_ring); outline-offset: -2px; }
  .signout {
    display: flex; align-items: center; gap: 12px; box-sizing: border-box; width: 100%; min-height: 52px; padding: 0 16px;
    border: 0; border-radius: 18px; color: var(--_ink); font: inherit; font-size: 14px; font-weight: 500;
    text-align: left; cursor: pointer;
  }
  .signout[aria-busy="true"] { color: var(--_ink-2); cursor: progress; }
  .spinner {
    box-sizing: border-box; width: 14px; height: 14px; margin: 0 2px; flex-shrink: 0; border-radius: 9999px;
    border: 2px solid var(--_hairline); border-top-color: var(--_ink-2); animation: spin 800ms linear infinite;
  }
  .error { margin: 0; padding: 6px 16px 2px; font-size: 13px; line-height: 19px; color: var(--_crit-ink); }
  .legal {
    display: flex; justify-content: center; flex-wrap: wrap; gap: 6px; padding: 12px 0 4px;
    font-size: 12.5px; line-height: 18px; color: var(--_ink-2);
  }
  .legal a { padding: 2px 6px; border-radius: 6px; color: inherit; text-decoration: none; }
  .legal a:hover { text-decoration: underline; }
  .legal a:focus-visible { outline: 2px solid var(--_ring); outline-offset: 2px; }

  @media (prefers-reduced-motion: reduce) {
    .popup, .popup.sheet { animation: none; }
    .spinner { animation-duration: 2400ms; }
  }
  @media (prefers-reduced-transparency: reduce) {
    .popup { background: var(--_tint-solid); -webkit-backdrop-filter: none; backdrop-filter: none; }
  }
  @media (forced-colors: active) {
    .popup, .panel, .org { border: 1px solid CanvasText; background: Canvas; }
    .org[aria-checked="true"] { outline: 2px solid Highlight; outline-offset: -2px; }
    .avatar, .org-mark { border: 1px solid CanvasText; }
    .pill, .legal a { color: LinkText; }
  }
`;

function pencilMark(): SVGSVGElement {
  return pathIcon(
    14,
    "0 0 24 24",
    "M4 20l1-5L15.5 4.5a2 2 0 0 1 2.8 0l1.2 1.2a2 2 0 0 1 0 2.8L9 19z",
  );
}

function signOutMark(): SVGSVGElement {
  return pathIcon(
    18,
    "0 0 24 24",
    "M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5v-2H6V6h4zM16.6 7.4L15.2 8.8 17.4 11H9v2h8.4l-2.2 2.2 1.4 1.4L21.2 12z",
  );
}

/** The first letter a person or an organisation is drawn with, whole even outside the basic plane. */
function initialOf(words: string): string {
  return [...words.trim()][0]?.toLocaleUpperCase() ?? "?";
}

interface Face {
  picture: string | null;
  tint: number;
  initial: string;
}

/** A round picture, or the coloured initial while it loads and when it fails. */
function avatar(face: Face, size: "s32" | "s72"): HTMLElement {
  const made = element("span", {
    class: `avatar ${size} t${String(face.tint)}`,
    "aria-hidden": "true",
  });
  if (face.picture === null) {
    made.textContent = face.initial;
    return made;
  }
  const image = element("img", {
    src: face.picture,
    alt: "",
    decoding: "async",
    referrerpolicy: "no-referrer",
  });
  image.addEventListener(
    "error",
    () => {
      made.textContent = face.initial;
    },
    { once: true },
  );
  made.append(image);
  return made;
}

/** The address on one line, cut in the middle so the domain survives: the domain is what tells two apart. */
function emailLine(email: string): HTMLElement {
  const line = element("p", { id: "email", class: "email", title: email });
  const at = email.lastIndexOf("@");
  if (at <= 0) {
    line.append(element("span", { class: "local" }, email));
  } else {
    line.append(
      element("span", { class: "local" }, email.slice(0, at)),
      element("span", { class: "domain" }, email.slice(at)),
    );
  }
  return line;
}

/** The product's own picture: an absolute or same-site web address, never anything else. */
function productPicture(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value === "") return null;
  try {
    return safeUrl(new URL(value, document.baseURI).href);
  } catch {
    return null;
  }
}

function personOf(value: unknown): AccountPerson | null {
  if (typeof value !== "object" || value === null) return null;
  const { name, email, id, avatarUrl } = value as Record<string, unknown>;
  if (typeof email !== "string" || email.trim() === "") return null;
  const shown = typeof name === "string" && name.trim() !== "" ? name.trim() : email.trim();
  return {
    name: shown,
    email: email.trim(),
    ...(typeof id === "string" && id !== "" ? { id } : {}),
    avatarUrl: typeof avatarUrl === "string" ? avatarUrl : null,
  };
}

function organisationsOf(value: unknown): AccountOrganisation[] {
  if (!Array.isArray(value)) return [];
  const out: AccountOrganisation[] = [];
  for (const one of value as unknown[]) {
    if (typeof one !== "object" || one === null) continue;
    const { id, name, role, active } = one as Record<string, unknown>;
    if (typeof id !== "string" || id === "" || typeof name !== "string" || name.trim() === "")
      continue;
    if (!ROLES.includes(role as OrganisationRole)) continue;
    out.push({ id, name: name.trim(), role: role as OrganisationRole, active: active === true });
  }
  // The active one first: the row says which one you are acting in.
  const active = out.findIndex((one) => one.active);
  if (active > 0) out.unshift(...out.splice(active, 1));
  return out;
}

/**
 * Defines `<gp-account>` once, where custom elements exist. Safe to import on a
 * server: nothing touches the DOM until this is called in a browser.
 */
export function defineAccountElement(name = "gp-account"): void {
  if (typeof customElements === "undefined" || customElements.get(name) !== undefined) return;
  customElements.define(name, createAccountElementClass());
}

type SignOutState = "idle" | "busy" | "failed";

/** The class itself, for a caller that registers it under its own name or in a scoped registry. */
export function createAccountElementClass(): CustomElementConstructor {
  return class GpAccountElement extends HTMLElement {
    #core: ChromeCore | null = null;
    #unsubscribe: (() => void) | null = null;
    #labels: AccountLabels = ACCOUNT_LABELS;
    #person: AccountPerson | null = null;
    #organisations: AccountOrganisation[] = [];
    #product: string | null = null;
    #viaIdentity = false;
    #onSignOut: SignOutHandler | null = null;
    #onSwitch: SwitchHandler | null = null;
    #open = false;
    #sheet = false;
    #allShown = false;
    #signOut: SignOutState = "idle";
    #switching: string | null = null;
    #switchFailed: string | null = null;
    #roving: string | null = null;
    #tipTimer: ReturnType<typeof setTimeout> | undefined;
    #quietFocus = false;
    #face = "";
    readonly #root: ShadowRoot;
    readonly #trigger: HTMLButtonElement;
    readonly #tip: HTMLDivElement;
    readonly #popup: HTMLDivElement;
    readonly #scrim: HTMLDivElement;
    readonly #status: HTMLDivElement;

    constructor() {
      super();
      this.#root = this.attachShadow({ mode: "open" });
      const style = element("style");
      style.textContent = ACCOUNT_CSS;
      this.#trigger = element("button", {
        type: "button",
        class: "trigger",
        part: "trigger",
        "aria-haspopup": "dialog",
        "aria-expanded": "false",
        "aria-controls": "popup",
      });
      // The trigger is already named with these words; the tooltip only shows them.
      this.#tip = element("div", {
        class: "tip",
        part: "tooltip",
        "aria-hidden": "true",
        hidden: "",
      });
      this.#scrim = element("div", { class: "scrim", hidden: "" });
      this.#popup = element("div", {
        id: "popup",
        class: "popup",
        part: "popup",
        role: "dialog",
        "aria-labelledby": "who",
        "aria-describedby": "email",
        hidden: "",
      });
      // Outside the popup, so "Switched to ..." is heard after it has closed.
      this.#status = element("div", { class: "sr-only", role: "status" });
      this.#root.append(style, this.#trigger, this.#tip, this.#scrim, this.#popup, this.#status);

      this.#trigger.addEventListener("click", () => {
        this.#hideTip();
        if (this.#open) this.close(true);
        else this.show();
      });
      this.#trigger.addEventListener("focus", () => {
        if (!this.#quietFocus) this.#tipSoon();
      });
      this.#trigger.addEventListener("blur", () => this.#hideTip());
      this.addEventListener("pointerenter", () => this.#tipSoon());
      this.addEventListener("pointerleave", () => this.#tipLater());
      this.#scrim.addEventListener("click", () => this.close(true));
      this.#popup.addEventListener("keydown", (event) => this.#keyed(event));
      this.#popup.addEventListener("click", (event) => this.#clicked(event));
    }

    /** The core `<gp-apps>` uses: Identity's half of what is shown. Nothing renders until one is set and enabled. */
    get core(): ChromeCore | null {
      return this.#core;
    }

    set core(next: ChromeCore | null) {
      this.#unsubscribe?.();
      this.#unsubscribe = null;
      this.#core = next;
      if (next !== null) {
        this.#unsubscribe = next.subscribe(() => this.#render());
        if (this.isConnected && next.state().status === "idle") void next.load();
      }
      this.#render();
    }

    /** Who is signed in. Nothing renders without one. */
    get person(): AccountPerson | null {
      return this.#person;
    }

    set person(next: AccountPerson | null) {
      const person = personOf(next);
      const same =
        person !== null &&
        this.#person !== null &&
        person.email === this.#person.email &&
        person.id === this.#person.id;
      if (!same) this.#signOut = "idle";
      this.#person = person;
      this.#render();
    }

    get organisations(): AccountOrganisation[] {
      return this.#organisations;
    }

    /** None, or an empty list, and the section is absent rather than empty. */
    set organisations(next: AccountOrganisation[] | null) {
      this.#organisations = organisationsOf(next);
      if (
        this.#switchFailed !== null &&
        !this.#organisations.some((one) => one.id === this.#switchFailed)
      )
        this.#switchFailed = null;
      this.#render();
    }

    /** The product's own name, read from its catalogue entry. Without it, the current tile's. */
    get product(): string | null {
      return this.#product;
    }

    set product(next: string | null) {
      this.#product = typeof next === "string" && next.trim() !== "" ? next.trim() : null;
      this.#render();
    }

    /** Whether the product signs in through Identity, so signing out ends both and the row says so (D21). */
    get viaIdentity(): boolean {
      return this.#viaIdentity;
    }

    set viaIdentity(next: boolean) {
      this.#viaIdentity = next === true;
      this.#render();
    }

    get onSignOut(): SignOutHandler | null {
      return this.#onSignOut;
    }

    /** No handler, no Sign out row. */
    set onSignOut(next: SignOutHandler | null) {
      this.#onSignOut = typeof next === "function" ? next : null;
      this.#render();
    }

    get onSwitch(): SwitchHandler | null {
      return this.#onSwitch;
    }

    /** No handler, and the organisations are listed read only. */
    set onSwitch(next: SwitchHandler | null) {
      this.#onSwitch = typeof next === "function" ? next : null;
      this.#render();
    }

    get labels(): AccountLabels {
      return this.#labels;
    }

    /** Any of the words, replaced; the rest stay English. */
    set labels(next: Partial<AccountLabels>) {
      this.#labels = {
        ...ACCOUNT_LABELS,
        ...next,
        roles: { ...ACCOUNT_LABELS.roles, ...next.roles },
      };
      this.#render();
    }

    get open(): boolean {
      return this.#open;
    }

    connectedCallback(): void {
      // A property set before the element was defined sits on the instance; move it through the setters.
      for (const key of [
        "core",
        "person",
        "organisations",
        "product",
        "viaIdentity",
        "onSignOut",
        "onSwitch",
        "labels",
      ] as const) {
        if (Object.prototype.hasOwnProperty.call(this, key)) {
          const value = (this as unknown as Record<string, unknown>)[key];
          delete (this as unknown as Record<string, unknown>)[key];
          (this as unknown as Record<string, unknown>)[key] = value;
        }
      }
      if (this.#core?.state().status === "idle") void this.#core.load();
      this.#render();
    }

    disconnectedCallback(): void {
      this.close(false);
      this.#hideTip();
    }

    readonly #outside = (event: PointerEvent): void => {
      if (event.composedPath().includes(this)) return;
      this.close(false);
      // Focus returns to the trigger unless the click landed on something that takes it.
      setTimeout(() => {
        if (document.activeElement === document.body || document.activeElement === null) {
          this.#returnFocus();
        }
      }, 0);
    };

    readonly #documentKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && this.#open) {
        event.stopPropagation();
        this.close(true);
      }
    };

    readonly #mediaChanged = (): void => {
      if (!this.#open) return;
      this.#layout();
      this.#render();
    };

    /** Escape takes the tooltip away and reaches nothing else, wherever focus is (1.4.13). */
    readonly #tipKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      this.#hideTip();
    };

    #tipSoon(): void {
      if (this.#open || this.hidden) return;
      clearTimeout(this.#tipTimer);
      this.#tipTimer = setTimeout(() => this.#showTip(), TIP_DELAY_MS);
    }

    /** The pointer left: the tooltip goes shortly unless it comes back, or focus holds it. */
    #tipLater(): void {
      if (this.#root.activeElement === this.#trigger) return;
      clearTimeout(this.#tipTimer);
      this.#tipTimer = setTimeout(() => this.#hideTip(), TIP_LINGER_MS);
    }

    #showTip(): void {
      if (this.#open || this.hidden) return;
      this.#tip.hidden = false;
      window.addEventListener("keydown", this.#tipKey, true);
    }

    #hideTip(): void {
      clearTimeout(this.#tipTimer);
      this.#tip.hidden = true;
      window.removeEventListener("keydown", this.#tipKey, true);
    }

    #returnFocus(): void {
      this.#quietFocus = true;
      this.#trigger.focus();
      this.#quietFocus = false;
    }

    /** Opens the popup and puts focus on the pill, else the active organisation, else Sign out. */
    show(): void {
      const core = this.#core;
      if (core === null || this.hidden || this.#open) return;
      this.#open = true;
      this.#hideTip();
      const state = core.state();
      if (
        state.status !== "loading" &&
        (state.updatedAt === null || Date.now() - state.updatedAt > FRESH_MS)
      ) {
        void core.load();
      }
      this.#layout();
      this.#trigger.setAttribute("aria-expanded", "true");
      this.#popup.hidden = false;
      document.addEventListener("pointerdown", this.#outside, true);
      document.addEventListener("keydown", this.#documentKey);
      window.matchMedia?.(SHEET_QUERY).addEventListener?.("change", this.#mediaChanged);
      this.#render();
      this.#focusStart();
    }

    /** Closes it, and gives focus back to the trigger when asked to. */
    close(returnFocus: boolean): void {
      if (!this.#open) return;
      this.#open = false;
      this.#allShown = false;
      this.#switchFailed = null;
      if (this.#signOut === "failed") this.#signOut = "idle";
      this.#trigger.setAttribute("aria-expanded", "false");
      this.#popup.hidden = true;
      this.#scrim.hidden = true;
      document.removeEventListener("pointerdown", this.#outside, true);
      document.removeEventListener("keydown", this.#documentKey);
      window.matchMedia?.(SHEET_QUERY).removeEventListener?.("change", this.#mediaChanged);
      if (returnFocus) this.#returnFocus();
    }

    #layout(): void {
      this.#sheet = window.matchMedia?.(SHEET_QUERY).matches ?? false;
      this.#popup.classList.toggle("sheet", this.#sheet);
      this.#scrim.hidden = !this.#sheet;
      if (this.#sheet) this.#popup.setAttribute("aria-modal", "true");
      else this.#popup.removeAttribute("aria-modal");
    }

    #keyed(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.close(true);
        return;
      }
      if (event.key === "Tab") {
        this.#tabbed(event);
        return;
      }
      const radio = (event.composedPath()[0] as HTMLElement | undefined)?.closest?.(
        '[role="radio"]',
      );
      if (!(radio instanceof HTMLElement)) return;
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        const id = radio.dataset["id"];
        if (id !== undefined) void this.#choose(id);
        return;
      }
      const radios = this.#radios();
      const index = radios.indexOf(radio);
      let next: number;
      switch (event.key) {
        case "ArrowDown":
        case "ArrowRight":
          next = Math.min(index + 1, radios.length - 1);
          break;
        case "ArrowUp":
        case "ArrowLeft":
          next = Math.max(index - 1, 0);
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = radios.length - 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      const target = radios[next];
      if (target === undefined) return;
      this.#roveTo(target);
      target.focus();
    }

    /** Tab between the stops; from the last one it closes, or in a sheet it loops. */
    #tabbed(event: KeyboardEvent): void {
      const stops = [
        ...this.#popup.querySelectorAll<HTMLElement>(
          'button, a[href], [role="radio"][tabindex="0"]',
        ),
      ];
      if (stops.length === 0) return;
      const here = stops.indexOf(this.#root.activeElement as HTMLElement);
      const last = stops.length - 1;
      if (!event.shiftKey && here === last) {
        event.preventDefault();
        if (this.#sheet) stops[0]?.focus();
        else this.close(true);
      } else if (event.shiftKey && here === 0 && this.#sheet) {
        event.preventDefault();
        stops[last]?.focus();
      }
    }

    #clicked(event: MouseEvent): void {
      const target = (event.composedPath()[0] as HTMLElement | undefined)?.closest?.(
        "[data-action]",
      );
      if (!(target instanceof HTMLElement)) return;
      switch (target.dataset["action"]) {
        case "close":
          this.close(true);
          break;
        case "more":
          this.#showAll();
          break;
        case "signout":
          void this.#signOutNow();
          break;
        case "org": {
          const id = target.dataset["id"];
          if (id !== undefined) void this.#choose(id);
          break;
        }
        default:
          break;
      }
    }

    #radios(): HTMLElement[] {
      return [...this.#popup.querySelectorAll<HTMLElement>('[role="radio"]')];
    }

    #roveTo(radio: HTMLElement): void {
      for (const other of this.#radios()) other.tabIndex = other === radio ? 0 : -1;
      this.#roving = radio.dataset["id"] ?? null;
    }

    #byKey(key: string): HTMLElement | undefined {
      return [...this.#popup.querySelectorAll<HTMLElement>("[data-key]")].find(
        (one) => one.dataset["key"] === key,
      );
    }

    #focusStart(): void {
      const start =
        this.#byKey("pill") ??
        this.#popup.querySelector<HTMLElement>('[role="radio"][tabindex="0"]') ??
        this.#byKey("signout") ??
        this.#byKey("close");
      start?.focus();
    }

    /** The rest open in place, and focus lands on the row that took "Show all"'s spot. */
    #showAll(): void {
      this.#allShown = true;
      const moved = this.#organisations[SHOWN];
      if (moved !== undefined) this.#roving = moved.id;
      this.#render();
      if (moved !== undefined) this.#byKey(`org:${moved.id}`)?.focus();
    }

    async #choose(id: string): Promise<void> {
      const handler = this.#onSwitch;
      const organisation = this.#organisations.find((one) => one.id === id);
      if (
        handler === null ||
        organisation === undefined ||
        organisation.active ||
        this.#switching !== null
      )
        return;
      this.#switching = id;
      this.#switchFailed = null;
      this.#roving = id;
      this.#render();
      try {
        await handler(id);
      } catch {
        this.#switching = null;
        this.#switchFailed = id;
        this.#render();
        return;
      }
      this.#switching = null;
      this.close(true);
      this.#status.textContent = this.#labels.switched(organisation.name);
    }

    async #signOutNow(): Promise<void> {
      const handler = this.#onSignOut;
      if (handler === null || this.#signOut === "busy") return;
      this.#signOut = "busy";
      this.#render();
      try {
        await handler();
      } catch {
        this.#signOut = "failed";
        this.#render();
        return;
      }
      // Signed out. The product navigates; the kept list goes, so a shared device never shows the next person this one's.
      this.#core?.clear();
    }

    #productName(view: ChromeView | null): string | null {
      return this.#product ?? view?.yours.find((tile) => tile.current)?.displayName ?? null;
    }

    /** Identity's picture if there is an Identity, else the product's, else the coloured initial (D22). */
    #faceOf(view: ChromeView | null, person: AccountPerson): Face {
      const own = view?.person.hasIdentity === true ? view.person : null;
      return {
        picture: own?.avatarUrl ?? productPicture(person.avatarUrl),
        tint: own?.tint ?? avatarTint(person.id ?? person.email.toLowerCase()),
        initial: initialOf(person.name),
      };
    }

    #render(): void {
      const state = this.#core?.state() ?? null;
      const person = this.#person;
      this.hidden = state === null || state.status === "off" || person === null;
      if (state === null || person === null || this.hidden) {
        this.close(false);
        this.#hideTip();
        return;
      }
      const labels = this.#labels;
      const view = state.view;
      const name = labels.trigger(person.name);
      this.#trigger.setAttribute("aria-label", name);
      this.#tip.textContent = name;
      const face = this.#faceOf(view, person);
      const signature = `${face.picture ?? ""} ${String(face.tint)} ${face.initial}`;
      if (signature !== this.#face) {
        this.#face = signature;
        this.#trigger.replaceChildren(avatar(face, "s32"));
      }
      if (!this.#open) return;

      // What had focus and how far things were scrolled, so a view that swaps in underneath keeps both.
      const active = this.#root.activeElement as HTMLElement | null;
      const focused = active?.dataset["key"];
      const hadFocus = active !== null && this.#popup.contains(active);
      const scrolled = this.#popup.scrollTop;
      const listScrolled = this.#popup.querySelector(".radios")?.scrollTop ?? 0;

      this.#popup.replaceChildren(this.#content(view, person, face));

      this.#popup.scrollTop = scrolled;
      const list = this.#popup.querySelector<HTMLElement>(".radios.all");
      if (list !== null) {
        list.scrollTop = listScrolled;
        const fade = (): void => {
          list.classList.toggle("end", list.scrollTop + list.clientHeight >= list.scrollHeight - 2);
        };
        list.addEventListener("scroll", fade, { passive: true });
        fade();
      }
      const again = focused === undefined ? undefined : this.#byKey(focused);
      if (again !== undefined) again.focus();
      else if (hadFocus) this.#focusStart();
    }

    #content(view: ChromeView | null, person: AccountPerson, face: Face): DocumentFragment {
      const labels = this.#labels;
      const product = this.#productName(view);
      const out = document.createDocumentFragment();

      const top = element("div", { class: "top" });
      top.append(
        element("p", { class: "context" }, product === null ? "" : labels.signedInTo(product)),
      );
      const close = element("button", {
        type: "button",
        class: "close",
        "data-action": "close",
        "data-key": "close",
        "aria-label": labels.close,
      });
      close.append(crossMark());
      top.append(close);
      out.append(top);

      const own = view?.person.hasIdentity === true;
      const links = view?.identity ?? null;
      const card = element("div", { class: "card panel" });
      const portrait = element("span", { class: "portrait" });
      portrait.append(avatar(face, "s72"));
      if (own && links !== null) {
        const pencil = element("a", {
          class: "pencil",
          href: links.pictureUrl,
          "data-key": "pencil",
          "aria-label": labels.changePicture,
        });
        pencil.append(pencilMark());
        portrait.append(pencil);
      }
      card.append(
        portrait,
        element("h2", { id: "who", class: "name", title: person.name }, person.name),
        emailLine(person.email),
      );
      if (links !== null) {
        const pill = element("a", {
          class: own ? "pill" : "pill invite",
          href: own ? links.accountUrl : links.setupUrl,
          "data-key": "pill",
        });
        if (links.iconUrl !== null) {
          pill.append(
            element("img", {
              src: links.iconUrl,
              alt: "",
              width: "20",
              height: "20",
              decoding: "async",
              referrerpolicy: "no-referrer",
            }),
          );
        }
        pill.append(element("span", {}, own ? labels.manage : labels.setUp));
        card.append(pill);
      }
      out.append(card);

      if (this.#organisations.length > 0) out.append(this.#organisationsSection());
      if (this.#onSignOut !== null) out.append(this.#signOutSection(product));

      if (view !== null && view.legal !== null) {
        const footer = element("div", { class: "legal" });
        footer.append(
          element("a", { href: view.legal.termsUrl, "data-key": "terms" }, labels.terms),
          element("span", { "aria-hidden": "true" }, "·"),
          element("a", { href: view.legal.privacyUrl, "data-key": "privacy" }, labels.privacy),
        );
        out.append(footer);
      }
      return out;
    }

    #organisationsSection(): HTMLElement {
      const labels = this.#labels;
      const all = this.#organisations;
      const cut = !this.#allShown && all.length > SHOWN;
      const shown = cut ? all.slice(0, SHOWN) : all;
      const stop =
        shown.find((one) => one.id === this.#roving) ?? shown.find((one) => one.active) ?? shown[0];

      const section = element("div", { class: "section" });
      section.append(element("p", { id: "orgs", class: "heading" }, labels.organisations));
      const wrap = element("div", { class: "wrap" });
      const radios = element("div", {
        class: this.#allShown && all.length > SHOWN ? "radios all" : "radios",
        role: "radiogroup",
        "aria-labelledby": "orgs",
      });
      if (this.#onSwitch === null) radios.setAttribute("aria-readonly", "true");
      if (this.#switching !== null) radios.setAttribute("aria-busy", "true");
      for (const one of shown) {
        const role = labels.roles[one.role];
        const row = element("div", {
          class: "org panel",
          role: "radio",
          "aria-checked": String(one.active),
          "aria-label": `${one.name}, ${role}`,
          tabindex: one === stop ? "0" : "-1",
          "data-action": "org",
          "data-id": one.id,
          "data-key": `org:${one.id}`,
        });
        const text = element("span", { class: "org-text", "aria-hidden": "true" });
        text.append(
          element("span", { class: "org-name", title: one.name }, one.name),
          element("span", { class: "org-role" }, role),
        );
        row.append(
          element(
            "span",
            { class: `org-mark t${String(avatarTint(one.id))}`, "aria-hidden": "true" },
            initialOf(one.name),
          ),
          text,
        );
        if (one.active) {
          const tag = element("span", { class: "active", "aria-hidden": "true" });
          tag.append(element("span", { class: "check" }), labels.active);
          row.append(tag);
        }
        radios.append(row);
      }
      wrap.append(radios);
      if (cut) {
        wrap.append(
          element(
            "button",
            { type: "button", class: "more panel", "data-action": "more", "data-key": "more" },
            labels.showAll(all.length),
          ),
        );
      }
      section.append(wrap);
      const failed = all.find((one) => one.id === this.#switchFailed);
      if (failed !== undefined) {
        section.append(
          element("p", { class: "error", role: "alert" }, labels.switchFailed(failed.name)),
        );
      }
      return section;
    }

    #signOutSection(product: string | null): HTMLElement {
      const labels = this.#labels;
      const name = product ?? labels.thisProduct;
      const busy = this.#signOut === "busy";
      const failed = this.#signOut === "failed";
      const section = element("div", { class: "section" });
      const button = element("button", {
        type: "button",
        class: "signout panel",
        "data-action": "signout",
        "data-key": "signout",
      });
      if (busy) {
        button.setAttribute("aria-busy", "true");
        button.append(element("span", { class: "spinner", "aria-hidden": "true" }));
      } else {
        button.append(signOutMark());
      }
      button.append(
        element(
          "span",
          {},
          busy
            ? labels.signingOut(name)
            : failed
              ? labels.retry
              : this.#viaIdentity
                ? labels.signOutBoth(name)
                : labels.signOut(name),
        ),
      );
      section.append(button);
      if (failed) {
        button.setAttribute("aria-describedby", "signout-failed");
        section.append(
          element(
            "p",
            { id: "signout-failed", class: "error", role: "alert" },
            labels.signOutFailed(name),
          ),
        );
      }
      return section;
    }
  };
}
