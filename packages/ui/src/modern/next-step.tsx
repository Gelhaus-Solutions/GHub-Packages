import { useId, type ReactNode } from "react";
import { cn } from "../cn.js";

/** The case's state as a tone, decided from the case, never chosen by hand. */
export type NextStepTone = "accent" | "ok" | "info" | "warn" | "crit" | "idle";

/** The clock that matters most, beside the step. */
export interface NextStepClock {
  /** "due in", "waiting for". */
  label: ReactNode;
  /** The figure, in mono: "14 h 00 min", "6 d 18 h 38 min". */
  value: ReactNode;
  /** The date it runs to, with its zone. */
  at?: ReactNode;
  /** How much of the period is used, 0 to 1, and the sentence for it. */
  used?: { share: number; text: ReactNode };
  /** warn and crit colour the figure and the bar; the rest read in ink. */
  level?: "accent" | "warn" | "crit";
}

export interface NextStepProps {
  tone?: NextStepTone;
  /** "Next", "Waiting on {company}", "{company} is late", "Your turn". */
  label: ReactNode;
  /** The step, as the heading: a verb. */
  step: ReactNode;
  /** What the step does, in a sentence or two. */
  children?: ReactNode;
  /** Label and value pairs under the body. */
  facts?: readonly { key: string; label: ReactNode; value: ReactNode }[];
  /**
   * The actions: exactly one primary, which does exactly the step, and
   * perhaps a secondary. The caller's buttons.
   */
  actions?: ReactNode;
  /** A quiet line under the actions. */
  note?: ReactNode;
  /** Other steps that are allowed now, as quiet links, after a rule. */
  others?: readonly ReactNode[];
  othersLabel?: ReactNode;
  clock?: NextStepClock;
  /** Background work: parts done of the whole, and the sentence for it. */
  progress?: { done: number; of: number; label: string };
  /** Something beside the body instead of a clock (a countersign panel). */
  aside?: ReactNode;
  className?: string;
}

const TONE: Readonly<Record<NextStepTone, string>> = {
  accent:
    "border-m-accent/34 bg-[linear-gradient(140deg,color-mix(in_oklch,var(--gm-accent)_13%,transparent),transparent_60%)] shadow-[inset_0_1px_0_color-mix(in_oklch,oklch(1_0_0)_16%,transparent),0_18px_40px_-24px_color-mix(in_oklch,var(--gm-accent)_70%,transparent)]",
  ok: "border-m-ok/34 bg-[linear-gradient(140deg,color-mix(in_oklch,var(--gm-ok)_13%,transparent),transparent_60%)] shadow-[inset_0_1px_0_color-mix(in_oklch,oklch(1_0_0)_16%,transparent),0_18px_40px_-24px_color-mix(in_oklch,var(--gm-ok)_70%,transparent)]",
  info: "border-m-info/34 bg-[linear-gradient(140deg,color-mix(in_oklch,var(--gm-info)_13%,transparent),transparent_60%)] shadow-[inset_0_1px_0_color-mix(in_oklch,oklch(1_0_0)_16%,transparent),0_18px_40px_-24px_color-mix(in_oklch,var(--gm-info)_70%,transparent)]",
  warn: "border-m-warn/34 bg-[linear-gradient(140deg,color-mix(in_oklch,var(--gm-warn)_13%,transparent),transparent_60%)] shadow-[inset_0_1px_0_color-mix(in_oklch,oklch(1_0_0)_16%,transparent),0_18px_40px_-24px_color-mix(in_oklch,var(--gm-warn)_70%,transparent)]",
  crit: "border-m-crit/34 bg-[linear-gradient(140deg,color-mix(in_oklch,var(--gm-crit)_13%,transparent),transparent_60%)] shadow-[inset_0_1px_0_color-mix(in_oklch,oklch(1_0_0)_16%,transparent),0_18px_40px_-24px_color-mix(in_oklch,var(--gm-crit)_70%,transparent)]",
  idle: "border-m-idle/34 bg-[linear-gradient(140deg,color-mix(in_oklch,var(--gm-idle)_13%,transparent),transparent_60%)] shadow-[inset_0_1px_0_color-mix(in_oklch,oklch(1_0_0)_16%,transparent),0_18px_40px_-24px_color-mix(in_oklch,var(--gm-idle)_70%,transparent)]",
};

const LABEL_INK: Readonly<Record<NextStepTone, string>> = {
  accent: "text-m-accent-text",
  ok: "text-m-ok-ink",
  info: "text-m-info-ink",
  warn: "text-m-warn-ink",
  crit: "text-m-crit-ink",
  idle: "text-m-ink-2",
};

const CLOCK_INK = {
  accent: "text-m-ink",
  warn: "text-m-warn-ink",
  crit: "text-m-crit-ink",
} as const;
const CLOCK_BAR = {
  accent:
    "bg-[linear-gradient(90deg,var(--gm-ok),var(--gm-accent))] shadow-[0_0_10px_var(--gm-accent)]",
  warn: "bg-[linear-gradient(90deg,var(--gm-ok),var(--gm-warn))] shadow-[0_0_10px_var(--gm-warn)]",
  crit: "bg-[linear-gradient(90deg,var(--gm-warn),var(--gm-crit))] shadow-[0_0_10px_var(--gm-crit)]",
} as const;

function share(value: number): string {
  return `${String(Math.round(Math.min(1, Math.max(0, value)) * 1000) / 10)}%`;
}

/**
 * Where it stands and the one next step (K9): the block every case page and
 * every agreement page leads with. A label in the tone's ink, the step as a
 * heading, a sentence, the caller's one primary action, other allowed steps
 * as quiet links after a rule, and the clock that matters most at the right.
 *
 * **Waiting states still offer the step staff can take when the answer
 * comes, so there is never a dead end**, which is the design's rule and why
 * `actions` is the caller's: the component cannot know which verb that is.
 *
 * The clock's figure is a `timer`, which is never announced on change; the
 * caller updates it once a minute. Progress is a `progressbar` with a polite
 * status line under it.
 */
export function NextStep({
  tone = "accent",
  label,
  step,
  children,
  facts,
  actions,
  note,
  others,
  othersLabel = "Other steps",
  clock,
  progress,
  aside,
  className,
}: NextStepProps) {
  const headingId = useId();
  const level = clock?.level ?? "accent";
  const side = clock !== undefined || aside !== undefined;
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "rounded-m-card border bg-m-plate px-[22px] py-5",
        "aurora:rounded-a-rail aurora:a-glass",
        TONE[tone],
        className,
      )}
    >
      <div
        className={cn(
          "grid items-start gap-x-7 gap-y-[18px]",
          side ? "md:grid-cols-[minmax(0,1fr)_auto]" : "",
        )}
      >
        <div className="min-w-0">
          <p className={cn("text-[12px] leading-4 font-medium", LABEL_INK[tone])}>{label}</p>
          <h2
            id={headingId}
            className="mt-0.5 text-[22px] leading-[30px] font-semibold tracking-[-0.015em] text-balance text-m-ink"
          >
            {step}
          </h2>
          {children === undefined ? null : (
            <div className="mt-1.5 max-w-[660px] text-[14px] leading-[21px] text-pretty text-m-ink-2">
              {children}
            </div>
          )}
          {facts === undefined || facts.length === 0 ? null : (
            <dl className="mt-3.5 grid grid-cols-[136px_minmax(0,1fr)] gap-x-3.5 gap-y-1.5 text-[13.5px] leading-[19px] max-sm:grid-cols-1">
              {facts.map((fact) => (
                <div key={fact.key} className="contents">
                  <dt className="text-m-ink-3">{fact.label}</dt>
                  <dd className="min-w-0 text-m-ink">{fact.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {progress === undefined ? null : (
            <div className="mt-4 max-w-[560px]">
              <div
                role="progressbar"
                aria-label={progress.label}
                aria-valuenow={progress.done}
                aria-valuemin={0}
                aria-valuemax={progress.of}
                className="h-1.5 overflow-hidden rounded-full bg-m-ink/10"
              >
                <span
                  className="block h-1.5 rounded-full bg-[linear-gradient(90deg,var(--gm-ok),var(--gm-accent))] shadow-[0_0_10px_var(--gm-accent)]"
                  style={{ width: share(progress.of === 0 ? 0 : progress.done / progress.of) }}
                />
              </div>
              <p role="status" className="mt-2 text-[13px] leading-[19px] text-m-ink-2">
                {progress.label}
              </p>
            </div>
          )}
          {actions === undefined ? null : (
            <div className="mt-4 flex flex-wrap items-center gap-x-3.5 gap-y-2.5">{actions}</div>
          )}
          {note === undefined ? null : (
            <p className="mt-2.5 max-w-[660px] text-[12.5px] leading-[18px] text-pretty text-m-ink-3">
              {note}
            </p>
          )}
          {others === undefined || others.length === 0 ? null : (
            <div className="mt-3.5 flex flex-wrap items-baseline gap-x-[18px] gap-y-1 border-t border-m-hairline pt-3">
              <span className="text-[12.5px] leading-[18px] text-m-ink-3">{othersLabel}</span>
              {others.map((other, index) => (
                <span key={index} className="text-[13.5px] leading-[19px] font-medium">
                  {other}
                </span>
              ))}
            </div>
          )}
        </div>
        {clock === undefined ? null : (
          <div className="min-w-0 md:text-right">
            <p className="text-[12px] text-m-ink-3">{clock.label}</p>
            <p
              role="timer"
              className={cn(
                "font-mono text-[26px] leading-8 tracking-[-0.02em] whitespace-nowrap tabular-nums",
                CLOCK_INK[level],
              )}
            >
              {clock.value}
            </p>
            {clock.at === undefined ? null : (
              <p className="mt-1.5 text-[12px] text-m-ink-3">{clock.at}</p>
            )}
            {clock.used === undefined ? null : (
              <>
                <div
                  aria-hidden="true"
                  className="mt-2.5 h-[3px] w-[220px] max-w-full overflow-hidden rounded-full bg-m-ink/10 md:ml-auto"
                >
                  <span
                    className={cn("block h-[3px] rounded-full", CLOCK_BAR[level])}
                    style={{ width: share(clock.used.share) }}
                  />
                </div>
                <p className="mt-1.5 text-[11.5px] text-m-ink-3">{clock.used.text}</p>
              </>
            )}
          </div>
        )}
        {aside === undefined ? null : <div className="min-w-0">{aside}</div>}
      </div>
    </section>
  );
}
