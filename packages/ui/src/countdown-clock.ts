/**
 * How long is left, worked out from a deadline rather than counted down.
 *
 * The decision this module exists for is that one. A component that decrements
 * a number every second is wrong in two ways that only show up in use: it
 * drifts, because a browser interval is not a second, and it stops entirely
 * when the tab is in the background, so somebody who looks away for the whole
 * wait comes back to a control that is still disabled and a number that has
 * barely moved. Reading the wall clock each tick has neither problem, and it is
 * one line different to write.
 *
 * In a `.ts` rather than beside the component: this package compiles with
 * `jsx: preserve`, so a test importing a `.tsx` cannot be parsed at all.
 */

/**
 * Whole seconds left until `deadline`, never negative.
 *
 * Rounded up, so a wait of "one second" is displayed for the whole of that
 * second rather than showing zero for most of it. A control re-enabled at zero
 * is then re-enabled when the wait is genuinely over.
 */
export function remainingSeconds(deadlineMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}

/** Whether the wait is over, which is the moment the control comes back. */
export function isFinished(deadlineMs: number, nowMs: number): boolean {
  return remainingSeconds(deadlineMs, nowMs) === 0;
}
