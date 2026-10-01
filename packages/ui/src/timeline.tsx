import type { ReactNode } from "react";
import { cn } from "./cn.js";
import type { Status } from "./status.js";

/**
 * A vertical ladder of stages over time.
 *
 * Both consoles show the same command life from opposite ends: the platform
 * watches an instruction travel to a customer's instance, and the instance
 * shows what it was asked to do and what it decided. Our own lockdown and unseal
 * flows are stage machines with no component for the stage, so both sides were
 * about to hand-write this.
 *
 * **The colour rule is the reason this is shared rather than local, and it is
 * not a caller's decision.** A stage names what happened and the component picks
 * the colour; there is no prop that lets one side paint a refusal red:
 *
 *   - `refused` is warn, and it is the system working. Their allowlist declined,
 *     or nobody approved in time. A product that painted that red would teach
 *     its operators to read a customer exercising their own control as an
 *     incident, and then to click through it.
 *   - `failed` is crit, and it is ours. The instance tried and something broke.
 *   - `skipped` is grey and says "not reached", which is different from either.
 *
 * That judgement is made once, here, rather than re-argued on each side of the
 * link, and two products describing the same refusal in two colours is exactly
 * how an incident gets misread in a call between them.
 */
export type TimelineStage = "idle" | "live" | "done" | "refused" | "failed" | "skipped" | "locked";

/*
 * The three maps below are the colour rule, and none of them is exported.
 *
 * A caller passes what happened and cannot pass a colour, cannot override one,
 * and cannot reach these to change one. That is the whole of this component's
 * `Done when`: `refused` is warn and `failed` is crit, on both sides of the
 * link, permanently.
 */

/** The rail mark. Text takes the ink; this is a graphic and takes the colour. */
const stageMark: Record<TimelineStage, string> = {
  idle: "border-(--gc-border-subtle) bg-base",
  live: "border-[color-mix(in_oklch,var(--gc-info)_55%,transparent)] bg-info-wash",
  done: "border-[color-mix(in_oklch,var(--gc-ok)_55%,transparent)] bg-ok-wash",
  refused: "border-[color-mix(in_oklch,var(--gc-warn)_55%,transparent)] bg-warn-wash",
  failed: "border-[color-mix(in_oklch,var(--gc-crit)_55%,transparent)] bg-crit-wash",
  skipped: "border-(--gc-border-hairline) bg-base",
  locked: "border-[color-mix(in_oklch,var(--gc-locked)_55%,transparent)] bg-locked-wash",
};

/**
 * The dot inside the mark. Static, because Tailwind reads class names as
 * literals: a `bg-${status}` built at runtime is invisible to the compiler and
 * renders as no colour at all, silently, which is the same failure mode as a
 * deleted token.
 */
const stageDot: Record<TimelineStage, string> = {
  idle: "bg-idle",
  live: "bg-info",
  done: "bg-ok",
  refused: "bg-warn",
  failed: "bg-crit",
  skipped: "bg-idle",
  locked: "bg-locked",
};

/** The title's ink, where the stage is one that changes what the title means. */
const stageInk: Record<TimelineStage, string> = {
  idle: "text-fg-secondary",
  live: "text-fg",
  done: "text-fg",
  refused: "text-warn-ink",
  failed: "text-crit-ink",
  // Not `text-fg-disabled`: a skipped stage is content somebody reads to find
  // out it was never reached, and disabled is for an inactive control.
  skipped: "text-fg-tertiary",
  locked: "text-locked-ink",
};

export interface TimelineEvent {
  /** What happened, not what colour it should be. */
  stage: TimelineStage;
  /** A 14px icon, or nothing: the mark carries the stage on its own. */
  icon?: ReactNode;
  /** The stage as a sentence, in the tense it actually happened in. */
  title: ReactNode;
  /** Mono, right of the title. When it happened, or how long it took. */
  when?: ReactNode;
  /** The paragraph under the title, where the stage needs explaining. */
  body?: ReactNode;
  /**
   * Mono and preformatted, for a refusal code or a customer's own log line
   * quoted verbatim.
   *
   * Verbatim is the point. A line from their system paraphrased into ours is a
   * line neither party can search for afterwards.
   */
  detail?: ReactNode;
  /** Tints the detail block. Defaults to the event's own stage. */
  detailStatus?: Extract<Status, "warn" | "crit" | "info" | "idle">;
}

const detailSurface: Record<Extract<Status, "warn" | "crit" | "info" | "idle">, string> = {
  warn: "border-[color-mix(in_oklch,var(--gc-warn)_30%,transparent)] bg-warn-wash text-warn-ink",
  crit: "border-[color-mix(in_oklch,var(--gc-crit)_30%,transparent)] bg-crit-wash text-crit-ink",
  info: "border-[color-mix(in_oklch,var(--gc-info)_30%,transparent)] bg-info-wash text-info-ink",
  idle: "border-(--gc-border-hairline) bg-inset text-fg-secondary",
};

function detailTone(event: TimelineEvent): Extract<Status, "warn" | "crit" | "info" | "idle"> {
  if (event.detailStatus !== undefined) return event.detailStatus;
  if (event.stage === "refused") return "warn";
  if (event.stage === "failed") return "crit";
  return "idle";
}

export function Timeline({
  events,
  live = false,
  className,
}: {
  events: readonly TimelineEvent[];
  /**
   * The ladder is still running, so the last stage is not the end of it.
   *
   * Draws the rail past the final mark into nothing, because a ladder that
   * stops cleanly at the last row reads as finished, and a command that is
   * still travelling is the case where that matters most.
   */
  live?: boolean;
  className?: string;
}) {
  return (
    <ol className={cn("relative", className)}>
      {events.map((event, index) => {
        const last = index === events.length - 1;
        const tone = detailTone(event);

        return (
          <li key={index} className="relative flex gap-3 pb-4 last:pb-0">
            {/*
             * The rail is drawn by each row rather than once behind the list,
             * because a row's height is its content and only the row knows it.
             * It stops at the last mark unless the ladder is still running.
             */}
            {last && !live ? null : (
              <span
                aria-hidden="true"
                className="absolute bottom-0 left-[9px] top-[22px] w-px bg-(--gc-border-hairline)"
              />
            )}

            <span
              className={cn(
                "relative z-10 mt-[3px] grid size-[19px] shrink-0 place-items-center rounded-full border",
                stageMark[event.stage],
              )}
            >
              {event.stage === "live" ? (
                <span
                  aria-hidden="true"
                  className="absolute size-[19px] animate-ping rounded-full bg-info opacity-40 motion-reduce:hidden"
                />
              ) : null}
              {event.icon === undefined ? (
                <span
                  aria-hidden="true"
                  className={cn("size-1.5 rounded-full", stageDot[event.stage])}
                />
              ) : (
                <span className={cn("flex", stageInk[event.stage])}>{event.icon}</span>
              )}
            </span>

            <div className="min-w-0 flex-1 pb-0.5">
              <div className="flex items-baseline gap-3">
                <span
                  className={cn(
                    "min-w-0 flex-1 text-sm font-medium tracking-[-0.01em]",
                    stageInk[event.stage],
                  )}
                >
                  {event.title}
                </span>
                {event.when === undefined ? null : (
                  <span className="numeric shrink-0 text-2xs text-fg-tertiary">{event.when}</span>
                )}
              </div>

              {event.body === undefined ? null : (
                <p className="mt-1 max-w-[78ch] text-2xs leading-[17px] text-fg-tertiary">
                  {event.body}
                </p>
              )}

              {event.detail === undefined ? null : (
                <pre
                  className={cn(
                    "numeric mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-(--radius-sm) border px-2.5 py-[7px] text-2xs leading-[17px]",
                    detailSurface[tone],
                  )}
                >
                  {event.detail}
                </pre>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
