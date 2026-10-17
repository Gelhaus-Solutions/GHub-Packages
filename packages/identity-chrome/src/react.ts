"use client";

/**
 * @ghub/identity-chrome/react
 *
 * The two header controls for a React page: each renders its custom element and
 * hands it what it needs as properties after mounting, because a core, a person
 * and a callback are objects and an attribute can carry only a string. The
 * elements do the drawing, the keyboard and the accessibility; these wrappers
 * only connect them.
 */

import { createElement, useEffect, useRef, type ReactElement } from "react";
import type { ChromeCore } from "./core.js";
import type {
  AccountElement,
  AccountItem,
  AccountLabels,
  AccountOrganisation,
  AccountPerson,
  AppsElement,
  AppsLabels,
  SignOutHandler,
  SwitchHandler,
} from "./elements/index.js";
import { defineChromeElements } from "./elements/index.js";

/** Which edge of the trigger the popup lines up with. The end, by default. */
type Align = "start" | "end";
/** Whether the popup opens below the trigger (a top bar) or above it (the bottom of a sidebar). Below, by default. */
type Placement = "bottom" | "top";

export interface GpAppsProps {
  core: ChromeCore | null;
  labels?: Partial<AppsLabels>;
  align?: Align;
  placement?: Placement;
  className?: string;
}

/** `<gp-apps>`, the apps picker. */
export function GpApps({ core, labels, align, placement, className }: GpAppsProps): ReactElement {
  const ref = useRef<AppsElement>(null);
  useEffect(() => {
    defineChromeElements();
  }, []);
  useEffect(() => {
    if (ref.current !== null) ref.current.core = core;
  }, [core]);
  useEffect(() => {
    if (ref.current !== null && labels !== undefined) ref.current.labels = labels;
  }, [labels]);
  return createElement("gp-apps", { ref, className, align, placement });
}

export interface GpAccountProps {
  core: ChromeCore | null;
  /** Who is signed in, from the product's own session. Nothing renders without one. */
  person: AccountPerson | null;
  organisations?: AccountOrganisation[] | null;
  /** The product's own name, from its catalogue entry. */
  product?: string | null;
  /** The product signs in through Identity, so signing out ends both. */
  viaIdentity?: boolean;
  onSignOut?: SignOutHandler | null;
  onSwitch?: SwitchHandler | null;
  /** The product's own items, after the organisations. */
  items?: AccountItem[] | null;
  labels?: Partial<AccountLabels>;
  /** `row` for the bottom of a sidebar: the picture with the name over the address, full width. */
  layout?: "button" | "row";
  align?: Align;
  placement?: Placement;
  className?: string;
}

/** `<gp-account>`, the account popup. */
export function GpAccount({
  core,
  person,
  organisations = null,
  product = null,
  viaIdentity = false,
  onSignOut = null,
  onSwitch = null,
  items = null,
  labels,
  layout,
  align,
  placement,
  className,
}: GpAccountProps): ReactElement {
  const ref = useRef<AccountElement>(null);
  useEffect(() => {
    defineChromeElements();
  }, []);
  useEffect(() => {
    if (ref.current !== null) ref.current.core = core;
  }, [core]);
  useEffect(() => {
    if (ref.current !== null) ref.current.person = person;
  }, [person]);
  useEffect(() => {
    if (ref.current !== null) ref.current.organisations = organisations;
  }, [organisations]);
  useEffect(() => {
    if (ref.current !== null) ref.current.product = product;
  }, [product]);
  useEffect(() => {
    if (ref.current !== null) ref.current.viaIdentity = viaIdentity;
  }, [viaIdentity]);
  useEffect(() => {
    if (ref.current !== null) ref.current.onSignOut = onSignOut;
  }, [onSignOut]);
  useEffect(() => {
    if (ref.current !== null) ref.current.onSwitch = onSwitch;
  }, [onSwitch]);
  useEffect(() => {
    if (ref.current !== null) ref.current.items = items;
  }, [items]);
  useEffect(() => {
    if (ref.current !== null && labels !== undefined) ref.current.labels = labels;
  }, [labels]);
  return createElement("gp-account", { ref, className, layout, align, placement });
}
