import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.js";

/**
 * Status vocabulary, used everywhere state is shown. Colour is never decorative
 * in this system: if something is amber, it means degraded, and nothing else is
 * allowed to borrow the colour.
 */
export type Status = "ok" | "warn" | "crit" | "info" | "locked" | "idle";

const dot = cva("inline-block shrink-0 rounded-full", {
  variants: {
    status: {
      ok: "bg-ok",
      warn: "bg-warn",
      crit: "bg-crit",
      info: "bg-info",
      locked: "bg-locked",
      idle: "bg-idle",
    },
    size: { sm: "size-1.5", md: "size-2", lg: "size-2.5" },
  },
  defaultVariants: { status: "idle", size: "md" },
});

export interface StatusDotProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof dot> {
  /** Adds a slow pulse. Reserve it for genuinely live values. */
  pulse?: boolean;
  label?: string;
}

export function StatusDot({
  status,
  size,
  pulse = false,
  label,
  className,
  ...props
}: StatusDotProps) {
  return (
    <span className={cn("relative inline-flex items-center", className)} {...props}>
      {pulse ? (
        <span
          className={cn(
            dot({ status, size }),
            "absolute animate-ping opacity-60 motion-reduce:hidden",
          )}
          aria-hidden="true"
        />
      ) : null}
      <span
        className={dot({ status, size })}
        role={label === undefined ? "presentation" : "img"}
        aria-label={label}
      />
    </span>
  );
}

const badge = cva(
  [
    "inline-flex items-center gap-1.5 border font-medium whitespace-nowrap",
    "tracking-[0.02em] uppercase",
  ],
  {
    variants: {
      // The text takes `-ink` rather than the status colour, because it is text
      // on a wash and owes 4.5:1 where the colour itself owes the 3:1 of a
      // graphic. The border and the wash still take the status: they are not
      // text, and the ink exists so that they did not have to move.
      status: {
        ok: "text-ok-ink border-[color-mix(in_oklch,var(--gc-ok)_35%,transparent)] bg-ok-wash",
        warn: "text-warn-ink border-[color-mix(in_oklch,var(--gc-warn)_35%,transparent)] bg-warn-wash",
        crit: "text-crit-ink border-[color-mix(in_oklch,var(--gc-crit)_35%,transparent)] bg-crit-wash",
        info: "text-info-ink border-[color-mix(in_oklch,var(--gc-info)_35%,transparent)] bg-info-wash",
        locked:
          "text-locked-ink border-[color-mix(in_oklch,var(--gc-locked)_35%,transparent)] bg-locked-wash",
        idle: "text-idle-ink border-(--gc-border-subtle) bg-idle-wash",
        accent:
          "text-accent-ink border-[color-mix(in_oklch,var(--gc-accent)_35%,transparent)] bg-accent-wash",
      },
      size: {
        sm: "h-4 px-1.5 text-[0.625rem] rounded-(--radius-xs)",
        md: "h-5 px-2 text-2xs rounded-(--radius-sm)",
      },
    },
    defaultVariants: { status: "idle", size: "md" },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badge> {
  icon?: ReactNode;
}

export function Badge({ status, size, icon, className, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badge({ status, size }), className)} {...props}>
      {icon}
      {children}
    </span>
  );
}

/** Dot plus label, the standard way a row reports condition. */
export function StatusLabel({
  status,
  children,
  pulse,
  className,
}: {
  status: Status;
  children: ReactNode;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm text-fg-secondary", className)}>
      <StatusDot status={status} pulse={pulse} />
      {children}
    </span>
  );
}
