"use client";

import { useEffect, useRef, type MouseEvent, type RefObject } from "react";
import { focusablesIn } from "../focus.js";

export interface ModalOptions {
  /** The panel: Tab goes round inside it. */
  panel: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** Where focus starts. Left out, or answering null: the first focusable in the panel, else the panel. */
  focus?: () => HTMLElement | null;
  /**
   * Whether Escape and a click on the scrim close it. A popup holding typed input
   * passes false while it does, so a stray key or click never throws the input away;
   * its Cancel and its close button still close it.
   */
  dismissible?: boolean;
}

/** What the scrim takes: a press and a release, which close only when both are on it. */
export interface ScrimHandlers {
  onMouseDown: (event: MouseEvent<HTMLElement>) => void;
  onMouseUp: (event: MouseEvent<HTMLElement>) => void;
}

/**
 * The modal contract every popup in modern keeps, Go to's, the picker's and a
 * form's alike: the page behind does not scroll, focus moves in on open and
 * goes back to whatever had it on close, Tab goes round inside the panel,
 * Escape closes, and a click on the scrim closes only when it both starts and
 * ends there, because a drag that began in the panel and ended outside is a
 * text selection. An Escape something inside handled first (an open list,
 * which prevents its default) is left to it.
 *
 * Call it from a component that is mounted only while the popup is open: the
 * effect runs once, on mount, and undoes itself on unmount.
 */
export function useModal({
  panel,
  onClose,
  focus,
  dismissible = true,
}: ModalOptions): ScrimHandlers {
  const close = useRef(onClose);
  const startFocus = useRef(focus);
  const mayDismiss = useRef(dismissible);
  const pressed = useRef(false);
  useEffect(() => {
    close.current = onClose;
    startFocus.current = focus;
    mayDismiss.current = dismissible;
  });

  useEffect(() => {
    const restore = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const node = panel.current;
    const first =
      startFocus.current?.() ?? (node === null ? null : (focusablesIn(node)[0] ?? null));
    (first ?? node)?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (mayDismiss.current) close.current();
        return;
      }
      if (event.key !== "Tab" || panel.current === null) return;
      const focusable = focusablesIn(panel.current);
      const head = focusable[0];
      const tail = focusable[focusable.length - 1];
      if (head === undefined || tail === undefined || focusable.length === 1) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && document.activeElement === head) {
        event.preventDefault();
        tail.focus();
      } else if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault();
        head.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      restore?.focus?.();
    };
    // Once per opening: the popup is mounted only while open.
  }, []);

  return {
    onMouseDown: (event) => {
      pressed.current = event.target === event.currentTarget;
    },
    onMouseUp: (event) => {
      if (pressed.current && event.target === event.currentTarget && mayDismiss.current)
        close.current();
      pressed.current = false;
    },
  };
}
