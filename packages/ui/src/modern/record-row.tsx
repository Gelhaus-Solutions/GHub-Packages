import type { ReactNode } from "react";
import { cn } from "../cn.js";

/**
 * The list primitive. Sessions, addresses, applications, members, invoices and
 * payment methods are all this.
 *
 * Four slots and no more, which is the whole design: a list that grows a fifth
 * slot on one screen stops being the same object, and the two lists then drift
 * until a customer finds the difference.
 *
 * **The whole row is never a link. The action is.** A row-wide click target
 * takes the name, the meta and the status into the link's accessible name, so a
 * screen reader announces the entire row as one string and the meta line, which
 * exists to be skimmed, becomes something a person has to listen through. It
 * also makes selecting text impossible and gives a keyboard user one stop where
 * the row offers one thing to do.
 */
export interface RecordRowProps {
  /**
   * Required as a STRING rather than a node, and that is the accessible-name
   * contract rather than a convenience.
   *
   * The name truncates with an ellipsis when it does not fit, so the visible
   * text is not the whole name, and the full string has to reach assistive
   * technology some other way. A `ReactNode` here could not be read back out to
   * put in `title`, so the truncation would silently lose the tail for exactly
   * the people who cannot see that it was cut.
   */
  name: string;
  /** Sits beside the name, for a state the name itself cannot carry. */
  chip?: ReactNode;
  /** One line, wraps to a second. Provenance, location, last use. */
  meta?: ReactNode;
  /**
   * Optional and usually absent: a row with nothing wrong shows no dot.
   *
   * Absent rather than a neutral dot, because a column of dots that are all
   * fine trains the eye to skip the column, which is the one place the eye must
   * not skip.
   */
  status?: ReactNode;
  /** At most one, and it is the only interactive thing in the row. */
  action?: ReactNode;
  className?: string;
}

export function RecordRow({ name, chip, meta, status, action, className }: RecordRowProps) {
  return (
    <div
      className={cn(
        "flex min-h-16 items-center gap-4 rounded-m-panel bg-m-plate px-[18px] py-4",
        // Hover is a film over the material rather than a step to the next
        // surface token, and only where there is something to press. A row that
        // reacts to a pointer and then does nothing is a promise it cannot keep.
        action === undefined ? "" : "hover:bg-m-hover",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          {/*
           * `title` carries what the ellipsis takes away. The visible text is
           * the same string, so a sighted reader and a screen reader are being
           * told the same thing rather than two different ones.
           */}
          <span className="truncate text-m-body text-m-ink" title={name}>
            {name}
          </span>
          {chip === undefined ? null : <span className="shrink-0">{chip}</span>}
        </div>
        {meta === undefined ? null : <p className="mt-1 text-m-meta text-m-ink-3">{meta}</p>}
      </div>
      {/*
       * Both hold their width. The row has to survive 390px, and it does that
       * by letting the NAME give way rather than the status or the action: a
       * truncated name is still recognisable, a truncated verb is not.
       */}
      {status === undefined ? null : <div className="shrink-0">{status}</div>}
      {action === undefined ? null : <div className="shrink-0">{action}</div>}
    </div>
  );
}
