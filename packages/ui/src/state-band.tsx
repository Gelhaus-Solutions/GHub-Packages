import type { ReactNode } from "react";
import { cn } from "./cn.js";
import type { Status } from "./status.js";

/**
 * A full-width band for a fact about the whole session.
 *
 * Not a notification and not dismissible, because it is not an event. It says
 * something is true right now that changes what every screen underneath it
 * means: a deployment is contained, a lease is in grace, a support session is
 * open, staff are reading a customer's own portal, a host is signing with a
 * development key. Each of those is currently a badge in a header on one screen,
 * which is the same failure the readout band was built to fix one level down.
 *
 * There is no close button, and that is the point. A person who dismissed this
 * would still be inside the state, and the next screen would look ordinary.
 *
 * **Its inner container is the viewport minus a gutter, never the reading
 * column.** A band that says a customer is being read cannot be the thing that
 * truncates, and a portal centred at 880px would put this sentence in a column
 * narrower than the screens it is a warning about.
 */
export interface StateBandProps {
  /** Never `ok`. A band exists to say something is not ordinary. */
  status: Extract<Status, "warn" | "crit" | "info" | "locked">;
  /** What the state is called. Short: it is a name, not the sentence. */
  label: ReactNode;
  /** The sentence. What is true, and what it means for what is underneath. */
  children?: ReactNode;
  /** A mono fact that qualifies it: who, since when, under what reference. */
  meta?: ReactNode;
  /** The one way out, where there is one. */
  action?: ReactNode;
  /**
   * Draws a ring around the viewport in the same colour.
   *
   * For a state that has to be visible from any scroll position rather than
   * only from the top of the page. Staff reading a customer's portal is the
   * case: the band scrolls away, and without the ring the next screenshot they
   * take looks like the customer's own.
   */
  frame?: boolean;
  className?: string;
}

const bandSurface: Record<StateBandProps["status"], string> = {
  warn: "bg-warn-wash border-[color-mix(in_oklch,var(--gc-warn)_35%,transparent)]",
  crit: "bg-crit-wash border-[color-mix(in_oklch,var(--gc-crit)_35%,transparent)]",
  info: "bg-info-wash border-[color-mix(in_oklch,var(--gc-info)_35%,transparent)]",
  locked: "bg-locked-wash border-[color-mix(in_oklch,var(--gc-locked)_35%,transparent)]",
};

// Text, so `-ink`. The band's border and wash keep the status colour itself:
// they are not text and owe 3:1 rather than 4.5.
const bandInk: Record<StateBandProps["status"], string> = {
  warn: "text-warn-ink",
  crit: "text-crit-ink",
  info: "text-info-ink",
  locked: "text-locked-ink",
};

const frameRing: Record<StateBandProps["status"], string> = {
  warn: "border-[color-mix(in_oklch,var(--gc-warn)_45%,transparent)]",
  crit: "border-[color-mix(in_oklch,var(--gc-crit)_45%,transparent)]",
  info: "border-[color-mix(in_oklch,var(--gc-info)_45%,transparent)]",
  locked: "border-[color-mix(in_oklch,var(--gc-locked)_45%,transparent)]",
};

export function StateBand({
  status,
  label,
  children,
  meta,
  action,
  frame = false,
  className,
}: StateBandProps) {
  return (
    <>
      <div role="status" className={cn("border-b px-8 py-3", bandSurface[status], className)}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            {/*
             * The label is the `lg` step at 600 rather than something smaller.
             * A status colour on its own wash is the thinnest contrast pairing
             * in the palette, and this is the one place it carries a word
             * somebody has to read rather than a dot beside one.
             */}
            <span className={cn("text-lg font-semibold tracking-[-0.02em]", bandInk[status])}>
              {label}
            </span>
            {children === undefined ? null : (
              // Primary rather than the status colour: the sentence is the part
              // being read, and reading a paragraph in a status colour is
              // harder than reading it in the text colour beside a coloured
              // heading that already said which kind of state this is.
              <p className="mt-1 max-w-[88ch] text-xs text-fg">{children}</p>
            )}
            {meta === undefined ? null : (
              <p className="numeric mt-1.5 text-2xs text-fg-secondary">{meta}</p>
            )}
          </div>
          {action === undefined ? null : <div className="shrink-0">{action}</div>}
        </div>
      </div>

      {frame ? (
        <div
          aria-hidden="true"
          className={cn("pointer-events-none fixed inset-0 z-40 border-2", frameRing[status])}
        />
      ) : null}
    </>
  );
}
