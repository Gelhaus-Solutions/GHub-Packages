"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { buttonClasses } from "./button-variants.js";
import { cn } from "./cn.js";
import { focusablesIn } from "./focus.js";

/**
 * A modal dialog, hand-rolled.
 *
 * Used for detail that would otherwise have to live in a table cell. A control
 * plane row should say what state something is in and nothing more; the digest,
 * the signing keys and the buttons that change things belong behind a click,
 * where there is room for them and where a mis-click cannot reach them.
 *
 * What it implements, because none of it is inherited from anywhere:
 *
 *   Escape closes, and the overlay closes on a click that both starts and ends
 *   on it. Checking both ends matters: a drag that begins inside the panel and
 *   releases outside is a text selection, not a dismissal.
 *
 *   Focus moves into the panel on open and returns to whatever had it before,
 *   so a keyboard user is not dropped back at the top of the document. Tab is
 *   trapped inside while it is open.
 *
 *   The page behind does not scroll, and it is inert to a screen reader through
 *   aria-modal.
 *
 * Rendered through a portal so no ancestor's overflow or stacking context can
 * clip it. A dialog opened from inside a scrolling table is exactly the case
 * that breaks otherwise.
 */

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Sub-heading under the title. Kept short: this is context, not prose. */
  eyebrow?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Widen for content that is genuinely wide, such as a table. */
  size?: "md" | "lg";
  /**
   * Props rather than literals: every user-visible string in this product goes
   * through next-intl, and a design-system component has no locale of its own.
   */
  closeLabel?: string;
}

export function Dialog({
  open,
  onClose,
  title,
  eyebrow,
  description,
  children,
  footer,
  size = "md",
  closeLabel = "Close",
}: DialogProps) {
  // Stable across renders and unique per dialog, so two open at once cannot
  // point at each other's heading.
  const baseId = useId();
  const headingId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;

  const panel = useRef<HTMLDivElement>(null);
  const overlayPressed = useRef(false);
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreFocus.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // The panel itself, not the first control: a dialog that opens with a
    // destructive button focused is one keystroke from doing the thing.
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
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8"
      onMouseDown={(event) => {
        overlayPressed.current = event.target === event.currentTarget;
      }}
      onMouseUp={(event) => {
        if (overlayPressed.current && event.target === event.currentTarget) onClose();
        overlayPressed.current = false;
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        // Pointed at the heading rather than copied into a label, because a
        // title is a ReactNode and half of them are not strings: an icon beside
        // a name used to produce a dialog with no accessible name at all, which
        // a screen reader announces as "dialog" and nothing else.
        aria-labelledby={headingId}
        {...(description === undefined ? {} : { "aria-describedby": descriptionId })}
        tabIndex={-1}
        className={cn(
          "relative w-full rounded-(--radius-panel) border border-(--gc-border-hairline)",
          "bg-raised shadow-2xl outline-none",
          size === "lg" ? "max-w-[880px]" : "max-w-[620px]",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-(--gc-border-hairline) px-4 py-3">
          <div className="min-w-0">
            {eyebrow === undefined ? null : (
              <div className="mb-1 text-2xs uppercase tracking-[0.08em] text-fg-tertiary">
                {eyebrow}
              </div>
            )}
            <h2
              id={headingId}
              className="truncate text-sm font-semibold tracking-[-0.01em] text-fg"
            >
              {title}
            </h2>
            {/* No cap on the description. A dialog is 620px or 880px wide and
                already bounds it; 65ch at 12px stops 150px short of the edge,
                which reads as text that got clipped rather than text that
                wrapped. */}
            {description === undefined ? null : (
              <p id={descriptionId} className="mt-1 text-xs text-fg-tertiary">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className={buttonClasses({ variant: "ghost", size: "xs" })}
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="px-4 py-4">{children}</div>

        {footer === undefined ? null : (
          <div className="flex items-center justify-end gap-2 rounded-b-(--radius-panel) border-t border-(--gc-border-hairline) bg-inset px-4 py-2.5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
