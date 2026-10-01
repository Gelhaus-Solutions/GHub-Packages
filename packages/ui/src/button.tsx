"use client";

import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { buttonVariants, type ButtonVariantProps } from "./button-variants.js";
import { cn } from "./cn.js";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonVariantProps {
  /** Shows a spinner and blocks interaction without changing the button width. */
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    block,
    loading = false,
    iconLeft,
    iconRight,
    children,
    disabled,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, block }), className)}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {/*
        Content keeps its width while loading, so rows do not reflow mid-action.

        Faded rather than hidden. `visibility: hidden` takes the label out of
        the accessibility tree, and the spinner over it is aria-hidden, so a
        button that was doing the thing announced itself as a button with no
        name at all: exactly the moment somebody most wants to know which
        action they started. `opacity: 0` reserves the same width and leaves
        the name where a reader can find it, with aria-busy saying it is
        working.
      */}
      <span className={cn("inline-flex items-center gap-1.5", loading && "opacity-0")}>
        {iconLeft}
        {children}
        {iconRight}
      </span>
      {loading ? (
        <span className="absolute inset-0 grid place-items-center">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        </span>
      ) : null}
    </button>
  );
});
