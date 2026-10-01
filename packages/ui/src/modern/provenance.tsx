import type { ReactNode } from "react";
import { cn } from "../cn.js";

/**
 * One line saying who did a thing and when. Nineteen screens need this.
 *
 * It replaces `SigningProvenance`, and the replacement is a generalisation
 * rather than a restyle: that component answers one question about signing
 * keys, and what the screens actually reach for is the plain line underneath
 * it. The signing-specific version stays in console, where the question it
 * answers is still being asked.
 *
 * **It formats nothing.** `at` is whatever the caller has already rendered,
 * because a date format is a locale decision and this package has no locale.
 * `Money` takes a locale and does its own formatting because there is one
 * correct way to render a currency amount given one; there is no equivalent
 * single answer for a timestamp, where absolute against relative is a product
 * decision that differs per screen.
 *
 * The time is mono, because it is a figure somebody compares against another
 * line. The actor is not: a name is a word being read.
 */
export interface ProvenanceProps {
  /** Who. A person, a service account, or the system itself. */
  actor: ReactNode;
  /** What they did, in the past tense. */
  action: ReactNode;
  /** When, already formatted by the caller. */
  at: ReactNode;
  className?: string;
}

export function Provenance({ actor, action, at, className }: ProvenanceProps) {
  return (
    <p className={cn("text-m-meta text-m-ink-3", className)}>
      {action} {actor} <time className="font-mono tabular-nums">{at}</time>
    </p>
  );
}
