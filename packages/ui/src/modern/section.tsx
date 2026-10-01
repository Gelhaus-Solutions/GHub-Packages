import type { ReactNode } from "react";
import { cn } from "../cn.js";

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
 */
export interface SectionProps {
  heading: ReactNode;
  /**
   * How many things are in it. Mono, because it is a figure somebody compares
   * against the list underneath, and optional because a group of one obvious
   * thing does not need counting.
   */
  count?: number;
  children: ReactNode;
  className?: string;
}

export function Section({ heading, count, children, className }: SectionProps) {
  return (
    <section className={cn("flex flex-col", className)}>
      <div className="flex items-baseline gap-3 border-b border-m-hairline pb-3">
        <h2 className="text-m-heading text-m-ink">{heading}</h2>
        {count === undefined ? null : (
          <span className="font-mono tabular-nums text-m-meta text-m-ink-3">{count}</span>
        )}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
