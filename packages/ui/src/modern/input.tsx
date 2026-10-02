import type { InputHTMLAttributes } from "react";
import { cn } from "../cn.js";

/**
 * Two heights, and the choice is about who is typing rather than about density.
 *
 * **44 is the default and the only height for a credential, an address, or
 * anything typed on a phone**, because it is the touch target a thumb can hit.
 * 36 exists for a staff form of six or more fields, where the person is at a
 * keyboard and the extra rows cost more than the extra pixels buy. **Console's
 * 32 is not in modern at all**: it is an instrument density, and this is a
 * screen somebody opens twice a year.
 */
export type InputHeight = 44 | 36;

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  height?: InputHeight;
  /**
   * Mono when the content is an identifier or an address. Not for a name, not
   * for a sentence: mono is for something being compared character by
   * character, and everything else is a word being read.
   */
  mono?: boolean;
}

/**
 * A field inverts the material: an inset well rather than a raised plate, so it
 * reads as something to put something into rather than something to press.
 *
 * It carries no label of its own, deliberately. A `placeholder` is an example
 * of the value and never the label: it disappears the moment somebody types,
 * so a field labelled only by its placeholder is a field nobody can check their
 * answer against, and it is invisible to a screen reader once filled. Labels
 * come from `FormField`, which also owns the hint, the error and the ARIA wiring.
 */
export function Input({ height = 44, mono = false, className, ...rest }: InputProps) {
  return (
    <input
      className={cn(
        "w-full rounded-m-control border border-m-control bg-m-inset px-3 text-m-label text-m-ink shadow-m-inset",
        "placeholder:text-m-ink-3",
        height === 44 ? "h-11" : "h-9",
        mono ? "font-mono tabular-nums" : "",
        className,
      )}
      {...rest}
    />
  );
}
