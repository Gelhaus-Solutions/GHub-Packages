import type { ReactNode } from "react";
import { cn } from "../cn.js";

/**
 * What a count means, which is its colour.
 *
 * - `plain`: a total, in quiet mono ink and no fill ("412 parties").
 * - `quiet`: a total on the hover film, for a count inside a raised item.
 * - `accent`: solid accent, "this needs you" (the only solid one).
 * - `accent-wash`: accent wash, waiting on you but not yet late.
 * - `ok`, `warn`, `crit`: the level's wash and ink: done, due soon, late.
 * - `outline`: a word rather than a number ("soon"), in a hairline pill.
 */
export type BadgeTone =
  "plain" | "quiet" | "accent" | "accent-wash" | "ok" | "warn" | "crit" | "outline";

const TONE: Readonly<Record<BadgeTone, string>> = {
  plain: "text-m-ink-3",
  quiet: "bg-m-hover text-m-ink-2",
  accent: "bg-m-accent text-m-accent-on",
  "accent-wash": "bg-m-accent-wash text-m-accent-text",
  ok: "bg-m-ok-wash text-m-ok-ink",
  warn: "bg-m-warn-wash text-m-warn-ink",
  crit: "bg-m-crit-wash text-m-crit-ink",
  outline: "border border-m-subtle px-2 font-sans font-normal text-m-ink-3",
};

export interface BadgeProps {
  /** The count, or for `outline` the word. */
  children: ReactNode;
  tone?: BadgeTone;
  /**
   * What the number counts, for a screen reader: "late", "need you",
   * "to triage". Visually hidden, read after the number, because "8" alone
   * beside a nav item says nothing to somebody who cannot see its colour.
   */
  word?: string;
  className?: string;
}

/**
 * The one badge shape: a count in a pill, 20 high, mono 11, tabular, centred.
 * One shape everywhere so a count reads as a count at a glance, and the tone
 * is the only thing that varies.
 */
export function Badge({ children, tone = "plain", word, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-6 shrink-0 items-center justify-center rounded-full px-[7px]",
        "font-mono text-[11px] leading-none font-medium tabular-nums whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      {children}
      {word === undefined ? null : <span className="sr-only"> {word}</span>}
    </span>
  );
}
