"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "../cn.js";

/**
 * A block that opens where the reader is, under the verb they pressed.
 *
 * Nineteen call sites need the same thing and wave 7 drew it once, for
 * re-authentication. It is also the shape of confirm in place, show me the
 * secret, and add one without leaving.
 *
 * **If it needs a scrim it is an `Overlay`, and this is the wrong component.**
 * That is the whole boundary. A disclosure does not dim the page, does not trap
 * focus, does not close on an outside click and has no Escape teardown, because
 * all four of those exist to say "deal with me first" and this is not that. It
 * is the next part of the thing already being read.
 *
 * **Nothing above it is disabled, dimmed or scrolled, and nothing is lost.**
 * The panel stays mounted and is hidden when closed rather than unmounted, so a
 * half-typed note survives being closed and reopened. An unmounting disclosure
 * loses a sentence somebody wrote, which is the one failure that makes a person
 * stop trusting the control.
 */
export interface DisclosureProps {
  /** The verb. Rendered as the trigger, and it keeps the caller's own element. */
  label: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}

export function Disclosure({ label, open, onOpenChange, children, className }: DisclosureProps) {
  const panelId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(open);

  useEffect(() => {
    /*
     * Focus moves to the first field when it opens, and only on the transition.
     * Running on every render would drag focus back mid-typing, which is the
     * same defect as a live region announcing on every keystroke.
     *
     * Focus is NOT returned here on close: the trigger is the caller's element
     * and it is still exactly where it was, so the browser's own focus is
     * already correct unless the caller moved it.
     */
    if (open && !wasOpen.current) {
      const first = panel.current?.querySelector<HTMLElement>(
        "input, select, textarea, button, [href], [tabindex]:not([tabindex='-1'])",
      );
      first?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          onOpenChange(!open);
        }}
        className="text-m-control text-m-accent-text"
      >
        {label}
      </button>
      {/*
       * `hidden` rather than conditional rendering. The DOM node stays, so an
       * input's value survives a close, and `hidden` takes it out of the
       * accessibility tree so a screen reader does not read a closed panel.
       */}
      <div
        ref={panel}
        id={panelId}
        hidden={!open}
        className="rounded-m-panel bg-m-plate p-6 shadow-m-plate"
      >
        {children}
      </div>
    </div>
  );
}
