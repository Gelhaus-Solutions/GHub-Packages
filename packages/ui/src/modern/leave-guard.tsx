"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./button.js";
import { FormDialog } from "./form-dialog.js";

export interface LeaveGuardLabels {
  /** The question, naming the form: "Leave the new agreement?". Given where the link goes. */
  title: (href: string) => ReactNode;
  /** What is filled in, and what leaving does with it. */
  body: ReactNode;
  /** The primary: "Stay and finish". */
  stay: string;
  /** "Leave, keep it for later". */
  leave: string;
  /** "Discard it and leave". */
  discard: string;
}

export interface LeaveGuardProps {
  /** Asks only while true: the form differs from what it started from. */
  dirty: boolean;
  labels: LeaveGuardLabels;
  /** Goes where the link pointed, as a router's push. Left out, the browser follows it. */
  navigate?: (href: string) => void;
  /** Before leaving by "discard": drop the kept copy, so nothing is offered back. */
  onDiscard: () => void;
}

/**
 * Where a click on this link would take the page, or null when it does not
 * leave it: another tab or window, a download, a modifier key that opens a new
 * tab, another site, or only another place on this page.
 */
function leavingTo(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const link = target.closest("a[href]");
  if (!(link instanceof HTMLAnchorElement)) return null;
  if (link.hasAttribute("download")) return null;
  if (link.target !== "" && link.target !== "_self") return null;
  const to = new URL(link.href, window.location.href);
  if (to.origin !== window.location.origin) return null;
  if (to.pathname === window.location.pathname && to.search === window.location.search) return null;
  return `${to.pathname}${to.search}${to.hash}`;
}

/**
 * Asks before a half-filled form is left by a link (D158, drawn for GPlatform
 * Legal): the rail, a breadcrumb, a Cancel that is a link, any link on the page.
 * While `dirty`, a click on one that would leave the page is held and a popup
 * asks: stay and finish (the primary), leave and keep it for later, or discard
 * it and leave.
 *
 * **Pair it with `useDraftKeeper`.** The keeper keeps what was typed as it is
 * typed and offers it back on return, so leaving here loses nothing, and its
 * `beforeunload` covers closing the tab. This guard answers the one thing the
 * keeper does not: a click that would leave without a word. Navigation the app
 * makes itself (a router push, the back button) is not a click on a link and
 * is not asked about; the keeper still has the text.
 *
 * The link is caught in the capture phase on the document, ahead of a router's
 * own click handler, so a client-side link is held as surely as a plain one.
 * A link that opens elsewhere or stays on the page is let through.
 */
export function LeaveGuard({ dirty, labels, navigate, onDiscard }: LeaveGuardProps) {
  const [pending, setPending] = useState<string | null>(null);
  const stay = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!dirty) return;
    const onClick = (event: MouseEvent): void => {
      const to = leavingTo(event);
      if (to === null) return;
      event.preventDefault();
      event.stopPropagation();
      setPending(to);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  function go(href: string) {
    setPending(null);
    if (navigate === undefined) window.location.assign(href);
    else navigate(href);
  }

  return (
    <FormDialog
      open={pending !== null}
      onClose={() => setPending(null)}
      role="alertdialog"
      size="sm"
      initialFocus={() => stay.current}
      title={pending === null ? "" : labels.title(pending)}
      footer={
        <>
          <Button
            variant="quiet"
            size={36}
            className="mr-auto"
            onClick={() => {
              if (pending === null) return;
              onDiscard();
              go(pending);
            }}
          >
            {labels.discard}
          </Button>
          <Button
            variant="secondary"
            size={36}
            onClick={() => {
              if (pending !== null) go(pending);
            }}
          >
            {labels.leave}
          </Button>
          <Button ref={stay} variant="primary" size={36} onClick={() => setPending(null)}>
            {labels.stay}
          </Button>
        </>
      }
    >
      <div className="text-m-body text-m-ink-2">{labels.body}</div>
    </FormDialog>
  );
}
