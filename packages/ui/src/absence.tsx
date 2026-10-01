import type { ReactNode } from "react";
import { cn } from "./cn.js";
import type { Status } from "./status.js";

/**
 * Something that is not here, and the step that would put it here.
 *
 * The third state block, and it is worth saying what the other two are for
 * because the instinct is to reach for one of them and then argue with it.
 *
 * `EmptyState` is a list with nothing in it: somebody arrived too early, the
 * shape of the screen is already right, and the block sits centred in the space
 * the rows will occupy. `Refusal` is something asked for and not given, which
 * owes the reader a way onward and takes a severity rule to say how bad it was.
 *
 * This is neither. It is a record or a capability that is absent, where the
 * absence is either the ordinary case ("nothing is recorded against this
 * install") or a not-yet ("sealing is not available on this instance"). Nobody
 * asked for anything and nothing failed, so a severity rule would be a colour
 * with nothing to say. What the reader needs is what the absence means and what
 * would end it, which is why the body is prose and the actions are optional.
 *
 * **Dashed, and that is the whole visual argument.** A solid border says "this
 * is a thing"; a dashed one says "this is where a thing would be". It is the
 * one place in the system a border is not solid, and it earns that by being the
 * only block whose subject does not exist yet.
 *
 * It aligns left rather than centring, unlike `EmptyState`, because it sits in
 * a ruled section's content column beside a margin label rather than standing in
 * for a table. A centred block in a 196px-offset column reads as a mistake.
 */
export interface AbsenceProps {
  /**
   * A 16px icon. Takes its colour from `tone`, so pass the glyph alone.
   */
  icon?: ReactNode;
  /** What is absent, in a line. Never an error, and never a code. */
  title: ReactNode;
  /**
   * What the absence means. One or two sentences, and the second one is usually
   * the one that matters: whether this is ordinary or temporary.
   */
  children?: ReactNode;
  /**
   * What would end the absence, when that is a thing somebody can do. Controls,
   * and a sentence beside them is normal here rather than exceptional.
   */
  actions?: ReactNode;
  /**
   * A block below a hairline, for the longer form of "the way back". Used where
   * the step is a sequence rather than a button.
   */
  footer?: ReactNode;
  /**
   * Colours the icon and the title, and nothing else.
   *
   * `idle` where the absence is the ordinary case, which is most of them.
   * `locked` where the capability exists in the product and not on this
   * instance, which is the one case a reader is likely to mistake for a fault.
   */
  tone?: Extract<Status, "idle" | "locked" | "warn">;
  className?: string;
}

const tones: Record<NonNullable<AbsenceProps["tone"]>, { icon: string; title: string }> = {
  idle: { icon: "text-fg-tertiary", title: "text-fg" },
  locked: { icon: "text-locked", title: "text-locked" },
  warn: { icon: "text-warn", title: "text-warn-ink" },
};

export function Absence({
  icon,
  title,
  children,
  actions,
  footer,
  tone = "idle",
  className,
}: AbsenceProps) {
  const colours = tones[tone];

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-(--radius-lg) border border-dashed border-(--gc-border-subtle) bg-inset px-[18px] py-4",
        className,
      )}
    >
      {icon === undefined ? null : (
        <div className={cn("mt-px shrink-0 [&>svg]:size-4", colours.icon)}>{icon}</div>
      )}
      <div className="min-w-0 flex-1">
        <p className={cn("text-xs font-medium", colours.title)}>{title}</p>
        {children === undefined ? null : (
          <div className="mt-1 max-w-[92ch] space-y-1.5 text-2xs text-fg-tertiary">{children}</div>
        )}
        {actions === undefined ? null : (
          <div className="mt-[11px] flex flex-wrap items-center gap-2">{actions}</div>
        )}
        {footer === undefined ? null : (
          <div className="mt-3 border-t border-(--gc-border-hairline) pt-3">{footer}</div>
        )}
      </div>
    </div>
  );
}
