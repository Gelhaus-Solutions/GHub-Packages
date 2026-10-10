import type { ReactNode } from "react";
import { cn } from "../cn.js";

/**
 * Info for held or not yet possible. Crit ONLY for something already lost.
 *
 * The narrowness is the point: almost every refusal is the first kind, and a
 * screen that reaches for crit each time a thing is declined teaches people to
 * ignore the one time something is actually gone.
 */
export type RefusalSeverity = "info" | "crit";

const RULE: Readonly<Record<RefusalSeverity, string>> = {
  info: "border-l-m-info",
  crit: "border-l-m-crit",
};

/* Aurora draws a refusal as a banner in its level: glass lit from the corner. */
const AURORA_RULE: Readonly<Record<RefusalSeverity, string>> = {
  info: "aurora:border-m-info/38 aurora:bg-[linear-gradient(140deg,color-mix(in_oklch,var(--gm-info)_14%,transparent),transparent_60%)]",
  crit: "aurora:border-m-crit/38 aurora:bg-[linear-gradient(140deg,color-mix(in_oklch,var(--gm-crit)_14%,transparent),transparent_60%)]",
};

/**
 * Three parts, always three.
 *
 * **The third is not optional, and it is the whole reason this is a component.**
 * A refusal always names the next action. Title and reason alone leave somebody
 * informed and stuck, which is the state that produces a support ticket saying
 * only "it will not let me". Making `next` required means a screen cannot ship
 * the two-part version by omission, only by deliberately passing something.
 *
 * **Plate rather than a wash**, because a refusal is usually not an emergency
 * and a washed panel says it is. The severity is carried by a 3px rule down the
 * side, which is enough to find and not enough to shout.
 *
 * Three copy rules the component cannot enforce, stated here because they are
 * the ones that get broken and review is what catches them: never "something
 * went wrong", never an exclamation mark, and never a code without a sentence.
 * Every string here comes from the caller through next-intl, so this component
 * has no way to check them.
 */
export interface RefusalProps {
  /** What was refused, in the reader's terms rather than the system's. */
  title: ReactNode;
  /** Why. Not a code, and not an apology. */
  reason: ReactNode;
  /**
   * What to do now. Required: a refusal that names no next action leaves
   * somebody informed and stuck.
   */
  next: ReactNode;
  /** The control that performs `next`, when there is one to press. */
  action?: ReactNode;
  severity?: RefusalSeverity;
  className?: string;
}

export function Refusal({
  title,
  reason,
  next,
  action,
  severity = "info",
  className,
}: RefusalProps) {
  return (
    <div
      className={cn(
        "rounded-m-panel border border-m-subtle border-l-[3px] bg-m-plate p-6",
        RULE[severity],
        "aurora:a-glass aurora:rounded-a-banner aurora:border-l aurora:px-[18px] aurora:py-3.5 aurora:shadow-a-highlight",
        AURORA_RULE[severity],
        className,
      )}
    >
      <p className="text-m-label text-m-ink aurora:text-[14.5px] aurora:leading-[21px]">{title}</p>
      <p className="mt-2 text-m-meta text-m-ink-2 aurora:mt-0.5 aurora:text-[13.5px] aurora:leading-5">
        {reason}
      </p>
      <p className="mt-2 text-m-meta text-m-ink-2 aurora:mt-0.5 aurora:text-[13.5px] aurora:leading-5">
        {next}
      </p>
      {action === undefined ? null : <div className="mt-4 aurora:mt-3">{action}</div>}
    </div>
  );
}
