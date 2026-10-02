"use client";

import { clsx } from "clsx";
import type { ComponentPropsWithRef } from "react";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "./button-classes.js";

/**
 * A native button in the modern recipe. Enter and Space, and nothing added.
 *
 * **Navigation that looks like a button is a link wearing `buttonClasses`, not
 * this.** A button that navigates is announced as a button and then behaves as
 * a link, so it cannot be opened in a new tab, does not appear in a screen
 * reader's list of links, and middle-click does nothing.
 *
 * **Busy is `aria-busy`, and the label stays.** Console's button fades its
 * label out under a spinner; sheet 09 rules that out for modern, because the
 * words are what tell somebody which action they started and a spinner tells
 * them only that something is happening. The caller may change the words
 * ("Signing in"); this component never removes them.
 *
 * **Busy is not `disabled`.** A disabled button drops focus, so somebody who
 * pressed Schedule with the keyboard would find themselves at the top of the
 * document at the exact moment they most need to know where they are. A busy
 * button keeps focus and swallows the press instead, including the click a
 * browser synthesises when Enter is pressed in a field of the same form, so a
 * second press cannot submit twice.
 */
export interface ButtonProps extends Omit<ComponentPropsWithRef<"button">, "type"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** Waiting on the action this button started. */
  busy?: boolean;
  /**
   * `button` unless asked otherwise, which is the opposite of the platform. A
   * native button inside a form submits it by default, and a "Back" that
   * submits the form it sits in is the most common way that default bites.
   */
  type?: "button" | "submit" | "reset";
}

export function Button({
  variant,
  size,
  block,
  busy = false,
  type = "button",
  className,
  onClick,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      // Both say true or are absent, because `aria-busy="false"` is noise.
      // `aria-disabled` says the press is being ignored, which is the truth
      // while busy, without the focus loss real `disabled` would cause.
      aria-busy={busy || undefined}
      aria-disabled={busy ? true : rest["aria-disabled"]}
      onClick={(event) => {
        if (busy) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      // Appended rather than merged, for the reason `buttonClasses` gives: `cn`
      // would read the type step and the label ink as two colours and drop one.
      className={clsx(buttonClasses({ variant, size, block, busy }), className)}
    >
      {children}
    </button>
  );
}
