/**
 * The two header controls as custom elements, and the one call that defines both.
 *
 * Safe to import on a server: nothing touches the DOM until a define call runs
 * in a browser.
 */

import type { ChromeCore } from "../core.js";
import {
  defineAccountElement,
  type AccountItem,
  type AccountLabels,
  type AccountOrganisation,
  type AccountPerson,
  type SignOutHandler,
  type SwitchHandler,
} from "./account.js";
import { defineAppsElement, type AppsLabels } from "./apps.js";

/** What `<gp-apps>` offers its page. */
export interface AppsElement extends HTMLElement {
  get core(): ChromeCore | null;
  set core(next: ChromeCore | null);
  get labels(): AppsLabels;
  set labels(next: Partial<AppsLabels>);
  readonly open: boolean;
  show(): void;
  close(returnFocus: boolean): void;
}

/** What `<gp-account>` offers its page. */
export interface AccountElement extends HTMLElement {
  get core(): ChromeCore | null;
  set core(next: ChromeCore | null);
  get person(): AccountPerson | null;
  set person(next: AccountPerson | null);
  get organisations(): AccountOrganisation[];
  set organisations(next: AccountOrganisation[] | null);
  product: string | null;
  viaIdentity: boolean;
  onSignOut: SignOutHandler | null;
  onSwitch: SwitchHandler | null;
  get items(): AccountItem[];
  set items(next: AccountItem[] | null);
  get labels(): AccountLabels;
  set labels(next: Partial<AccountLabels>);
  readonly open: boolean;
  show(): void;
  close(returnFocus: boolean): void;
}

declare global {
  interface HTMLElementTagNameMap {
    "gp-apps": AppsElement;
    "gp-account": AccountElement;
  }
}

/** Defines `<gp-apps>` and `<gp-account>`, each once. */
export function defineChromeElements(): void {
  defineAppsElement();
  defineAccountElement();
}

export {
  ACCOUNT_LABELS,
  createAccountElementClass,
  defineAccountElement,
  iconOf,
  type AccountItem,
  type AccountLabels,
  type AccountOrganisation,
  type AccountPerson,
  type SignOutHandler,
  type SwitchHandler,
} from "./account.js";
export { APPS_LABELS, createAppsElementClass, defineAppsElement, type AppsLabels } from "./apps.js";
