import type { ReactNode } from "react";
import { cn } from "../cn.js";

export interface ChangeLineProps {
  /**
   * The sentence, worded by the caller from the API's classification: "First
   * version.", "Punctuation only, in 14 places.", "Reworded 2 sections:
   * Sub-processors; Transfers."
   */
  children: ReactNode;
  /** Words (or the caller's unit) added. With `removed`, draws the diffstat. */
  added?: number;
  /** Words (or the caller's unit) removed. */
  removed?: number;
  /** Drawn after the figures: "words" gives "+19 −4 words". Left out, the figures stand alone. */
  unit?: string;
  /**
   * What assistive technology hears in place of the figures. The default is
   * English, "19 words added, 4 removed"; pass this for any other language.
   */
  statLabel?: (added: number, removed: number) => string;
  className?: string;
}

function defaultStatLabel(unit: string | undefined) {
  return (added: number, removed: number): string =>
    unit === undefined
      ? `${String(added)} added, ${String(removed)} removed`
      : `${String(added)} ${unit} added, ${String(removed)} removed`;
}

/**
 * One sentence saying what a version changed against the one before it, and a
 * diffstat in mono beside it. Drawn for the GPlatform Terms staff console, in a
 * document's version list and above a version's comparison.
 *
 * **The API classifies and the caller words it.** Rewritten when more than half
 * the sections changed, punctuation only when no word did: those are decisions
 * about the texts, made where the texts are, and this component only draws the
 * sentence it is given and the two figures.
 *
 * **The figures are drawn for the eye and said for the ear.** "+19 −4 words"
 * read aloud is "plus nineteen minus four words", which sounds like
 * arithmetic, so the drawn figures are hidden from assistive technology and a
 * visually hidden "19 words added, 4 removed" says them instead. The minus is
 * U+2212, which sits level with the plus; a hyphen would sit low and read as a
 * dash.
 */
export function ChangeLine({
  children,
  added,
  removed,
  unit,
  statLabel,
  className,
}: ChangeLineProps) {
  const counted = added !== undefined || removed !== undefined;
  const plus = added ?? 0;
  const minus = removed ?? 0;
  const drawn = `+${String(plus)} \u2212${String(minus)}${unit === undefined ? "" : ` ${unit}`}`;
  const said = (statLabel ?? defaultStatLabel(unit))(plus, minus);

  return (
    <p className={cn("text-m-body text-m-ink", className)}>
      {children}
      {counted ? (
        <>
          {" "}
          <span
            aria-hidden="true"
            className="font-mono text-m-meta whitespace-nowrap text-m-ink-3 tabular-nums"
          >
            {drawn}
          </span>
          <span className="sr-only">{said}</span>
        </>
      ) : null}
    </p>
  );
}
