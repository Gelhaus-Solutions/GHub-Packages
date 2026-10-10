import type { CSSProperties, ReactNode } from "react";
import { cn } from "../cn.js";

/**
 * Where a step stands. `next` is still to come; `skip` will never happen on
 * this path (a sub-processor objected to never goes live); `stop` is where
 * the path ended early.
 */
export type StepState = "done" | "now" | "next" | "stop" | "skip";

export interface LifecycleStep {
  key: string;
  label: ReactNode;
  state: StepState;
  /** The word under it, in the state's ink: "ends 20 Oct", "Objected", "never". */
  sub?: ReactNode;
  /** When, in mono: "6 Oct", "4 Oct, 09:12". */
  at?: ReactNode;
  /**
   * What the circle shows instead of the step's number: a signer's initials,
   * a document or lock icon. `done` keeps its check and `stop` its cross, so
   * the state is never carried by colour alone.
   */
  mark?: ReactNode;
}

export interface LifecycleStepperProps {
  steps: readonly LifecycleStep[];
  /** Names the ordered list of steps. */
  label?: string;
  className?: string;
}

const CIRCLE: Readonly<Record<StepState, string>> = {
  done: "bg-m-ok text-m-accent-on shadow-[0_0_16px_-4px_var(--gm-ok)]",
  // The washes are laid over the ground as an image, so the track behind does
  // not show through a circle.
  now: "border-2 border-m-accent bg-[linear-gradient(var(--gm-accent-wash),var(--gm-accent-wash))] text-m-accent-text shadow-[0_0_18px_-4px_var(--gm-accent)]",
  stop: "border-[1.5px] border-m-crit bg-[linear-gradient(var(--gm-crit-wash),var(--gm-crit-wash))] text-m-crit-ink",
  next: "border border-dashed border-m-strong text-m-ink-3",
  skip: "border border-dashed border-m-strong text-m-ink-3",
};

const SUB: Readonly<Record<StepState, string>> = {
  done: "text-m-ok-ink",
  now: "text-m-accent-text",
  stop: "text-m-crit-ink",
  next: "text-m-ink-3",
  skip: "text-m-ink-3",
};

function Check() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}

function Cross() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/**
 * A fixed path as steps (K8): done, now, next, stopped, skipped. For a
 * sub-processor's life, a breach's notifications, an agreement's signatures.
 *
 * An ordered list with `aria-current="step"` on the current one. The circle
 * shows a check, a number (or the caller's mark) or a cross, and the word
 * under it says the state again, so nothing rests on colour. The track behind
 * the circles fills from ok to accent up to the last step reached. On a phone
 * the steps stack, circle beside text, and the track goes.
 */
export function LifecycleStepper({ steps, label = "Steps", className }: LifecycleStepperProps) {
  const count = steps.length;
  let last = -1;
  steps.forEach((step, index) => {
    if (step.state === "done" || step.state === "now" || step.state === "stop") last = index;
  });
  // The track runs from the middle of the first circle to the middle of the
  // last, so it is inset by half a column at each end.
  const inset = count === 0 ? 0 : 50 / count;
  const fill = last <= 0 || count < 2 ? 0 : (last / (count - 1)) * (100 - 100 / count);

  return (
    <ol
      aria-label={label}
      className={cn(
        "relative grid grid-cols-[repeat(var(--m-steps),minmax(0,1fr))] gap-y-3.5 max-sm:grid-cols-1",
        className,
      )}
      style={{ "--m-steps": String(Math.max(count, 1)) } as CSSProperties}
    >
      <span
        aria-hidden="true"
        className="absolute top-[17px] h-0.5 rounded-[2px] bg-m-hairline max-sm:hidden"
        style={{ left: `${String(inset)}%`, right: `${String(inset)}%` }}
      />
      <span
        aria-hidden="true"
        className="absolute top-[17px] h-0.5 rounded-[2px] bg-[linear-gradient(90deg,var(--gm-ok),var(--gm-accent))] shadow-[0_0_12px_color-mix(in_oklch,var(--gm-accent)_60%,transparent)] max-sm:hidden"
        style={{ left: `${String(inset)}%`, width: `${String(fill)}%` }}
      />
      {steps.map((step, index) => (
        <li
          key={step.key}
          aria-current={step.state === "now" ? "step" : undefined}
          className="relative flex flex-col items-center gap-0.5 px-1.5 text-center max-sm:flex-row max-sm:items-start max-sm:gap-3 max-sm:px-0 max-sm:text-left"
        >
          <span
            className={cn(
              "relative grid size-9 shrink-0 place-items-center rounded-full bg-m-ground text-[12px] leading-none font-semibold",
              CIRCLE[step.state],
            )}
          >
            {step.state === "done" ? (
              <Check />
            ) : step.state === "stop" ? (
              <Cross />
            ) : (
              (step.mark ?? String(index + 1))
            )}
          </span>
          <span className="flex min-w-0 flex-col items-center max-sm:items-start">
            <span
              className={cn(
                "mt-2 text-[14px] leading-[19px] font-medium max-sm:mt-0",
                step.state === "next" || step.state === "skip" ? "text-m-ink-3" : "text-m-ink",
              )}
            >
              {step.label}
            </span>
            {step.sub === undefined ? null : (
              <span className={cn("text-[12px] leading-4", SUB[step.state])}>{step.sub}</span>
            )}
            {step.at === undefined ? null : (
              <span className="font-mono text-[11.5px] leading-4 text-m-ink-3 tabular-nums">
                {step.at}
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
