"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn.js";
import { focusablesIn } from "./focus.js";

/**
 * An edge drawer, for the screens too narrow to hold a rail.
 *
 * Below `lg` the navigation rail is `hidden` in this product and nothing
 * replaces it, so on a phone there is no way to reach another screen at all.
 * The other console has the same rail and the same gap. This is where the same
 * groups go, at touch size.
 *
 * **Not a `Dialog` with different geometry.** A dialog is modal because it is
 * asking something and the answer has to come before anything else. A sheet is
 * modal only because it is covering the screen: it is navigation, or an
 * inspector beside a thing. So it takes `title` rather than demanding one, it
 * closes on the scrim without ceremony, and it has no footer for actions,
 * because a drawer whose bottom edge holds buttons is a dialog that has not
 * admitted it.
 *
 * What it does share is the part that has to be identical everywhere: focus
 * moves in on open, Tab is trapped, Escape closes, and focus returns to the
 * control that opened it. That comes from `focusablesIn`, the same selector the
 * dialog and the popover use, so the three cannot drift apart about what counts
 * as focusable.
 *
 * **Dragging to dismiss is deliberately not implemented.** A drag handler that
 * competes with the page's own scrolling is the kind of thing that works in a
 * demo and fails on a real device held one-handed, and it cannot be verified
 * here: this repo has no device lab and a synthetic touch event is not the
 * proof it would look like. The scrim, the close button and Escape are three
 * ways out that can all be checked. Adding the fourth needs a device and
 * somebody holding it.
 */
export interface SheetProps {
  side?: "left" | "right" | "bottom";
  open: boolean;
  onClose: () => void;
  /** Names the drawer. Omit only where the content names itself. */
  title?: ReactNode;
  children: ReactNode;
  /**
   * Props rather than literals: every user-visible string in this product goes
   * through next-intl, and a design-system component has no locale of its own.
   */
  closeLabel?: string;
  className?: string;
}

const panelPosition: Record<NonNullable<SheetProps["side"]>, string> = {
  left: "inset-y-0 left-0 h-full w-[min(84vw,320px)] border-r",
  right: "inset-y-0 right-0 h-full w-[min(84vw,380px)] border-l",
  // Capped rather than full height: a bottom sheet that reaches the top edge is
  // a page, and the strip of scrim above it is what says the thing behind is
  // still there and still where you left it.
  bottom: "inset-x-0 bottom-0 max-h-[85vh] w-full rounded-t-(--radius-panel) border-t",
};

export function Sheet({
  side = "left",
  open,
  onClose,
  title,
  closeLabel = "Close",
  children,
  className,
}: SheetProps) {
  const baseId = useId();
  const headingId = `${baseId}-title`;
  const panel = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreFocus.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // The panel, not its first link. A drawer that opens with the first
    // navigation item focused reads to a screen reader as though it has already
    // moved somewhere.
    panel.current?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || panel.current === null) return;

      const focusable = focusablesIn(panel.current);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      restoreFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        aria-hidden="true"
        onClick={onClose}
        // No entrance animation: this theme defines no keyframes, and
        // `animate-[fade-in]` would name one that does not exist and silently
        // do nothing, which is worse than being still.
        className="absolute inset-0 bg-black/60"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        {...(title === undefined ? {} : { "aria-labelledby": headingId })}
        tabIndex={-1}
        className={cn(
          "absolute flex flex-col border-(--gc-border-hairline) bg-raised shadow-2xl outline-none",
          "aurora:a-glass-menu aurora:border-a-edge-pill aurora:shadow-a-menu",
          panelPosition[side],
          className,
        )}
      >
        {title === undefined ? null : (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-(--gc-border-hairline) px-4 py-3 aurora:border-m-hairline">
            <h2
              id={headingId}
              className="truncate text-sm font-semibold tracking-[-0.01em] text-fg aurora:text-a-h2 aurora:text-m-ink"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className={cn(
                // 44px of target inside a 30px-looking control: the visible box
                // is the design and the hit area is what a thumb needs.
                "-m-2 grid size-11 shrink-0 place-items-center rounded-(--radius-md) text-fg-tertiary",
                "transition-colors duration-(--duration-instant) hover:bg-hover hover:text-fg",
                "aurora:rounded-full aurora:text-m-ink-3 aurora:hover:bg-m-hover aurora:hover:text-m-ink",
                "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--gc-ring)",
              )}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
