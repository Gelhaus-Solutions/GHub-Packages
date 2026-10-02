import { MessageSquare } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../cn.js";
import { Status, type StatusLevel } from "./status.js";

/** Where an account stands with the terms in force. Five values and no others. */
export type StandingValue = "agreed" | "asked" | "owed-paid" | "restricted" | "exempt";

/**
 * The ramp, decided here and not by the caller.
 *
 * A caller choosing the level is how one screen ends up drawing an owed paying
 * account in crit and another in warn. Owed-paid and restricted share warn on
 * purpose and are told apart by their word and their cause line, and crit is
 * absent on purpose: it is kept for something already lost, and a standing is
 * never that.
 */
const LEVEL: Readonly<Record<StandingValue, StatusLevel>> = {
  agreed: "ok",
  asked: "info",
  "owed-paid": "warn",
  restricted: "warn",
  exempt: "idle",
};

/** An objection recorded beside the standing. */
export interface StandingObjection {
  /** "Objected 12 Oct, by mail". The link's visible text and its name. */
  text: ReactNode;
  /** Where the objection itself is shown. */
  href: string;
}

interface StandingBaseProps {
  standing: StandingValue;
  /** The word on the chip: "Restricted", "Asked, accept by 26 Nov". */
  word: string;
  /** The instant it was computed for, already formatted: "on 21 Nov 2026, 00:00 CET". */
  at?: string;
  objection?: StandingObjection;
  /** Several terms on one product: "Behind on 1 of 5 documents" and its table. */
  breakdown?: ReactNode;
  className?: string;
}

/**
 * The sentence, and what it can be made from.
 *
 * Composed from `word`, `at` and `cause` when `cause` is a string. When the
 * cause is markup (a version id set in mono, say) a sentence cannot be read
 * back out of it, so `summary` becomes required: the type says so rather than
 * letting the sentence quietly lose its cause.
 */
type StandingSentence =
  | {
      /** Why: the version behind on, and its date. For asked, owed-paid and restricted. */
      cause?: string;
      /** Replaces the composed sentence. */
      summary?: string;
    }
  | { cause: ReactNode; summary: string };

/**
 * A standing: a Status, plus what a standing carries that a status does not.
 * Drawn for the GPlatform Terms staff console, where a person's standing on
 * each product account is the first thing support reads.
 *
 * **Status sits inside unchanged.** The word and the level are its job and it
 * already does them to the colour rule; this adds the instant, the cause, an
 * objection beside it and, for a product with several terms, a breakdown.
 *
 * **One sentence for assistive technology.** Seen, a standing is a chip, a
 * date in quiet ink and a reason line, laid out to be scanned. Heard in that
 * order it is "Restricted. On 21 Nov. Behind on...", three fragments. So the
 * chip, the instant and the cause are hidden from assistive technology and
 * one visually hidden sentence says them instead: "Restricted on 21 November
 * 2026. Behind on gs-terms-2026-10-01." Because they are hidden, `cause` must
 * not hold a link or anything else that takes focus; a reason line that links
 * to the version belongs beside the standing, not inside it.
 *
 * **The objection is a link, and it is read straight after the sentence.** It
 * is not in the sentence for that reason: the link says it, so a `summary`
 * should not say it again. It carries no colour, ink-2 on a dashed edge, and it
 * never tints the chip, because an objection sits beside a standing and does
 * not change it.
 */
export type StandingProps = StandingBaseProps & StandingSentence;

/** Each part ends as a sentence, so the composed text is read with pauses where they belong. */
function sentence(parts: readonly (string | undefined)[]): string {
  return parts
    .map((part) => part?.trim() ?? "")
    .filter((part) => part !== "")
    .map((part) => (/[.!?]$/u.test(part) ? part : `${part}.`))
    .join(" ");
}

export function Standing(props: StandingProps) {
  const { standing, word, at, cause, summary, objection, breakdown, className } = props;
  const said =
    summary ??
    sentence([
      at === undefined ? word : `${word} ${at}`,
      typeof cause === "string" ? cause : undefined,
    ]);

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <p className="sr-only">{said}</p>
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden="true" className="inline-flex">
          <Status level={LEVEL[standing]} chip>
            {word}
          </Status>
        </span>
        {objection === undefined ? null : (
          <a
            href={objection.href}
            className={cn(
              // 24 tall at the meta line height with its 1px edges, the target
              // minimum, and `min-h-6` holds it there if the type ever moves.
              "inline-flex min-h-6 items-center gap-1.5 rounded-m-chip border border-dashed border-m-strong px-2",
              "text-m-meta whitespace-nowrap text-m-ink-2 hover:underline",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-m-ring",
            )}
          >
            <MessageSquare aria-hidden="true" className="size-3 shrink-0" strokeWidth={1.75} />
            {objection.text}
          </a>
        )}
        {at === undefined ? null : (
          <span aria-hidden="true" className="text-m-meta text-m-ink-3">
            {at}
          </span>
        )}
      </div>
      {cause === undefined || cause === null ? null : (
        <p aria-hidden="true" className="text-m-meta text-m-ink-2">
          {cause}
        </p>
      )}
      {breakdown === undefined ? null : <div>{breakdown}</div>}
    </div>
  );
}
