import type { ReactNode } from "react";
import { cn } from "../cn.js";

/**
 * The one place a modern screen says what it is, and what can be done here.
 *
 * Replaces `Masthead`, and the difference is who is reading. A masthead
 * announces an instrument to somebody who sits in front of it for hours. A page
 * head tells a stranger what screen they are on and what they can do on it,
 * which is why the lede is a sentence rather than a strip of identifiers.
 *
 * **Every screen in both consumer products opens with exactly one.** The title
 * is the page `h1` and the only one, so a screen rendering two of these has two
 * first-level headings and a screen rendering none is unlabelled to a screen
 * reader. Neither is checkable from here; both are stated so review can see it.
 *
 * The action is capped at one, and the cap is the point rather than a style
 * preference. A screen offering three equally weighted buttons has not decided
 * what it is for, and the reader has to try all three to find out. A second
 * action belongs on the record it acts on.
 */
export interface PageHeadProps {
  /**
   * The rail group this screen belongs to, and optional.
   *
   * It orients somebody who arrived from a link rather than from the rail, so
   * it repeats the navigation rather than adding to it. It is not a
   * breadcrumb: there is no trail and nothing in it is a link.
   */
  eyebrow?: ReactNode;
  title: ReactNode;
  /**
   * One sentence, never two, and it answers what happens if I press the thing
   * on this screen.
   *
   * Held to the prose measure rather than the content width, because a line
   * longer than about 680px is one the eye loses its place returning from. The
   * action sits outside that measure for the same reason.
   */
  lede?: ReactNode;
  /** Zero or one. More than one means the screen has not decided. */
  action?: ReactNode;
  className?: string;
}

export function PageHead({ eyebrow, title, lede, action, className }: PageHeadProps) {
  return (
    <header className={cn("flex items-center justify-between gap-10 pb-18", className)}>
      <div className="min-w-0">
        {eyebrow === undefined ? null : <p className="text-m-micro text-m-ink-3">{eyebrow}</p>}
        {/*
         * `text-balance` rather than a truncation: the contract is that a long
         * title wraps to two lines at the measure and never truncates. A name
         * somebody is looking for is the one thing on the screen that must not
         * be cut off, and an ellipsis in a heading is how a customer cannot
         * tell two records apart.
         */}
        <h1
          className={cn(
            "text-m-title text-balance text-m-ink",
            eyebrow === undefined ? "" : "mt-2",
          )}
        >
          {title}
        </h1>
        {lede === undefined ? null : (
          <p className="mt-3 max-w-m-prose text-m-lede text-m-ink-2">{lede}</p>
        )}
      </div>
      {/*
       * Centred against the whole block rather than aligned to a line inside
       * it, so a screen with a two-line lede and a screen with none put their
       * button in the same place relative to the head. `shrink-0` because the
       * label decides the width and German runs about a third longer.
       */}
      {action === undefined ? null : <div className="shrink-0">{action}</div>}
    </header>
  );
}
