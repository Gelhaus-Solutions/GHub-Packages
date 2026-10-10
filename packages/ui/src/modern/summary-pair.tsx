import type { ReactNode } from "react";
import { cn } from "../cn.js";

/**
 * A label over a value, read only. Half of Billing is this.
 *
 * **Read only is the boundary: if it can be edited it is a `FormField`.** The two
 * look similar at a glance and behave nothing alike, and a screen that renders
 * a SummaryPair for something editable has quietly removed the only affordance
 * saying it can be changed.
 *
 * Rendered as a real description list so the pairing survives without sight.
 * `dl`/`dt`/`dd` is what makes "Standing" and "Owner" one fact rather than two
 * strings that happen to be adjacent, and a screen reader can then move by
 * term.
 *
 * **The caller supplies the `dl`.** This renders one pair, wrapped in the `div`
 * that HTML5 permits between a `dl` and its `dt`/`dd` groups, because the
 * layout is two columns at 680 and one under 600 and that grid belongs to the
 * list rather than to a pair. A pair rendered outside a `dl` is invalid and the
 * grouping it exists for is gone, so the wrapper is not optional.
 */
export interface SummaryPairProps {
  label: ReactNode;
  /**
   * Absent is a real state and it is rendered as a sentence, never as a dash.
   *
   * A dash says nothing: a reader cannot tell "we have no address for you" from
   * "this field does not apply to you" from a rendering bug, and those want
   * three different responses. Passing `undefined` therefore requires
   * `emptyText`, so the sentence is a decision somebody made rather than a
   * placeholder the component invented.
   */
  value?: ReactNode;
  /**
   * The sentence shown when `value` is absent. Required in that case, and it
   * comes from the caller because no component here carries a string: every
   * word on screen goes through next-intl at the call site.
   */
  emptyText?: ReactNode;
  /**
   * Mono only for an identifier, a date, a figure or money. A label naming a
   * value is not mono: it is a word being read, not a figure being lined up.
   */
  mono?: boolean;
  className?: string;
}

export function SummaryPair({
  label,
  value,
  emptyText,
  mono = false,
  className,
}: SummaryPairProps) {
  const absent = value === undefined || value === null;

  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-m-meta text-m-ink-3 aurora:text-[12px] aurora:leading-4">{label}</dt>
      <dd
        className={cn(
          "mt-1 text-m-body aurora:mt-[3px] aurora:leading-5",
          mono && !absent ? "font-mono tabular-nums" : "",
          // The empty sentence is quieter than a value, because it is
          // explanation rather than data and must not be mistaken for one.
          absent ? "text-m-ink-3" : "text-m-ink",
        )}
      >
        {absent ? emptyText : value}
      </dd>
    </div>
  );
}
