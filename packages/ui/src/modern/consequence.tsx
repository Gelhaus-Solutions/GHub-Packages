import type { ReactNode } from "react";
import { cn } from "../cn.js";
import type { StatusLevel } from "./status.js";

export interface ConsequenceLine {
  level: StatusLevel;
  text: ReactNode;
}

/**
 * Worst first, and the component decides the order rather than the caller.
 *
 * Sorting here rather than trusting the array means a screen cannot bury the
 * destructive line under two reassuring ones by listing them in the order the
 * code happened to produce. `idle` sorts last, which is what puts "your address
 * and your name stay as they are" at the bottom where it belongs.
 */
const ORDER: Readonly<Record<StatusLevel, number>> = {
  crit: 0,
  warn: 1,
  info: 2,
  ok: 3,
  idle: 4,
};

const DOT: Readonly<Record<StatusLevel, string>> = {
  ok: "bg-m-ok",
  warn: "bg-m-warn",
  crit: "bg-m-crit",
  info: "bg-m-info",
  idle: "bg-m-idle",
};

/**
 * What will happen, before it happens.
 *
 * **No heading and no card: it sits inside the thing it warns about.** A
 * consequence list in its own panel becomes a thing to scroll past on the way
 * to the button. Inside the disclosure or the overlay that is asking, it is the
 * last thing read before the decision.
 *
 * Set at body size rather than meta, because these are the sentences that must
 * be read. Everything else on a destructive screen can be skimmed; this cannot,
 * and making it small says the opposite.
 *
 * **The line that says what does NOT change is the half that matters most.**
 * "Your address and your name stay as they are" is usually the reason somebody
 * goes through with a safe action instead of abandoning it, and a list of only
 * the losses reads as a warning to stop.
 */
export interface ConsequenceProps {
  lines: readonly ConsequenceLine[];
  className?: string;
}

export function Consequence({ lines, className }: ConsequenceProps) {
  const ordered = [...lines].sort((a, b) => ORDER[a.level] - ORDER[b.level]);

  return (
    <ul className={cn("flex flex-col gap-3", className)}>
      {ordered.map((line, index) => (
        <li key={index} className="flex items-start gap-3 text-m-body text-m-ink">
          {/*
           * `aria-hidden` for the reason it is on every other dot in modern:
           * the sentence carries the meaning and the colour repeats it. A list
           * of five consequences should be five things to hear, not ten.
           */}
          <span
            aria-hidden="true"
            className={cn("mt-2 size-1.5 shrink-0 rounded-full", DOT[line.level])}
          />
          <span>{line.text}</span>
        </li>
      ))}
    </ul>
  );
}
