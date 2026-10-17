/**
 * `<gp-apps>`, the apps picker (GPlatform Identity, sheet 31, option B).
 *
 * A nine dot trigger and, under it, the products this person has and the ones
 * open to join: flat marks with nothing behind them until a pointer or the
 * focus arrives, the current product on a resting plate in the selected wash,
 * an invitation carrying a small plus.
 *
 * **What it is to assistive technology, which is most of the work:**
 *
 * - The trigger is a `button` with `aria-haspopup="dialog"`, named "Products".
 * - The popup is a `dialog`, not modal and never a `menu`: the tiles are links
 *   that navigate, and a menu would take the browser's link behaviour away
 *   (middle click, copy the address). Below 600 wide it is a bottom sheet, and
 *   there it is modal, with a scrim, a close button first and a contained
 *   focus loop, because a sheet covers the page.
 * - Focus opens on the current product, else the first tile. Each group is one
 *   tab stop with a roving tabindex; the arrows move in two dimensions without
 *   wrapping a row, Down from the last row of one group lands in the same
 *   column of the next, Home and End go to the group's ends, and Tab from the
 *   last group returns to the trigger and closes.
 * - Each tile is named with its state: "GAdvisory, you are here", "GOpenCDR,
 *   open to join", "DAnalytics, cannot be opened while offline". The current
 *   one carries `aria-current="page"`; an offline one is `aria-disabled` and
 *   stays focusable.
 *
 * **It draws the kept list at once.** The core holds the last answer in local
 * storage; opening draws it with no network wait and asks again in the
 * background, and a changed list swaps in without moving the focus. The
 * skeleton is only for a first visit with nothing kept.
 *
 * The words are English by default and every one can be replaced (`labels`).
 */

import type { ChromeCore, ChromeState } from "../core.js";
import type { ChromeTile } from "../types.js";
import { CONTRACT_CSS } from "./contract.js";
import { SVG_NS, crossMark, element } from "./dom.js";

export interface AppsLabels {
  /** The trigger's name and the popup's heading. */
  trigger: string;
  yours: string;
  more: string;
  /** Known only from a seeded list and never opened. */
  empty: string;
  /** The kept list is shown because Identity could not be reached. */
  stale: (time: string) => string;
  retry: string;
  failed: string;
  here: (name: string) => string;
  join: (name: string) => string;
  offline: (name: string) => string;
  offlineShort: string;
  moreBelow: (count: number) => string;
  close: string;
}

export const APPS_LABELS: AppsLabels = {
  trigger: "Products",
  yours: "Your products",
  more: "More from Gelhaus Solutions",
  empty: "Nothing here yet. Products you use appear here after you open them.",
  stale: (time) => `Showing the list from ${time}.`,
  retry: "Try again",
  failed: "The list could not be loaded.",
  here: (name) => `${name}, you are here`,
  join: (name) => `${name}, open to join`,
  offline: (name) => `${name}, cannot be opened while offline`,
  offlineShort: "Offline",
  moreBelow: (count) => `${String(count)} more below`,
  close: "Close",
};

/** A list asked again on opening when it is older than this. */
const FRESH_MS = 60_000;
const SHEET_QUERY = "(max-width: 599px)";
const SKELETON_TILES = 6;

export const APPS_CSS = `${CONTRACT_CSS}
  .trigger {
    width: 40px; height: 40px; padding: 0; margin: 0; border: 0; border-radius: 9999px;
    display: grid; place-items: center; background: transparent; color: inherit; cursor: pointer;
  }
  .trigger:hover { background: var(--_hover); }
  .trigger:active { background: var(--_active); }
  .trigger[aria-expanded="true"] { background: var(--_selected); color: var(--_accent-text); }
  .trigger:focus-visible { outline: 2px solid var(--_ring); outline-offset: 2px; }
  @media (pointer: coarse) { .trigger { box-sizing: content-box; padding: 2px; } }

  .popup {
    position: absolute; top: calc(100% + 8px); right: 0; z-index: 2147483000;
    box-sizing: border-box; width: 328px; max-width: calc(100vw - 32px);
    max-height: calc(100dvh - 96px); display: flex; flex-direction: column;
    padding: 10px 8px 12px; border-radius: 20px;
    background: var(--_overlay); -webkit-backdrop-filter: var(--_backdrop); backdrop-filter: var(--_backdrop);
    box-shadow: var(--_shadow); color: var(--_ink); container-type: inline-size;
    animation: rise 120ms ease-out;
  }
  :host([align="start"]) .popup { right: auto; left: 0; }
  .popup[hidden], .scrim[hidden] { display: none; }
  .scroller { overflow-y: auto; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 4px; }
  .popup.sheet {
    position: fixed; top: auto; right: 0; bottom: 0; left: 0; width: 100%; max-width: none;
    max-height: calc(100dvh - 48px); border-radius: 20px 20px 0 0; padding: 22px 8px 28px;
    animation: slide 200ms ease-out;
  }
  .scrim { position: fixed; inset: 0; z-index: 2147482999; background: oklch(0 0 0 / 0.45); }
  .handle {
    display: block; position: absolute; top: 8px; left: 50%; width: 36px; height: 4px;
    margin-left: -18px; border-radius: 9999px; background: var(--_control);
  }
  .close {
    display: grid; place-items: center; position: absolute; top: 10px; right: 10px; width: 36px; height: 36px;
    border: 0; border-radius: 9999px; background: transparent; color: var(--_ink-2); cursor: pointer;
  }
  .close:hover { background: var(--_hover); }
  .close:focus-visible { outline: 2px solid var(--_ring); outline-offset: 2px; }
  @keyframes rise { from { opacity: 0; transform: translateY(4px); } }
  @keyframes slide { from { transform: translateY(100%); } }
  @media (prefers-reduced-motion: reduce) { .popup, .popup.sheet { animation: none; } }
  @media (prefers-reduced-transparency: reduce) {
    .popup { background: var(--_overlay-solid); -webkit-backdrop-filter: none; backdrop-filter: none; }
  }

  .heading {
    margin: 0; padding: 4px 10px 2px; font-size: 12.5px; line-height: 18px; font-weight: 500; color: var(--_ink-2);
  }
  .note { margin: 0; padding: 2px 10px 8px; font-size: 13.5px; line-height: 21px; color: var(--_ink-2); }
  .divider { height: 1px; margin: 6px 10px; background: var(--_hairline); }
  .stale {
    display: flex; align-items: center; gap: 10px; padding: 4px 10px; font-size: 12.5px; line-height: 18px; color: var(--_ink-3);
  }
  .stale span { flex: 1; }
  .link {
    padding: 0; border: 0; background: transparent; font: inherit; font-weight: 500;
    color: var(--_accent-text); cursor: pointer; border-radius: 4px;
  }
  .failed { display: flex; flex-direction: column; gap: 12px; padding: 12px 10px; }
  .failed p { margin: 0; font-size: 14px; line-height: 21px; }
  .pill {
    align-self: flex-start; height: 36px; padding: 0 14px; border: 1px solid var(--_control); border-radius: 9999px;
    background: transparent; color: var(--_ink); font: inherit; font-size: 14px; font-weight: 500; cursor: pointer;
  }
  .pill:hover { background: var(--_hover); }
  .link:focus-visible, .pill:focus-visible { outline: 2px solid var(--_ring); outline-offset: 2px; }

  .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2px; margin: 0; padding: 0; list-style: none; }
  @container (max-width: 319px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .tile {
    position: relative; box-sizing: border-box; min-height: 100px; padding: 14px 4px 12px; border-radius: 14px;
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    color: var(--_ink); text-decoration: none; -webkit-tap-highlight-color: transparent;
  }
  .tile:hover { background: var(--_hover); }
  .tile:active { background: var(--_active); }
  .tile[aria-current="page"] { background: var(--_selected); }
  .tile:focus-visible { outline: 2px solid var(--_ring); outline-offset: -2px; }
  .tile[aria-disabled="true"] { cursor: default; }
  .tile[aria-disabled="true"] img { filter: grayscale(1); }
  .mark { position: relative; display: block; width: 44px; height: 44px; flex-shrink: 0; }
  .mark img { display: block; width: 44px; height: 44px; }
  .initial {
    box-sizing: border-box; width: 44px; height: 44px; border-radius: 9999px; border: 1.5px solid var(--_ink-3);
    display: grid; place-items: center; font-size: 16px; font-weight: 600; color: var(--_ink-2);
  }
  .plus {
    position: absolute; right: -5px; bottom: -4px; box-sizing: border-box; width: 18px; height: 18px; border-radius: 9999px;
    background: var(--_overlay-solid); box-shadow: inset 0 0 0 1.5px var(--_ink-2); color: var(--_ink);
    display: grid; place-items: center;
  }
  .name {
    max-width: 100%; font-size: 12.5px; line-height: 16px; font-weight: 500; text-align: center; overflow-wrap: anywhere;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .tile[aria-current="page"] .name { font-weight: 600; }
  .tile[aria-disabled="true"] .name { color: var(--_ink-3); }
  .sub { font-size: 11.5px; line-height: 14px; font-weight: 500; color: var(--_ink-2); }
  .skeleton { min-height: 100px; padding: 14px 4px 12px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .skeleton span:first-child { width: 44px; height: 44px; border-radius: 9999px; background: var(--_active); }
  .skeleton span:last-child { width: 56%; height: 10px; margin: 3px 0; border-radius: 5px; background: var(--_active); }
  .fade {
    position: absolute; left: 0; right: 0; bottom: 0; height: 72px; border-radius: 0 0 20px 20px; pointer-events: none;
    background: linear-gradient(180deg, transparent, var(--_overlay-solid) 78%);
    display: flex; align-items: flex-end; justify-content: center; padding-bottom: 10px; box-sizing: border-box;
  }
  .fade[hidden] { display: none; }
  .fade span {
    font-size: 12px; line-height: 16px; font-weight: 500; color: var(--_ink-2); padding: 3px 10px;
    border-radius: 9999px; background: var(--_overlay-solid); border: 1px solid var(--_hairline);
  }

  @media (forced-colors: active) {
    .popup { border: 1px solid CanvasText; }
    .tile { color: LinkText; }
    .tile[aria-current="page"] { outline: 2px solid Highlight; outline-offset: -2px; }
    .plus { outline: 1px solid CanvasText; }
  }
`;

/** The nine dots, in the host's own ink. */
function nineDots(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("aria-hidden", "true");
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const dot = document.createElementNS(SVG_NS, "circle");
      dot.setAttribute("cx", String(2 + column * 8));
      dot.setAttribute("cy", String(2 + row * 8));
      dot.setAttribute("r", "2");
      dot.setAttribute("fill", "currentColor");
      svg.append(dot);
    }
  }
  return svg;
}

function plusMark(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "8");
  svg.setAttribute("height", "8");
  svg.setAttribute("viewBox", "0 0 8 8");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", "M4 0v8M0 4h8");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.5");
  svg.append(path);
  return svg;
}

/**
 * Where an arrow key goes in a grid of `count` tiles, `columns` wide, without
 * wrapping a row. Null where the key leaves the grid downwards or upwards, so
 * the caller can carry the column into the next group.
 */
export function moveInGrid(
  index: number,
  count: number,
  columns: number,
  key: string,
): number | "above" | "below" | null {
  const column = index % columns;
  switch (key) {
    case "ArrowRight":
      return column < columns - 1 && index + 1 < count ? index + 1 : index;
    case "ArrowLeft":
      return column > 0 ? index - 1 : index;
    case "ArrowDown":
      return index + columns < count ? index + columns : "below";
    case "ArrowUp":
      return index - columns >= 0 ? index - columns : "above";
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

type Group = "yours" | "more";

/**
 * Defines `<gp-apps>` once, where custom elements exist. Safe to import on a
 * server: nothing touches the DOM until this is called in a browser.
 */
export function defineAppsElement(name = "gp-apps"): void {
  if (typeof customElements === "undefined" || customElements.get(name) !== undefined) return;
  customElements.define(name, createAppsElementClass());
}

/** The class itself, for a caller that registers it under its own name or in a scoped registry. */
export function createAppsElementClass(): CustomElementConstructor {
  return class GpAppsElement extends HTMLElement {
    #core: ChromeCore | null = null;
    #unsubscribe: (() => void) | null = null;
    #labels: AppsLabels = APPS_LABELS;
    #open = false;
    #sheet = false;
    #roving: Record<Group, string | null> = { yours: null, more: null };
    readonly #root: ShadowRoot;
    readonly #trigger: HTMLButtonElement;
    readonly #popup: HTMLDivElement;
    readonly #scrim: HTMLDivElement;
    readonly #scroller: HTMLDivElement;
    readonly #fade: HTMLDivElement;

    constructor() {
      super();
      this.#root = this.attachShadow({ mode: "open" });
      const style = element("style");
      style.textContent = APPS_CSS;
      this.#trigger = element("button", {
        type: "button",
        class: "trigger",
        part: "trigger",
        "aria-haspopup": "dialog",
        "aria-expanded": "false",
        "aria-controls": "popup",
      });
      this.#trigger.append(nineDots());
      this.#scrim = element("div", { class: "scrim", hidden: "" });
      this.#popup = element("div", {
        id: "popup",
        class: "popup",
        part: "popup",
        role: "dialog",
        "aria-labelledby": "heading",
        hidden: "",
      });
      this.#scroller = element("div", { class: "scroller" });
      this.#fade = element("div", { class: "fade", "aria-hidden": "true", hidden: "" });
      this.#root.append(style, this.#trigger, this.#scrim, this.#popup);

      this.#trigger.addEventListener("click", () => {
        if (this.#open) this.close(true);
        else this.show();
      });
      this.#scrim.addEventListener("click", () => this.close(true));
      this.#popup.addEventListener("keydown", (event) => this.#keyed(event));
      this.#scroller.addEventListener("scroll", () => this.#countBelow(), { passive: true });
    }

    /** The core that holds the list. Nothing renders until one is set and enabled. */
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

    get labels(): AppsLabels {
      return this.#labels;
    }

    /** Any of the words, replaced; the rest stay English. */
    set labels(next: Partial<AppsLabels>) {
      this.#labels = { ...APPS_LABELS, ...next };
      this.#render();
    }

    get open(): boolean {
      return this.#open;
    }

    connectedCallback(): void {
      // A property set before the element was defined sits on the instance; move it through the setters.
      for (const key of ["core", "labels"] as const) {
        if (Object.prototype.hasOwnProperty.call(this, key)) {
          const value = (this as unknown as Record<string, unknown>)[key];
          delete (this as unknown as Record<string, unknown>)[key];
          (this as unknown as Record<string, unknown>)[key] = value;
        }
      }
      if (this.#core?.state().status === "idle") void this.#core.load();
      this.#render();
      window.addEventListener("online", this.#onNetwork);
      window.addEventListener("offline", this.#onNetwork);
    }

    disconnectedCallback(): void {
      this.close(false);
      window.removeEventListener("online", this.#onNetwork);
      window.removeEventListener("offline", this.#onNetwork);
    }

    readonly #onNetwork = (): void => {
      this.#render();
    };

    readonly #outside = (event: PointerEvent): void => {
      if (event.composedPath().includes(this)) return;
      this.close(false);
      // Focus returns to the trigger unless the click landed on something that takes it.
      setTimeout(() => {
        if (document.activeElement === document.body || document.activeElement === null) {
          this.#trigger.focus();
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

    /** Opens the popup and puts focus on the current product, else the first tile. */
    show(): void {
      const core = this.#core;
      if (core === null || core.state().status === "off" || this.#open) return;
      this.#open = true;
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
      this.#trigger.setAttribute("aria-expanded", "false");
      this.#popup.hidden = true;
      this.#scrim.hidden = true;
      document.removeEventListener("pointerdown", this.#outside, true);
      document.removeEventListener("keydown", this.#documentKey);
      window.matchMedia?.(SHEET_QUERY).removeEventListener?.("change", this.#mediaChanged);
      if (returnFocus) this.#trigger.focus();
    }

    #layout(): void {
      this.#sheet = window.matchMedia?.(SHEET_QUERY).matches ?? false;
      this.#popup.classList.toggle("sheet", this.#sheet);
      this.#scrim.hidden = !this.#sheet;
      if (this.#sheet) this.#popup.setAttribute("aria-modal", "true");
      else this.#popup.removeAttribute("aria-modal");
    }

    #focusStart(): void {
      const tiles = this.#tiles();
      const start =
        tiles.find((tile) => tile.getAttribute("aria-current") === "page") ??
        tiles[0] ??
        this.#popup.querySelector<HTMLElement>(".pill, .link") ??
        null;
      if (start !== null) {
        this.#roveTo(start);
        start.focus();
      } else {
        this.#popup.setAttribute("tabindex", "-1");
        this.#popup.focus();
      }
    }

    #tiles(group?: Group): HTMLAnchorElement[] {
      const selector = group === undefined ? "a.tile" : `a.tile[data-group="${group}"]`;
      return [...this.#popup.querySelectorAll<HTMLAnchorElement>(selector)];
    }

    #roveTo(tile: HTMLElement): void {
      const group = tile.dataset["group"] as Group | undefined;
      if (group === undefined) return;
      for (const other of this.#tiles(group)) other.tabIndex = other === tile ? 0 : -1;
      this.#roving[group] = tile.dataset["slug"] ?? null;
    }

    #columns(group: Group): number {
      const grid = this.#popup.querySelector<HTMLElement>(`.grid[data-group="${group}"]`);
      if (grid === null) return 3;
      const template = getComputedStyle(grid).gridTemplateColumns;
      const count = template === "" || template === "none" ? 0 : template.split(" ").length;
      return count > 0 ? count : 3;
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
      const tile = (event.composedPath()[0] as HTMLElement | undefined)?.closest?.("a.tile");
      if (!(tile instanceof HTMLAnchorElement)) return;
      const group = tile.dataset["group"] as Group;
      const tiles = this.#tiles(group);
      const index = tiles.indexOf(tile);
      const columns = this.#columns(group);
      const next = moveInGrid(index, tiles.length, columns, event.key);
      if (next === null) return;
      event.preventDefault();
      let target: HTMLAnchorElement | undefined;
      if (next === "below" || next === "above") {
        const other: Group = next === "below" ? "more" : "yours";
        if (other === group) return;
        const there = this.#tiles(other);
        if (there.length === 0) return;
        const column = index % columns;
        const otherColumns = this.#columns(other);
        if (next === "below") {
          target = there[Math.min(column, there.length - 1, otherColumns - 1)];
        } else {
          const lastRowStart = Math.floor((there.length - 1) / otherColumns) * otherColumns;
          target = there[Math.min(lastRowStart + column, there.length - 1)];
        }
      } else {
        target = tiles[next];
      }
      if (target === undefined) return;
      this.#roveTo(target);
      target.focus();
    }

    /** Tab between the stops; from the last one it closes, or in a sheet it loops. */
    #tabbed(event: KeyboardEvent): void {
      const stops = [...this.#popup.querySelectorAll<HTMLElement>("button, a.tile[tabindex='0']")];
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

    #countBelow(): void {
      const box = this.#scroller.getBoundingClientRect();
      if (box.height === 0) {
        this.#fade.hidden = true;
        return;
      }
      const hidden = this.#tiles().filter(
        (tile) => tile.getBoundingClientRect().top >= box.bottom - 24,
      ).length;
      this.#fade.hidden = hidden === 0;
      const words = this.#fade.firstElementChild;
      if (words !== null) words.textContent = this.#labels.moreBelow(hidden);
    }

    #render(): void {
      const state: ChromeState | null = this.#core?.state() ?? null;
      this.hidden = state === null || state.status === "off";
      this.#trigger.setAttribute("aria-label", this.#labels.trigger);
      if (this.hidden) {
        this.close(false);
        return;
      }
      if (!this.#open) return;

      // Which tile had focus, so a list that swaps in underneath keeps it.
      const focused = this.#root.activeElement as HTMLElement | null;
      const keep =
        focused?.classList.contains("tile") === true
          ? { group: focused.dataset["group"], slug: focused.dataset["slug"] }
          : null;

      this.#popup.replaceChildren(this.#popupContent(state as ChromeState));
      this.#countBelow();

      for (const group of ["yours", "more"] as const) {
        const tiles = this.#tiles(group);
        const remembered = tiles.find((tile) => tile.dataset["slug"] === this.#roving[group]);
        const current = tiles.find((tile) => tile.getAttribute("aria-current") === "page");
        const first = remembered ?? current ?? tiles[0];
        if (first !== undefined) this.#roveTo(first);
      }
      if (keep !== null) {
        const again = this.#tiles().find(
          (tile) => tile.dataset["group"] === keep.group && tile.dataset["slug"] === keep.slug,
        );
        if (again !== undefined) {
          this.#roveTo(again);
          again.focus();
        }
      }
    }

    #popupContent(state: ChromeState): DocumentFragment {
      const labels = this.#labels;
      const out = document.createDocumentFragment();
      if (this.#sheet) {
        // The sheet's grab handle, and a close button as the first stop in its loop.
        out.append(element("span", { class: "handle", "aria-hidden": "true" }));
        const close = element("button", {
          type: "button",
          class: "close",
          "aria-label": labels.close,
        });
        close.append(crossMark());
        close.addEventListener("click", () => this.close(true));
        out.append(close);
      }
      out.append(element("h2", { id: "heading", class: "sr-only" }, labels.trigger));

      const view = state.view;
      const scroller = this.#scroller;
      scroller.replaceChildren();

      if (state.status === "stale" && state.updatedAt !== null) {
        const line = element("div", { class: "stale", role: "status" });
        line.append(element("span", {}, labels.stale(clock(state.updatedAt))));
        const retry = element("button", { type: "button", class: "link" }, labels.retry);
        retry.addEventListener("click", () => void this.#core?.load());
        line.append(retry);
        scroller.append(line);
      }

      if (view === null && state.status === "error") {
        const failed = element("div", { class: "failed", role: "alert" });
        failed.append(element("p", {}, labels.failed));
        const retry = element("button", { type: "button", class: "pill" }, labels.retry);
        retry.addEventListener("click", () => void this.#core?.load());
        failed.append(retry);
        scroller.append(failed);
        out.append(scroller, this.#fade);
        return out;
      }

      if (view === null) {
        // A first visit with nothing kept: the only time the skeleton shows.
        scroller.append(element("p", { class: "heading" }, labels.yours));
        const grid = element("div", { class: "grid", "aria-busy": "true" });
        for (let i = 0; i < SKELETON_TILES; i += 1) {
          const ghost = element("div", { class: "skeleton", "aria-hidden": "true" });
          ghost.append(element("span"), element("span"));
          grid.append(ghost);
        }
        scroller.append(grid);
        out.append(scroller, this.#fade);
        return out;
      }

      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      scroller.append(element("p", { class: "heading", id: "yours" }, labels.yours));
      if (view.yours.length === 0) scroller.append(element("p", { class: "note" }, labels.empty));
      else scroller.append(this.#grid("yours", view.yours, offline));

      if (view.more.length > 0) {
        scroller.append(element("div", { class: "divider", role: "presentation" }));
        scroller.append(element("p", { class: "heading", id: "more" }, labels.more));
        scroller.append(this.#grid("more", view.more, offline));
      }
      this.#fade.replaceChildren(element("span"));
      out.append(scroller, this.#fade);
      return out;
    }

    #grid(group: Group, tiles: ChromeTile[], offline: boolean): HTMLElement {
      const labels = this.#labels;
      const grid = element("div", {
        class: "grid",
        "data-group": group,
        role: "group",
        "aria-labelledby": group,
      });
      for (const tile of tiles) {
        const current = group === "yours" && tile.current;
        const name = offline
          ? labels.offline(tile.displayName)
          : current
            ? labels.here(tile.displayName)
            : group === "more"
              ? labels.join(tile.displayName)
              : tile.displayName;
        const link = element("a", {
          class: "tile",
          href: tile.homeUrl,
          "data-group": group,
          "data-slug": tile.slug,
          tabindex: "-1",
          title: tile.displayName,
          "aria-label": name,
        });
        if (current) link.setAttribute("aria-current", "page");
        if (offline) {
          link.setAttribute("aria-disabled", "true");
          link.addEventListener("click", (event) => event.preventDefault());
        }
        const mark = element("span", { class: "mark" });
        if (tile.iconUrl === null) {
          mark.append(
            element(
              "span",
              { class: "initial", "aria-hidden": "true" },
              tile.displayName.trim().charAt(0).toUpperCase() || "?",
            ),
          );
        } else {
          mark.append(
            element("img", {
              src: tile.iconUrl,
              alt: "",
              width: "44",
              height: "44",
              loading: "lazy",
              decoding: "async",
              referrerpolicy: "no-referrer",
            }),
          );
        }
        if (group === "more") {
          const plus = element("span", { class: "plus", "aria-hidden": "true" });
          plus.append(plusMark());
          mark.append(plus);
        }
        link.append(
          mark,
          element("span", { class: "name", "aria-hidden": "true" }, tile.displayName),
        );
        if (offline)
          link.append(
            element("span", { class: "sub", "aria-hidden": "true" }, labels.offlineShort),
          );
        grid.append(link);
      }
      return grid;
    }
  };
}

/** The time a kept list was made, as the reader's clock writes it. */
function clock(at: number): string {
  const lang =
    typeof document === "undefined" ? undefined : document.documentElement.lang || undefined;
  return new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit" }).format(new Date(at));
}
