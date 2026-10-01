import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.js";

/**
 * Surfaces. Elevation is a luminance step plus a hairline border, never a drop
 * shadow: shadows read as plastic on a dark canvas, and this is meant to read as
 * instrument glass.
 */
export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Removes internal padding, for panels that own a table or a chart. */
  flush?: boolean;
  /** Pulls the panel forward, for the one thing that matters on a screen. */
  emphasis?: boolean;
}

export function Panel({
  flush = false,
  emphasis = false,
  className,
  children,
  ...props
}: PanelProps) {
  return (
    <div
      className={cn(
        "bg-raised border border-(--gc-border-hairline) rounded-(--radius-panel)",
        emphasis && "border-[color-mix(in_oklch,var(--gc-accent)_28%,transparent)]",
        !flush && "p-4",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// `title` is omitted from the DOM attributes on purpose: the HTML title attribute
// is a string, and this one is a node. Keeping both would silently narrow it.
export interface PanelHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: ReactNode;
  /** Small uppercase kicker above the title. Use for section context, not decoration. */
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export function PanelHeader({
  title,
  eyebrow,
  description,
  actions,
  className,
  ...props
}: PanelHeaderProps) {
  return (
    <div
      className={cn(
        // Actions sit against the middle of the heading block, not its first
        // line. A one-line header and a three-line one then put their buttons
        // in visually the same place down a column of panels, which is what
        // makes a stack of them scan as a stack.
        "flex items-center justify-between gap-4 px-4 py-3 border-b border-(--gc-border-hairline)",
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        {eyebrow === undefined ? null : (
          <div className="text-2xs uppercase tracking-[0.08em] text-fg-tertiary mb-1">
            {eyebrow}
          </div>
        )}
        <h2 className="text-sm font-semibold tracking-[-0.01em] text-fg truncate">{title}</h2>
        {description === undefined ? null : (
          // No cap here, and none on the page intros either. A description
          // held short above content three times its width reads as truncated
          // rather than as wrapped, whatever the number is: 65ch at 12px is
          // 470px and looks clipped, and so does any other cap that stops
          // short of the thing underneath it. The column the shell gives us is
          // the bound.
          <p className="mt-1 text-xs text-fg-tertiary">{description}</p>
        )}
      </div>
      {actions === undefined ? null : (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  );
}

export function PanelBody({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("p-4", className)} {...props}>
      {children}
    </div>
  );
}

export function PanelFooter({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-2.5 border-t border-(--gc-border-hairline) bg-inset rounded-b-(--radius-panel)",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** Label above, value below. The workhorse of every detail screen. */
export function Field({
  label,
  value,
  mono = false,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  /** Set for anything a human might compare: ids, digests, counts, durations. */
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-2xs uppercase tracking-[0.08em] text-fg-tertiary">{label}</dt>
      <dd className={cn("mt-1 text-sm text-fg truncate", mono && "numeric text-[0.8125rem]")}>
        {value}
      </dd>
    </div>
  );
}

export function FieldGrid({ className, children, ...props }: HTMLAttributes<HTMLDListElement>) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3", className)} {...props}>
      {children}
    </dl>
  );
}

/** Empty states say what to do next, never just "nothing here". */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-12 px-6 text-center",
        className,
      )}
    >
      {icon === undefined ? null : <div className="text-fg-tertiary [&>svg]:size-6">{icon}</div>}
      <div>
        <p className="text-sm font-medium text-fg">{title}</p>
        {description === undefined ? null : (
          <p className="mt-1 text-xs text-fg-tertiary max-w-sm mx-auto">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
