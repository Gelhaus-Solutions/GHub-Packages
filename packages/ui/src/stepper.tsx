import type { ReactNode } from "react";
import { cn } from "./cn.js";

/**
 * Numbered stations across the top of a flow that has more than one screen.
 *
 * Setup, pairing and restore are all multi-step here and none of them is
 * marked, so an operator halfway through one cannot tell how much is left or
 * what they already answered. The other console has the same three shapes.
 *
 * **A station shows the answer it holds, not just its name.** "Instance" over
 * `acme-lan-01` rather than "Instance" alone. That is what makes going back
 * safe: a person who steps back to check what they chose can see it without
 * opening the step, and a person who is asked to confirm at the end is
 * confirming something they can read.
 *
 * **A blocked station replaces the caller's primary action; it does not disable
 * it.** This component draws the station in warn and says so. What it cannot do
 * is the other half, which belongs to the screen: swap the button for the thing
 * that unblocks it. A disabled button explains nothing, and a person looking at
 * one has no way to find out what would enable it. `Restore` has exactly that
 * disabled button today, which is the case this was written against.
 */
export type StepState = "done" | "current" | "todo" | "blocked";

const station: Record<StepState, string> = {
  done: "border-[color-mix(in_oklch,var(--gc-ok)_50%,transparent)] bg-ok-wash text-ok-ink",
  current: "border-transparent bg-accent text-accent-fg",
  todo: "border-(--gc-border-subtle) bg-base text-fg-tertiary",
  blocked: "border-[color-mix(in_oklch,var(--gc-warn)_50%,transparent)] bg-warn-wash text-warn-ink",
};

const stationLabel: Record<StepState, string> = {
  done: "text-fg-secondary",
  current: "text-fg",
  todo: "text-fg-tertiary",
  blocked: "text-warn-ink",
};

export interface Step {
  /** What the station is called. A noun, not an instruction. */
  label: ReactNode;
  /** The answer this station holds, once it has one. Mono where it is an id. */
  value?: ReactNode;
  state: StepState;
}

function CurrentRule() {
  return (
    <span
      aria-hidden="true"
      className="absolute inset-x-1.5 -bottom-0.5 h-0.5 rounded-full bg-accent"
    />
  );
}

export function Stepper({
  steps,
  hrefFor,
  className,
}: {
  steps: readonly Step[];
  /**
   * Where a station goes, where it can be returned to.
   *
   * Returning `undefined` makes the station text rather than a link, which is
   * the honest rendering for a step that cannot be jumped to yet. A link that
   * goes nowhere and a link that is not a link are different things to a
   * keyboard.
   */
  hrefFor?: (step: Step, index: number) => string | undefined;
  className?: string;
}) {
  return (
    <ol className={cn("flex flex-wrap items-start gap-x-1 gap-y-3", className)}>
      {steps.map((step, index) => {
        const href = hrefFor?.(step, index);
        const last = index === steps.length - 1;

        const body = (
          <>
            <span
              className={cn(
                "numeric grid size-[22px] shrink-0 place-items-center rounded-full border text-3xs font-semibold",
                station[step.state],
              )}
            >
              {step.state === "done" ? (
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              ) : (
                index + 1
              )}
            </span>
            <span className="min-w-0">
              <span
                className={cn(
                  "block truncate text-2xs font-medium leading-[15px]",
                  stationLabel[step.state],
                )}
              >
                {step.label}
              </span>
              {step.value === undefined ? null : (
                // Tertiary rather than disabled: this is the answer somebody
                // came back to read, which makes it content.
                <span className="numeric block truncate text-3xs leading-[14px] text-fg-tertiary">
                  {step.value}
                </span>
              )}
            </span>
          </>
        );

        return (
          <li key={index} className="flex min-w-0 items-start">
            {/*
             * The underline marks where you are, and the fill alone does not:
             * a filled circle reads as "done" at a glance in a row where three
             * other circles are also filled. It is drawn as a positioned rule
             * rather than a bottom border so that arriving at a station does
             * not move the two beside it by two pixels.
             */}
            {href === undefined ? (
              <span
                className="relative flex min-w-0 items-center gap-2 px-1.5 py-1"
                aria-current={step.state === "current" ? "step" : undefined}
              >
                {body}
                {step.state === "current" ? <CurrentRule /> : null}
              </span>
            ) : (
              <a
                href={href}
                aria-current={step.state === "current" ? "step" : undefined}
                className={cn(
                  "relative flex min-w-0 items-center gap-2 rounded-(--radius-md) px-1.5 py-1",
                  "transition-colors duration-(--duration-instant) hover:bg-hover",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--gc-ring)",
                )}
              >
                {body}
                {step.state === "current" ? <CurrentRule /> : null}
              </a>
            )}

            {last ? null : (
              // A rule rather than a chevron. A chevron between stations reads
              // as a control, and this one does nothing.
              <span
                aria-hidden="true"
                className="mx-1 mt-[15px] h-px w-6 shrink-0 bg-(--gc-border-hairline)"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
