import type { ReactNode } from "react";
import { cn } from "../cn.js";
import { AURORA_GLASS } from "./aurora.js";

/**
 * A group, under the page head. It groups and it does not decorate.
 *
 * No wash, no icon, no accent: those are the three ways a section starts
 * competing with the thing inside it for attention. A heading, an optional
 * count and a faded rule are the whole of it, which is the narrower job the
 * rename gave it.
 *
 * Renders an `h2` under the page head's `h1`, so the document outline is the
 * screen's actual structure and somebody navigating by heading reaches the
 * groups rather than a flat list of everything.
 *
 * **Two optional slots in the head row, and both stay outside the `h2`.** A
 * note ("next 60 days") qualifies the group and an aside ("All rollouts", or
 * "verified today, 03:05 CEST") acts on it or dates it; neither is the group's
 * name, and inside the heading both would be read every time somebody moves by
 * heading. Without them the head row renders exactly as it always has, so a
 * section that uses neither is unchanged to the class.
 */
export interface SectionProps {
  heading: ReactNode;
  /**
   * How many things are in it. Mono, because it is a figure somebody compares
   * against the list underneath, and optional because a group of one obvious
   * thing does not need counting.
   */
  count?: number;
  /**
   * Quiet words after the count that say what the group covers: "next 60
   * days", "people accept these". Meta in quiet ink, on the heading's baseline.
   */
  note?: ReactNode;
  /**
   * The head row's right end: a verb ("All rollouts") or a dated meta line.
   * The caller's own element and styling. Pushed right, and on a row too
   * narrow for it, it wraps under the heading rather than overflowing it.
   */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Section({ heading, count, note, aside, children, className }: SectionProps) {
  const slotted = note !== undefined || aside !== undefined;
  return (
    <section className={cn("flex flex-col", AURORA_GLASS, className)}>
      <div
        className={cn(
          "flex items-baseline gap-3 border-b border-m-hairline pb-3",
          // Only a row with a slot may wrap, so a row without one keeps the
          // exact classes it has always had.
          slotted ? "flex-wrap gap-y-1" : "",
          // Aurora puts the head inside the glass and drops the rule: the
          // pane's own edge already says where the group starts.
          "aurora:flex-wrap aurora:gap-x-2.5 aurora:gap-y-1 aurora:border-b-0 aurora:px-[18px] aurora:pt-3.5 aurora:pb-2.5",
        )}
      >
        <h2 className="text-m-heading text-m-ink aurora:text-a-h2">{heading}</h2>
        {count === undefined ? null : (
          <span className="font-mono tabular-nums text-m-meta text-m-ink-3 aurora:text-[12px]">
            {count}
          </span>
        )}
        {note === undefined ? null : <span className="text-m-meta text-m-ink-3">{note}</span>}
        {aside === undefined ? null : <div className="ml-auto">{aside}</div>}
      </div>
      {/*
       * `data-m-body` is how a table or a list inside knows it is already on
       * glass: it goes flat and runs to the pane's edges, and when it is the
       * last thing in the group the pane ends on its last row.
       */}
      <div
        data-m-body=""
        className="mt-4 aurora:mt-0 aurora:px-[18px] aurora:pb-4 aurora:has-[>[data-m-flush]:last-child]:pb-0"
      >
        {children}
      </div>
    </section>
  );
}
