"use client";

import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../cn.js";
import { FOCUSABLE, focusablesIn } from "../focus.js";
import { AURORA_POPUP, AURORA_SCRIM } from "./aurora.js";
import { useModal } from "./modal.js";

export interface FormDialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** One sentence under the title: what the popup does to the page behind it. */
  description?: ReactNode;
  /** The form's fields. They scroll; the head and the foot stay put. */
  children: ReactNode;
  /**
   * The buttons, pinned at the foot: Cancel, then the one primary. A sentence may
   * lead. The foot sits outside the scrolling fields, so a submit button names
   * its form: `<Button type="submit" form={formId}>`.
   */
  footer?: ReactNode;
  /** `md` for a form (760 wide), `sm` for a short one or a question (520). */
  size?: "md" | "sm";
  /** `alertdialog` for a question that interrupts something, such as leaving a form. */
  role?: "dialog" | "alertdialog";
  /**
   * Whether Escape and a click on the scrim close it. Pass false while the form
   * holds typed input, so a stray key or click never throws it away; Cancel and
   * the close button still close it.
   */
  dismissible?: boolean;
  /** Where focus starts; left out, on the first field of the body. A question starts on its safe answer. */
  initialFocus?: () => HTMLElement | null;
  /** The close button's name: "Close". Left out, there is no close button (a question that must be answered). */
  closeLabel?: string;
  className?: string;
}

/**
 * A popup that holds a form, so what a form needs is made without leaving it
 * (D158, drawn for GPlatform Legal: add a party from a new agreement, a
 * signatory from a draft, a file from a notice step), and the form behind keeps
 * everything typed into it. Also the question asked before leaving a
 * half-filled form, as an `alertdialog`.
 *
 * **The material is the page's own light**: the auroras inside it as frosted
 * glass over a scrim that holds the page back, so it never reads as a grey card
 * over a lit page. What goes inside paints no ground of its own; a `GlassPanel`
 * in here would be glass on glass.
 *
 * **The modal contract is `useModal`'s**, as the picker's and Go to's: a portal
 * to the body, the page behind still and inert through `aria-modal`, Tab kept
 * inside, focus starting on the first field and going back where it was,
 * Escape and the scrim closing unless `dismissible` is false.
 *
 * **A form inside never submits the form behind it**, though a popup opened
 * from inside a form is declared inside it and React bubbles a portal's
 * events up that tree.
 *
 * Mounted only while open, so every opening starts from its props and an
 * uncontrolled form inside starts empty.
 */
export function FormDialog(props: FormDialogProps) {
  if (!props.open || typeof document === "undefined") return null;
  return createPortal(<FormDialogPanel {...props} />, document.body);
}

function FormDialogPanel({
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  role = "dialog",
  dismissible = true,
  initialFocus,
  closeLabel,
  className,
}: FormDialogProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const scrim = useModal({
    panel,
    onClose,
    dismissible,
    // The first field, not the close button the head puts ahead of it. Rendered first,
    // else the first by the selector alone (a document that lays nothing out).
    focus:
      initialFocus ??
      (() =>
        body.current === null
          ? null
          : (focusablesIn(body.current)[0] ?? body.current.querySelector<HTMLElement>(FOCUSABLE))),
  });
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:pt-[8vh]",
        role === "alertdialog" && "sm:items-center sm:pt-4",
        AURORA_SCRIM,
      )}
      {...scrim}
    >
      <div
        ref={panel}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        {...(description === undefined ? {} : { "aria-describedby": descriptionId })}
        tabIndex={-1}
        // A popup's form is portalled out of the page, but React still bubbles its submit
        // up the tree it was declared in: the page's own form must never hear it.
        onSubmit={(event) => {
          event.stopPropagation();
        }}
        className={cn(
          "flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-m-card border border-m-subtle bg-m-overlay shadow-m-overlay outline-none sm:max-h-[84vh]",
          size === "sm" ? "max-w-[520px]" : "max-w-[760px]",
          AURORA_POPUP,
          className,
        )}
      >
        <div className="flex items-start gap-3 px-5 pt-[18px] pb-3">
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="text-[17px] leading-6 font-semibold tracking-[-0.01em] text-m-ink"
            >
              {title}
            </h2>
            {description === undefined ? null : (
              <p id={descriptionId} className="mt-0.5 text-m-meta text-m-ink-3">
                {description}
              </p>
            )}
          </div>
          {closeLabel === undefined ? null : (
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="grid size-8 shrink-0 place-items-center rounded-full text-[20px] leading-none text-m-ink-2 hover:bg-m-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-m-ring"
            >
              <span aria-hidden="true">×</span>
            </button>
          )}
        </div>
        <div
          ref={body}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto border-t border-m-hairline px-5 pt-[18px] pb-5"
        >
          {children}
        </div>
        {footer === undefined ? null : (
          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-m-hairline px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
