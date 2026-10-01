import type { ReactNode } from "react";
import { allowanceTone, type AllowanceTone } from "./allowance-tone.js";
import { cn } from "./cn.js";

/**
 * A count against its ceiling, as a number and a 3px rule under it.
 *
 * The rule that decides the colour lives in `allowance-tone.ts` so it can be
 * tested without mounting anything, which is the same split `contrast.ts`
 * already uses: this package compiles with `jsx: preserve`, so a test that
 * imports a `.tsx` cannot be parsed at all.
 */
export { allowanceTone, type AllowanceTone } from "./allowance-tone.js";

const barFill: Record<AllowanceTone, string> = {
  accent: "bg-accent",
  warn: "bg-warn",
  crit: "bg-crit",
};

const valueInk: Record<AllowanceTone, string> = {
  accent: "text-fg",
  warn: "text-warn-ink",
  crit: "text-crit-ink",
};

export interface AllowanceBarProps {
  /** What is in use now. */
  used: number;
  /** The ceiling, or null where there is not one. */
  allowed: number | null;
  /**
   * The reading, already localised by the caller: "412 of 500", "2, unlimited".
   * The component does not compose it, because the comma in the unbounded form
   * and the word between the numbers are both translator's decisions.
   *
   * Optional, for the case where the surrounding layout already states the two
   * numbers and a second copy under them would be the same reading twice. The
   * bar is `aria-hidden` either way, so leaving it out removes a line of text
   * rather than a piece of information.
   */
  label?: ReactNode;
  /** Overrides the tone where the caller knows something the counts do not. */
  tone?: AllowanceTone;
  className?: string;
}

export function AllowanceBar({ used, allowed, label, tone, className }: AllowanceBarProps) {
  const resolved = tone ?? allowanceTone(used, allowed);

  // An unbounded grant has no proportion to draw, so the track stays empty
  // rather than carrying a width that encodes nothing. The artboard fills it to
  // 18 and 12 percent on the two unlimited rows, which are hand-picked numbers
  // that are not proportional to each other or to anything else; drawing them
  // would put a measurement on screen that means nothing, on a screen whose last
  // section is about what this product will and will not claim. The track is
  // kept so the row height does not move between a capped app and an uncapped
  // one, and the reading beside it already says "unlimited".
  // Rounded because the raw ratio serialises into the DOM: 412 of 500 is
  // 82.39999999999999 in binary floating point, and a style attribute carrying
  // that is noise in every snapshot and diff it ever appears in. Two decimals is
  // finer than a pixel on any bar this size.
  const ratio = allowed === null || allowed <= 0 ? 0 : Math.min(100, (used / allowed) * 100);
  const pct = Math.round(ratio * 100) / 100;

  return (
    <div className={cn("min-w-0", className)}>
      {label === undefined ? null : (
        <div className={cn("numeric text-xs", valueInk[resolved])}>{label}</div>
      )}
      {/* Hidden from assistive tech on purpose: the line above states the same
          two numbers, and announcing a second, wordless copy of them is noise. */}
      {/* The track is `inset`, the recessed-surface token, rather than the
          artboard's literal `oklch(1 0 0/0.08)`. That value is white at 8
          percent, which reads on the dark canvas the artboards were drawn on and
          disappears entirely against a light background. Both themes are
          shipped, so a track has to be a token that is defined in both. */}
      <div
        aria-hidden="true"
        className={cn(
          "h-[3px] overflow-hidden rounded-full bg-inset",
          label === undefined ? undefined : "mt-[5px]",
        )}
      >
        <span
          className={cn("block h-[3px] rounded-full", barFill[resolved])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
