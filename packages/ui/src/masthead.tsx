import type { ReactNode } from "react";
import { cn } from "./cn.js";

/**
 * The masthead: the one place a screen says what it is.
 *
 * One title, one sentence, and at most one primary action. The cap on the
 * action is the point rather than a style preference: a screen offering three
 * equally-weighted buttons at the top has not decided what it is for, and the
 * operator has to read all three to find out. Anything else a screen can do
 * belongs to the section that owns it.
 *
 * The action bottom-aligns with the lede rather than centring on the block, so
 * a screen with a two-line lede and a screen with none put their button in the
 * same place relative to the rule underneath.
 */
export interface MastheadProps {
  title: ReactNode;
  /** One sentence saying what this screen is looking at. Capped at 88ch. */
  lede?: ReactNode;
  /**
   * Replaces the lede on a screen about one record: a strip of mono facts
   * rather than a sentence, because a record's identity is its ids.
   */
  facts?: ReactNode;
  /** At most one primary control. More than one means the screen is undecided. */
  action?: ReactNode;
  /** A quiet reading that belongs to the screen rather than to the deployment. */
  aside?: ReactNode;
  /** Set when a filter row follows, which needs a little more room under it. */
  filtered?: boolean;
  className?: string;
}

export function Masthead({
  title,
  lede,
  facts,
  action,
  aside,
  filtered = false,
  className,
}: MastheadProps) {
  return (
    <header
      className={cn(
        "flex items-end justify-between gap-6 px-8 pt-[26px]",
        filtered ? "pb-5" : "pb-[18px]",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-fg">{title}</h1>
        {lede === undefined ? null : (
          <p className="mt-2 max-w-[88ch] text-xs text-fg-tertiary">{lede}</p>
        )}
        {facts === undefined ? null : <div className="mt-2.5">{facts}</div>}
      </div>
      {action === undefined && aside === undefined ? null : (
        <div className="flex shrink-0 items-end gap-3">
          {aside === undefined ? null : (
            <span className="numeric text-2xs text-fg-tertiary">{aside}</span>
          )}
          {action}
        </div>
      )}
    </header>
  );
}

/**
 * A record's identity, as a row of mono facts.
 *
 * Takes the facts as data rather than as children so the separator rule lives
 * here: the cells are divided by a hairline on every one but the last, and a
 * caller assembling that by hand gets it wrong the first time somebody makes a
 * fact conditional.
 */
export interface Fact {
  /** What the value is. Quiet, because the value is the thing being read. */
  label: ReactNode;
  value: ReactNode;
}

export function FactStrip({
  facts,
  className,
  onWash = false,
}: {
  facts: readonly Fact[];
  className?: string;
  /**
   * Whether this strip is drawn on a status wash rather than on a surface.
   *
   * A wash is translucent colour over a surface, and it moves the floor. The
   * label is tertiary, which passes AA on all five surfaces and does not pass
   * on a wash: measured worst case is 3.49 against the 4.5 floor in dark, and
   * the emergency card's contained state was a real failure nobody saw because
   * axe had only ever been run on an instance that was not contained.
   *
   * A prop rather than a darker label everywhere, because tertiary is correct
   * on a surface and the two cases are genuinely different backgrounds. A prop
   * rather than a `text-fg-secondary` override from the caller, because a
   * caller cannot restyle a child from `className` and the one that tried
   * would reach for a descendant selector.
   *
   * The value is already secondary and passes either way, so only the label
   * moves.
   */
  onWash?: boolean;
}) {
  return (
    <div className={cn("numeric flex flex-wrap items-center text-2xs leading-4", className)}>
      {facts.map((fact, index) => (
        <span
          key={index}
          className={cn(
            "flex items-center gap-1.5",
            index < facts.length - 1 &&
              "mr-[11px] border-r border-(--gc-border-hairline) pr-[11px]",
          )}
        >
          <span className={onWash ? "text-fg-secondary" : "text-fg-tertiary"}>{fact.label}</span>
          <span className="text-fg-secondary">{fact.value}</span>
        </span>
      ))}
    </div>
  );
}
