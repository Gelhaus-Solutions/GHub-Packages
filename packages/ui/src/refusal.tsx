import type { ReactNode } from "react";
import { cn } from "./cn.js";
import type { Status } from "./status.js";

/**
 * A no, in four parts, in this order and no other.
 *
 * What was refused, why in terms the reader can act on, the next action as a
 * sentence, and then the next action as a control. Nine screens in the GPlatform
 * SSO bundle are this shape, which is enough places for it to drift, and drift
 * in a refusal is not cosmetic: the part that goes missing first is the third
 * one, and a refusal without it is an error message.
 *
 * `EmptyState` is the nearest thing here and it is about a list with nothing in
 * it, which is a different event. An empty list is a place somebody has arrived
 * at too early. A refusal is something they asked for and did not get, and it
 * owes them a way onward.
 *
 * **The rule takes the severity and the button does not.** That is the rule
 * worth stating, because the instinct is to make a critical refusal's button
 * red. The accent primary here is the escape rather than a retry of the thing
 * that failed, and the escape is the thing to press. A crit button would say
 * "this control is dangerous" about the one control on the screen that is safe.
 *
 * The default rule is `crit`, which is unlike `ConsequenceList`, whose default
 * is neutral. A consequence is a fact about an action somebody is choosing; a
 * refusal already happened. Where nothing is wrong and nothing is degraded, pass
 * `idle` and the rule goes neutral: A10's "that is already done" is that case,
 * and the status ramp has nothing to say about work that is finished.
 */

export interface RefusalProps {
  /** What was refused. One line, and never an error code. */
  title: ReactNode;
  /**
   * Why, in terms the reader can act on.
   *
   * Never a rule quoted for its own sake. "That is your primary address" rather
   * than "constraint violated", and never a code standing in for a sentence.
   */
  reason?: ReactNode;
  /**
   * The next action, as a sentence, naming the specific thing.
   *
   * The part that goes missing first and the part that makes this a refusal
   * rather than a complaint. "Make another verified address primary first", not
   * "try again later".
   */
  next?: ReactNode;
  /**
   * The next action as a control. At most one, and it is the way out.
   *
   * Not a retry of the thing that failed: pressing the same button again is
   * what somebody does when a screen gives them nothing else, and it is what
   * this part exists to save them from.
   */
  action?: ReactNode;
  /** One more, and it is a way back rather than a second attempt. */
  back?: ReactNode;
  /**
   * How bad this is. Colours the rule and nothing else.
   *
   * `idle` for a refusal where nothing is actually wrong, which is rarer than it
   * sounds and is worth reaching for when it is true.
   */
  severity?: Status;
  className?: string;
}

const rules: Record<Status, string> = {
  crit: "bg-crit",
  warn: "bg-warn",
  info: "bg-info",
  ok: "bg-ok",
  locked: "bg-locked",
  // The idle token, like every other severity here, now that P7 is fixed.
  //
  // This rule used to be drawn in `--gc-border-subtle` to avoid `--gc-idle`,
  // which measured 2.55:1 against the base surface while this rule stands alone
  // with no label beside it. The avoidance was the wrong way round and it is
  // worth saying why: `--gc-border-subtle` is a decorative boundary token held
  // only to "perceptible", and it measures 1.37:1 in dark and 1.44:1 in light.
  // So the mitigation drew the one arrangement that needed to be seen at under
  // half the contrast of the token it was avoiding.
  //
  // `--gc-idle` is 3.85:1 and 3.90:1 now and clears 1.4.11 on every surface.
  idle: "bg-idle",
};

export function Refusal({
  title,
  reason,
  next,
  action,
  back,
  severity = "crit",
  className,
}: RefusalProps) {
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <span
        aria-hidden="true"
        className={cn("shrink-0 w-[3px] self-stretch min-h-8 rounded-full", rules[severity])}
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-fg">{title}</p>
        {reason === undefined ? null : (
          <p className="mt-1.5 text-xs leading-relaxed text-fg-secondary">{reason}</p>
        )}
        {next === undefined ? null : (
          <p className="mt-2 text-xs leading-relaxed text-fg-tertiary">{next}</p>
        )}
        {action === undefined && back === undefined ? null : (
          <div className="mt-3.5 flex flex-wrap gap-2">
            {action}
            {back}
          </div>
        )}
      </div>
    </div>
  );
}
